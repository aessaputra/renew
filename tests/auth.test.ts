import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import net from 'node:net';
import http from 'node:http';
import https from 'node:https';
import { createHash, generateKeyPairSync, randomBytes, sign } from 'node:crypto';

// Integration tests: real adapter-node build + local mock HTTPS OIDC provider.
// No production Pocket ID/Wallos contact. TLS verification stays enabled;
// the test CA is passed via file + `ca` option, never by disabling checks.

const CLIENT_ID = 'test-client';
const CLIENT_SECRET = 'test-secret';
const OWNER_SUB = 'owner-sub';

const b64url = (buf: Buffer): string => buf.toString('base64url');
const rand = (n: number): string => randomBytes(n).toString('base64url');

// --- RSA keys for ID tokens (synthetic, test-only) ---
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const { privateKey: otherKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const JWK = {
	...(publicKey.export({ format: 'jwk' }) as Record<string, string>),
	kid: 'test-key',
	alg: 'RS256',
	use: 'sig'
};

let ISSUER = '';
let ORIGIN = '';

function mintJwt(opts: {
	sub: string;
	nonce: string;
	iss?: string;
	aud?: string;
	expInSec?: number;
	kid?: string;
	key?: typeof privateKey;
}): string {
	const header = b64url(Buffer.from(JSON.stringify({ alg: 'RS256', kid: opts.kid ?? 'test-key', typ: 'JWT' })));
	const now = Math.floor(Date.now() / 1000);
	const payload = b64url(
		Buffer.from(
			JSON.stringify({
				iss: opts.iss ?? ISSUER,
				aud: opts.aud ?? CLIENT_ID,
				sub: opts.sub,
				iat: now,
				exp: now + (opts.expInSec ?? 300),
				nonce: opts.nonce
			})
		)
	);
	const data = `${header}.${payload}`;
	return `${data}.${b64url(sign('RSA-SHA256', Buffer.from(data), opts.key ?? privateKey))}`;
}

// --- Mock OIDC provider state ---
interface CodeRec {
	nonce: string;
	redirectUri: string;
	challenge: string;
	test: string;
	used: boolean;
}
const codes = new Map<string, CodeRec>();

function readBody(req: http.IncomingMessage): Promise<string> {
	return new Promise((resolve, reject) => {
		const chunks: Buffer[] = [];
		req.on('data', (c) => chunks.push(c as Buffer));
		req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
		req.on('error', reject);
	});
}

function json(res: http.ServerResponse, status: number, body: unknown): void {
	const text = JSON.stringify(body);
	res.writeHead(status, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(text) });
	res.end(text);
}

async function mockHandler(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
	const url = new URL(req.url ?? '/', ISSUER);
	if (req.method === 'GET' && url.pathname === '/.well-known/openid-configuration') {
		json(res, 200, {
			issuer: ISSUER,
			authorization_endpoint: `${ISSUER}/authorize`,
			token_endpoint: `${ISSUER}/token`,
			jwks_uri: `${ISSUER}/jwks`,
			response_types_supported: ['code'],
			subject_types_supported: ['public'],
			id_token_signing_alg_values_supported: ['RS256'],
			token_endpoint_auth_methods_supported: ['client_secret_post', 'client_secret_basic'],
			code_challenge_methods_supported: ['S256']
		});
		return;
	}
	if (req.method === 'GET' && url.pathname === '/jwks') {
		json(res, 200, { keys: [JWK] });
		return;
	}
	if (req.method === 'GET' && url.pathname === '/authorize') {
		const q = url.searchParams;
		const redirectUri = q.get('redirect_uri') ?? '';
		if (
			q.get('client_id') !== CLIENT_ID ||
			q.get('response_type') !== 'code' ||
			!redirectUri.startsWith('https://127.0.0.1:') ||
			!(q.get('scope') ?? '').split(' ').includes('openid') ||
			!q.get('state') ||
			!q.get('nonce') ||
			!q.get('code_challenge') ||
			q.get('code_challenge_method') !== 'S256'
		) {
			res.writeHead(400);
			res.end('bad request');
			return;
		}
		const code = rand(16);
		codes.set(code, {
			nonce: q.get('nonce')!,
			redirectUri,
			challenge: q.get('code_challenge')!,
			test: q.get('test') ?? 'ok',
			used: false
		});
		res.writeHead(302, { location: `${redirectUri}?code=${code}&state=${q.get('state')}` });
		res.end();
		return;
	}
	if (req.method === 'POST' && url.pathname === '/token') {
		const body = new URLSearchParams(await readBody(req));
		const basic = req.headers.authorization ?? '';
		const basicOk =
			basic === `Basic ${Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64')}`;
		const postOk = body.get('client_id') === CLIENT_ID && body.get('client_secret') === CLIENT_SECRET;
		if (!basicOk && !postOk) {
			res.writeHead(401);
			res.end('bad client auth');
			return;
		}
		if (body.get('grant_type') !== 'authorization_code') {
			json(res, 400, { error: 'unsupported_grant_type' });
			return;
		}
		const rec = codes.get(body.get('code') ?? '');
		if (!rec || rec.used) {
			json(res, 400, { error: 'invalid_grant' });
			return;
		}
		rec.used = true;
		if (body.get('redirect_uri') !== rec.redirectUri) {
			json(res, 400, { error: 'invalid_grant' });
			return;
		}
		const verifier = body.get('code_verifier') ?? '';
		if (b64url(createHash('sha256').update(verifier, 'utf8').digest()) !== rec.challenge) {
			json(res, 400, { error: 'invalid_grant' });
			return;
		}
		let idToken: string;
		switch (rec.test) {
			case 'badsub':
				idToken = mintJwt({ sub: 'intruder', nonce: rec.nonce });
				break;
			case 'wrongnonce':
				idToken = mintJwt({ sub: OWNER_SUB, nonce: 'wrong' });
				break;
			case 'badissuer':
				idToken = mintJwt({ sub: OWNER_SUB, nonce: rec.nonce, iss: 'https://127.0.0.1:1' });
				break;
			case 'badaudience':
				idToken = mintJwt({ sub: OWNER_SUB, nonce: rec.nonce, aud: 'other-client' });
				break;
			case 'expired':
				idToken = mintJwt({ sub: OWNER_SUB, nonce: rec.nonce, expInSec: -300 });
				break;
			case 'badsig':
				idToken = mintJwt({ sub: OWNER_SUB, nonce: rec.nonce, kid: 'other-key', key: otherKey });
				break;
			default:
				idToken = mintJwt({ sub: OWNER_SUB, nonce: rec.nonce });
		}
		json(res, 200, { access_token: 'test-access', token_type: 'Bearer', expires_in: 300, id_token: idToken });
		return;
	}
	res.writeHead(404);
	res.end('not found');
}

// --- HTTPS proxy: forwards to loopback adapter-node so Secure cookies are real ---
function proxyHandler(appPort: number) {
	return (cReq: http.IncomingMessage, cRes: http.ServerResponse) => {
		const chunks: Buffer[] = [];
		cReq.on('data', (c) => chunks.push(c as Buffer));
		cReq.on('end', () => {
			const headers: Record<string, string | string[] | undefined> = { ...cReq.headers };
			headers.host = `127.0.0.1:${appPort}`;
			delete headers.connection;
			const fwd = http.request(
				{ host: '127.0.0.1', port: appPort, path: cReq.url, method: cReq.method, headers },
				(upRes) => {
					const bufs: Buffer[] = [];
					upRes.on('data', (c) => bufs.push(c as Buffer));
					upRes.on('end', () => {
						const out = Buffer.concat(bufs);
						const h: Record<string, string | string[]> = {};
						for (const [k, v] of Object.entries(upRes.headers)) if (v !== undefined) h[k] = v;
						cRes.writeHead(upRes.statusCode ?? 502, h);
						cRes.end(out);
					});
				}
			);
			fwd.on('error', () => {
				cRes.writeHead(502);
				cRes.end();
			});
			const body = Buffer.concat(chunks);
			if (body.length) fwd.write(body);
			fwd.end();
		});
	};
}

// --- Minimal HTTPS client with cookie jar, no auto-redirect ---
interface Resp {
	status: number;
	headers: Record<string, string | string[] | undefined>;
	body: string;
}

type Jar = Map<string, string>;

function storeCookies(jar: Jar, headers: Resp['headers']): void {
	const set = headers['set-cookie'];
	if (!set) return;
	for (const line of Array.isArray(set) ? set : [set]) {
		const pair = line.split(';')[0];
		const eq = pair.indexOf('=');
		if (eq <= 0) continue;
		const name = pair.slice(0, eq).trim();
		const value = pair.slice(eq + 1).trim();
		if (!value || value.toLowerCase() === 'deleted') jar.delete(name);
		else jar.set(name, value);
	}
}

function request(
	urlStr: string,
	opts: { method?: string; headers?: Record<string, string>; body?: string; ca: string; jar: Jar }
): Promise<Resp> {
	return new Promise((resolve, reject) => {
		const url = new URL(urlStr);
		const cookie = [...opts.jar].map(([k, v]) => `${k}=${v}`).join('; ');
		const req = https.request(
			{
				host: url.hostname,
				port: Number(url.port),
				path: `${url.pathname}${url.search}`,
				method: opts.method ?? 'GET',
				ca: readFileSync(opts.ca, 'utf8'),
				headers: { ...(opts.headers ?? {}), ...(cookie ? { cookie } : {}) }
			},
			(res) => {
				const bufs: Buffer[] = [];
				res.on('data', (c) => bufs.push(c as Buffer));
				res.on('end', () => {
					const headers: Resp['headers'] = {};
					for (const [k, v] of Object.entries(res.headers)) headers[k] = v;
					storeCookies(opts.jar, headers);
					resolve({ status: res.statusCode ?? 0, headers, body: Buffer.concat(bufs).toString('utf8') });
				});
			}
		);
		req.on('error', reject);
		if (opts.body) req.write(opts.body);
		req.end();
	});
}

function freePort(): Promise<number> {
	return new Promise((resolve) => {
		const s = net.createServer();
		s.listen(0, '127.0.0.1', () => {
			const port = (s.address() as net.AddressInfo).port;
			s.close(() => resolve(port));
		});
	});
}

function listenHttps(handler: http.RequestListener, key: string, cert: string): Promise<{ server: https.Server; port: number }> {
	return new Promise((resolve) => {
		const server = https.createServer({ key, cert }, handler);
		server.listen(0, '127.0.0.1', () => resolve({ server, port: (server.address() as net.AddressInfo).port }));
	});
}

function spawnApp(envExtra: Record<string, string>, port: number): ChildProcess {
	const child = spawn('node', ['build'], {
		cwd: new URL('..', import.meta.url).pathname,
		env: { ...process.env, HOST: '127.0.0.1', PORT: String(port), ...envExtra },
		stdio: ['ignore', 'pipe', 'pipe']
	});
	let stderr = '';
	child.stderr?.on('data', (c) => {
		stderr += String(c);
	});
	(child as ChildProcess & { lastStderr?: () => string }).lastStderr = () => stderr;
	return child;
}

async function waitReady(base: string, ca: string): Promise<void> {
	const deadline = Date.now() + 30000;
	for (;;) {
		try {
			const r = await request(`${base}/login`, { ca, jar: new Map() });
			if (r.status === 200 || r.status === 503) return;
		} catch {
			// not up yet
		}
		if (Date.now() > deadline) throw new Error(`app did not start at ${base}`);
		await new Promise((r) => setTimeout(r, 250));
	}
}

async function stopChild(child: ChildProcess): Promise<void> {
	child.kill('SIGTERM');
	const exited = await Promise.race([
		new Promise<boolean>((resolve) => {
			child.on('exit', () => resolve(true));
		}),
		new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 5000))
	]);
	if (!exited) child.kill('SIGKILL');
}

function close(server: { close: (cb: () => void) => void }): Promise<void> {
	return new Promise((resolve) => server.close(() => resolve()));
}

// Full login flow through proxy; `test` selects the mock token variant.
async function loginFlow(ca: string, jar: Jar, test = 'ok'): Promise<Resp> {
	const login = await request(`${ORIGIN}/auth/login`, {
		method: 'POST',
		headers: { origin: ORIGIN },
		ca,
		jar
	});
	assert.equal(login.status, 303);
	const authorizeUrl = new URL(login.headers.location as string);
	if (test !== 'ok') authorizeUrl.searchParams.set('test', test);
	const authorize = await request(authorizeUrl.toString(), { ca, jar: new Map() });
	assert.equal(authorize.status, 302);
	return request(authorize.headers.location as string, { ca, jar });
}

let tmp: string;
let certFile: string;
let mock: { server: https.Server; port: number };
let proxy: { server: https.Server; port: number };
let app: ChildProcess;
let emptyApp: ChildProcess;
let deadApp: ChildProcess;
let emptyBase: string;
let deadBase: string;
let wallosMock: http.Server;

before(async () => {
	tmp = mkdtempSync(join(tmpdir(), 'renew-auth-test-'));
	const keyFile = join(tmp, 'key.pem');
	certFile = join(tmp, 'cert.pem');
	const ssl = spawnSync('openssl', [
		'req',
		'-x509',
		'-newkey',
		'rsa:2048',
		'-keyout',
		keyFile,
		'-out',
		certFile,
		'-days',
		'2',
		'-nodes',
		'-subj',
		'/CN=localhost',
		'-addext',
		'subjectAltName=IP:127.0.0.1,DNS:localhost'
	]);
	if (ssl.status !== 0) throw new Error('openssl is required to generate loopback TLS fixtures');
	const key = readFileSync(keyFile, 'utf8');
	const cert = readFileSync(certFile, 'utf8');

	mock = await listenHttps((req, res) => void mockHandler(req, res), key, cert);
	ISSUER = `https://127.0.0.1:${mock.port}`;

	const appPort = await freePort();
	proxy = await listenHttps(proxyHandler(appPort), key, cert);
	ORIGIN = `https://127.0.0.1:${proxy.port}`;

	wallosMock = http.createServer((_req, res) => {
		res.writeHead(200, { 'content-type': 'application/json' });
		res.end(JSON.stringify({ success: true, subscriptions: [], categories: [], payment_methods: [], currencies: [] }));
	});
	await new Promise<void>((resolve) => wallosMock.listen(0, '127.0.0.1', resolve));

	app = spawnApp(
		{
			WALLOS_BASE_URL: `http://127.0.0.1:${(wallosMock.address() as net.AddressInfo).port}`,
			WALLOS_API_KEY: 'auth-suite-wallos-key',
			ORIGIN,
			OIDC_ISSUER: ISSUER,
			OIDC_CLIENT_ID: CLIENT_ID,
			OIDC_CLIENT_SECRET: CLIENT_SECRET,
			OIDC_ALLOWED_SUB: OWNER_SUB,
			NODE_EXTRA_CA_CERTS: certFile
		},
		appPort
	);
	await waitReady(ORIGIN, certFile);

	// Empty-config child: valid ORIGIN but no OIDC settings fail closed with 503.
	const emptyPort = await freePort();
	emptyApp = spawnApp({ ORIGIN: `http://127.0.0.1:${emptyPort}`, OIDC_ISSUER: '', OIDC_CLIENT_ID: '', OIDC_CLIENT_SECRET: '', OIDC_ALLOWED_SUB: '' }, emptyPort);
	// Not reachable over TLS (no proxy); talk plain HTTP to it directly instead.
	emptyBase = `http://127.0.0.1:${emptyPort}`;
	await waitReadyHttp(emptyBase);

	// Dead-provider child: discovery can never succeed.
	const deadPort = await freePort();
	const closedPort = await freePort();
	deadBase = `http://127.0.0.1:${deadPort}`;
	deadApp = spawnApp(
		{
			ORIGIN: 'https://127.0.0.1:1',
			OIDC_ISSUER: `https://127.0.0.1:${closedPort}`,
			OIDC_CLIENT_ID: CLIENT_ID,
			OIDC_CLIENT_SECRET: CLIENT_SECRET,
			OIDC_ALLOWED_SUB: OWNER_SUB,
			NODE_EXTRA_CA_CERTS: certFile
		},
		deadPort
	);
	await waitReadyHttp(deadBase);
});

async function waitReadyHttp(base: string): Promise<void> {
	const deadline = Date.now() + 30000;
	const url = new URL(`${base}/login`);
	for (;;) {
		try {
			const r: Resp = await new Promise((resolve, reject) => {
				const req = http.request(
					{ host: url.hostname, port: Number(url.port), path: url.pathname, method: 'GET' },
					(res) => {
						const bufs: Buffer[] = [];
						res.on('data', (c) => bufs.push(c as Buffer));
						res.on('end', () =>
							resolve({ status: res.statusCode ?? 0, headers: {}, body: Buffer.concat(bufs).toString('utf8') })
						);
					}
				);
				req.on('error', reject);
				req.end();
			});
			if (r.status === 200 || r.status === 503) return;
		} catch {
			// not up yet
		}
		if (Date.now() > deadline) throw new Error(`app did not start at ${base}`);
		await new Promise((r) => setTimeout(r, 250));
	}
}

async function plainRequest(base: string, path: string, opts: { method?: string; headers?: Record<string, string>; body?: string } = {}): Promise<Resp> {
	const url = new URL(`${base}${path}`);
	return new Promise((resolve, reject) => {
		const req = http.request(
			{ host: url.hostname, port: Number(url.port), path: `${url.pathname}${url.search}`, method: opts.method ?? 'GET', headers: opts.headers },
			(res) => {
				const bufs: Buffer[] = [];
				res.on('data', (c) => bufs.push(c as Buffer));
				res.on('end', () => {
					const headers: Resp['headers'] = {};
					for (const [k, v] of Object.entries(res.headers)) headers[k] = v;
					resolve({ status: res.statusCode ?? 0, headers, body: Buffer.concat(bufs).toString('utf8') });
				});
			}
		);
		req.on('error', reject);
		if (opts.body) req.write(opts.body);
		req.end();
	});
}

after(async () => {
	await Promise.allSettled([stopChild(app), stopChild(emptyApp), stopChild(deadApp)]);
	await Promise.allSettled([close(mock.server), close(proxy.server), close(wallosMock)]);
	rmSync(tmp, { recursive: true, force: true });
});

describe('route protection', () => {
	it('anonymous GET / redirects to /login with no-store', async () => {
		const r = await request(`${ORIGIN}/`, { ca: certFile, jar: new Map() });
		assert.equal(r.status, 303);
		assert.equal(r.headers.location, '/login');
		assert.equal(r.headers['cache-control'], 'no-store');
	});

	it('anonymous GET /offline is public for the PWA fallback', async () => {
		const r = await request(`${ORIGIN}/offline`, { ca: certFile, jar: new Map() });
		assert.equal(r.status, 200);
		assert.match(r.body, /You are offline/);
		assert.equal(r.headers['cache-control'], 'no-store');
	});

	it('api and json/mutation requests get 401, not redirects', async () => {
		const jar: Jar = new Map();
		const api = await request(`${ORIGIN}/api/subscriptions`, { ca: certFile, jar });
		assert.equal(api.status, 401);
		assert.match(api.body, /Sign in required\./);
		const jsonReq = await request(`${ORIGIN}/`, {
			ca: certFile,
			jar,
			headers: { accept: 'application/json' }
		});
		assert.equal(jsonReq.status, 401);
		const mutation = await request(`${ORIGIN}/`, { method: 'POST', ca: certFile, jar });
		assert.equal(mutation.status, 401);
	});
});

describe('login page copy', () => {
	it('renders Renew brand, English copy, and CTA', async () => {
		const r = await request(`${ORIGIN}/login`, { ca: certFile, jar: new Map() });
		assert.equal(r.status, 200);
		assert.match(r.body, /<html lang="en"/);
		assert.match(r.body, /Renew — Sign in/);
		assert.match(r.body, /Continue with OIDC/);
		assert.match(r.body, /Your subscriptions, in one place\./);
		assert.doesNotMatch(r.body, /role="alert"/);
		assert.equal(r.headers['cache-control'], 'no-store');
	});

	it('uses brand mark and alert error pattern', async () => {
		const r = await request(`${ORIGIN}/login`, { ca: certFile, jar: new Map() });
		assert.equal(r.status, 200);
		assert.match(r.body, /aria-label="Renew home"/);
		assert.doesNotMatch(r.body, /secure redirect|redirected securely|secure sign-in/i);
	});

	it('maps fixed error codes to safe messages', async () => {
		const cases: Array<[string, string]> = [
			['failed', "Couldn&#39;t sign in. Please try again.|Couldn't sign in. Please try again."],
			['denied', "This account can&#39;t access Renew.|This account can't access Renew."],
			['expired', 'Sign-in expired. Please try again.'],
			['unavailable', 'Sign-in is unavailable. Please try again later.']
		];
		for (const [code, message] of cases) {
			const r = await request(`${ORIGIN}/login?error=${code}`, { ca: certFile, jar: new Map() });
			assert.equal(r.status, 200);
			assert.match(r.body, new RegExp(message));
			assert.match(r.body, /role="alert"/);
		}
		const unknown = await request(`${ORIGIN}/login?error=../../x`, { ca: certFile, jar: new Map() });
		assert.match(unknown.body, /Please try again\./);
		assert.doesNotMatch(unknown.body, /\.\.\/\.\./);
	});
});

describe('login CSRF', () => {
	it('rejects POST without exact Origin', async () => {
		const jar: Jar = new Map();
		const missing = await request(`${ORIGIN}/auth/login`, { method: 'POST', ca: certFile, jar });
		assert.equal(missing.status, 403);
		const wrong = await request(`${ORIGIN}/auth/login`, {
			method: 'POST',
			headers: { origin: 'https://evil.example' },
			ca: certFile,
			jar
		});
		assert.equal(wrong.status, 403);
		assert.match(wrong.body, /Request not allowed\./);
	});

	it('keeps redirect_uri anchored to ORIGIN despite forwarded headers', async () => {
		const r = await request(`${ORIGIN}/auth/login`, {
			method: 'POST',
			headers: { origin: ORIGIN, 'x-forwarded-host': 'evil.example' },
			ca: certFile,
			jar: new Map()
		});
		assert.equal(r.status, 303);
		const target = new URL(r.headers.location as string);
		assert.equal(target.searchParams.get('redirect_uri'), `${ORIGIN}/auth/callback`);
	});
});

describe('oidc flow', () => {
	it('happy path issues a session and shows home', async () => {
		const jar: Jar = new Map();
		const cb = await loginFlow(certFile, jar);
		assert.equal(cb.status, 303);
		assert.equal(cb.headers.location, '/');
		assert.ok(jar.get('renew_session'), 'session cookie issued');
		assert.ok(!jar.get('renew_oidc'), 'transaction cookie cleared');
		const home = await request(`${ORIGIN}/`, { ca: certFile, jar });
		assert.equal(home.status, 200);
		assert.match(home.body, /Subscriptions/);
		assert.match(home.body, /Sign out/);
		assert.match(home.body, /No subscriptions yet\./);
	});

	it('other identity is denied without a session', async () => {
		const jar: Jar = new Map();
		const cb = await loginFlow(certFile, jar, 'badsub');
		assert.equal(cb.status, 303);
		assert.equal(cb.headers.location, '/login?error=denied');
		assert.ok(!jar.get('renew_session'));
		const home = await request(`${ORIGIN}/`, { ca: certFile, jar });
		assert.equal(home.status, 303);
		assert.equal(home.headers.location, '/login');
	});

	it('replay without a transaction cookie is expired', async () => {
		const jar: Jar = new Map();
		const cb = await loginFlow(certFile, jar);
		assert.equal(cb.status, 303);
		// Same callback URL again, transaction already consumed and cookie cleared.
		const replay = await request(`${ORIGIN}/auth/callback?code=reused&state=reused`, {
			ca: certFile,
			jar: new Map()
		});
		assert.equal(replay.status, 303);
		assert.equal(replay.headers.location, '/login?error=expired');
	});

	it('negative token variants fail without a session', async () => {
		for (const variant of ['wrongnonce', 'badsig', 'badissuer', 'badaudience', 'expired']) {
			const jar: Jar = new Map();
			const cb = await loginFlow(certFile, jar, variant);
			assert.equal(cb.status, 303, variant);
			assert.equal(cb.headers.location, '/login?error=failed', variant);
			assert.ok(!jar.get('renew_session'), variant);
		}
	});
});

describe('logout', () => {
	it('GET does not mutate, POST ends the session idempotently', async () => {
		const jar: Jar = new Map();
		await loginFlow(certFile, jar);
		const get = await request(`${ORIGIN}/auth/logout`, { ca: certFile, jar });
		assert.equal(get.status, 405);
		const stillIn = await request(`${ORIGIN}/`, { ca: certFile, jar });
		assert.equal(stillIn.status, 200);

		const noOrigin = await request(`${ORIGIN}/auth/logout`, { method: 'POST', ca: certFile, jar });
		assert.equal(noOrigin.status, 403);

		const out = await request(`${ORIGIN}/auth/logout`, {
			method: 'POST',
			headers: { origin: ORIGIN },
			ca: certFile,
			jar
		});
		assert.equal(out.status, 303);
		assert.equal(out.headers.location, '/login');
		const after = await request(`${ORIGIN}/`, { ca: certFile, jar });
		assert.equal(after.status, 303);
		assert.equal(after.headers.location, '/login');
		const again = await request(`${ORIGIN}/auth/logout`, {
			method: 'POST',
			headers: { origin: ORIGIN },
			ca: certFile,
			jar: new Map()
		});
		assert.equal(again.status, 303);
	});
});

describe('fail-closed configuration', () => {
	it('empty config returns 503 on private routes and login POST', async () => {
		const priv = await plainRequest(emptyBase, '/');
		assert.equal(priv.status, 503);
		const loginPage = await plainRequest(emptyBase, '/login');
		assert.equal(loginPage.status, 200);
		const post = await plainRequest(emptyBase, '/auth/login', { method: 'POST', headers: { origin: '' } });
		assert.equal(post.status, 503);
	});

	it('unreachable provider returns 503 on login', async () => {
		writeFileSync(join(tmp, 'keepalive'), 'x');
		const post = await plainRequest(deadBase, '/auth/login', {
			method: 'POST',
			headers: { origin: 'https://127.0.0.1:1' }
		});
		assert.equal(post.status, 503);
	});
});
