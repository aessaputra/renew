import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import net from 'node:net';
import http from 'node:http';
import https from 'node:https';
import { generateKeyPairSync, randomBytes, sign } from 'node:crypto';

// Subscriptions integration: real build + mock HTTPS OIDC (login only) +
// mock HTTP Wallos. No production contact. TLS verification stays enabled.

// ---------- fixtures (in-memory Wallos state) ----------
interface Fixture {
	subscriptions: Array<Record<string, unknown>>;
	categories: Array<Record<string, unknown>>;
	paymentMethods: Array<Record<string, unknown>>;
	currencies: Array<Record<string, unknown>>;
	lastPost: Record<string, string> | null;
}

const SECRET = 'wallos-test-key';

function fixtures(): Fixture {
	return {
		subscriptions: [
			{
				id: 1,
				name: 'Fixture One',
				logo: '',
				price: 9.99,
				currency_id: 1,
				next_payment: '2026-10-01',
				cycle: 3,
				frequency: 1,
				notes: 'note one',
				payment_method_id: 1,
				payer_user_id: 1,
				category_id: 1,
				notify: 1,
				url: '',
				inactive: 0,
				notify_days_before: 7,
				user_id: 1,
				cancellation_date: '',
				replacement_subscription_id: null,
				start_date: '2026-01-01',
				auto_renew: 1,
				logo_text_color: null,
				logo_variant: null,
				category_name: 'Video',
				payer_user_name: 'Owner',
				payment_method_name: 'Card'
			},
			{
				id: 2,
				name: 'Fixture Two',
				logo: '',
				price: 4.5,
				currency_id: 1,
				next_payment: '2026-11-05',
				cycle: 4,
				frequency: 3,
				notes: '',
				payment_method_id: 2,
				payer_user_id: 1,
				category_id: 2,
				notify: 0,
				url: '',
				inactive: 0,
				notify_days_before: 0,
				user_id: 1,
				cancellation_date: '',
				replacement_subscription_id: null,
				start_date: '2026-02-01',
				auto_renew: 0,
				logo_text_color: null,
				logo_variant: null,
				category_name: 'Music',
				payer_user_name: 'Owner',
				payment_method_name: 'Cash'
			}
		],
		categories: [
			{ id: 1, name: 'Video', order: 1, in_use: 1 },
			{ id: 2, name: 'Music', order: 2, in_use: 1 }
		],
		paymentMethods: [
			{ id: 1, name: 'Card', icon: '', enabled: 1, order: 1, in_use: 1 },
			{ id: 2, name: 'Cash', icon: '', enabled: 1, order: 2, in_use: 1 }
		],
		currencies: [
			{ id: 1, name: 'Euro', symbol: '€', code: 'EUR', rate: 1, in_use: 1 },
			{ id: 2, name: 'Dollar', symbol: '$', code: 'USD', rate: 1.1, in_use: 1 }
		],
		lastPost: null
	};
}

const F = fixtures();
let upstreamMode: 'normal' | 'unavailable' | 'redirect' = 'normal';

// Minimal multipart parser (undici FormData only; test-controlled input).
function parseMultipart(body: string, boundary: string): Record<string, string> {
	const out: Record<string, string> = {};
	for (const part of body.split(`--${boundary}`)) {
		const m = part.match(/name="([^"]+)"\r\n\r\n([\s\S]*?)\r\n?$/);
		if (m) out[m[1]] = m[2].replace(/\r\n$/, '');
	}
	return out;
}

function wallosHandler(req: http.IncomingMessage, res: http.ServerResponse): void {
	const url = new URL(req.url ?? '/', 'http://x');
	const json = (code: number, obj: unknown): void => {
		res.writeHead(code, { 'content-type': 'application/json' });
		res.end(JSON.stringify(obj));
	};
	if (req.method === 'GET' && url.searchParams.get('apiKey') !== SECRET) {
		json(401, { success: false, title: 'Invalid API key' });
		return;
	}
	if (upstreamMode === 'unavailable') { json(503, { success: false, title: 'private upstream failure' }); return; }
	if (upstreamMode === 'redirect') { res.writeHead(307, { location: '/unexpected-redirect' }); res.end(); return; }
	const path = url.pathname;
	if (req.method === 'GET' && path.endsWith('get_subscriptions.php')) {
		json(200, { success: true, title: 'ok', subscriptions: F.subscriptions, notes: [] });
		return;
	}
	if (req.method === 'GET' && path.endsWith('get_subscription.php')) {
		const sub = F.subscriptions.find((s) => String(s.id) === url.searchParams.get('id'));
		if (!sub) json(200, { success: false, title: 'Subscription not found' });
		else json(200, { success: true, title: 'ok', subscription: sub, notes: [] });
		return;
	}
	if (req.method === 'GET' && path.endsWith('get_categories.php')) {
		json(200, { success: true, title: 'ok', categories: F.categories, notes: [] });
		return;
	}
	if (req.method === 'GET' && path.endsWith('get_payment_methods.php')) {
		json(200, { success: true, title: 'ok', payment_methods: F.paymentMethods, notes: [] });
		return;
	}
	if (req.method === 'GET' && path.endsWith('get_currencies.php')) {
		json(200, {
			success: true,
			title: 'ok',
			main_currency: 1,
			currencies: F.currencies,
			notes: []
		});
		return;
	}
	if (req.method === 'POST' && path.endsWith('set_subscriptions.php')) {
		const chunks: Buffer[] = [];
		req.on('data', (c) => chunks.push(c as Buffer));
		req.on('end', () => {
			const ct = req.headers['content-type'] ?? '';
			const b = /boundary=([^\s;]+)/.exec(ct)?.[1] ?? '';
			const fields = parseMultipart(Buffer.concat(chunks).toString('utf8'), b);
			F.lastPost = fields;
			if (fields.api_key !== SECRET) {
				json(401, { success: false, title: 'Invalid API key' });
				return;
			}
			if (fields.action === 'add') {
				if (!fields.name || !fields.price) {
					json(200, { success: false, title: 'Missing parameters' });
					return;
				}
				const id = Math.max(...F.subscriptions.map((s) => s.id as number)) + 1;
				F.subscriptions.push({
					id,
					name: fields.name,
					logo: '',
					price: Number(fields.price),
					currency_id: Number(fields.currency_id ?? 1),
					next_payment: fields.next_payment ?? '',
					cycle: Number(fields.cycle ?? 3),
					frequency: Number(fields.frequency ?? 1),
					notes: fields.notes ?? '',
					payment_method_id: Number(fields.payment_method_id ?? 0),
					payer_user_id: 1,
					category_id: Number(fields.category_id ?? 0),
					notify: Number(fields.notify ?? 0),
					url: fields.url ?? '',
					inactive: 0,
					notify_days_before: Number(fields.notify_days_before ?? 0),
					user_id: 1,
					cancellation_date: '',
					replacement_subscription_id: null,
					start_date: '',
					auto_renew: 0,
					logo_text_color: null,
					logo_variant: null,
					category_name: '',
					payer_user_name: 'Owner',
					payment_method_name: ''
				});
				json(200, { success: true, title: 'added' });
				return;
			}
			if (fields.action === 'edit') {
				const sub = F.subscriptions.find((s) => String(s.id) === fields.id);
				if (!sub) {
					json(200, { success: false, title: 'Subscription not found' });
					return;
				}
				for (const k of ['name', 'price', 'next_payment', 'notes', 'url'] as const) {
					if (fields[k] !== undefined) {
						sub[k] =
							k === 'price' ? Number(fields[k]) : fields[k];
					}
				}
				json(200, { success: true, title: 'updated' });
				return;
			}
			if (fields.action === 'delete') {
				const idx = F.subscriptions.findIndex((s) => String(s.id) === fields.id);
				if (idx < 0) {
					json(200, { success: false, title: 'Subscription not found' });
					return;
				}
				F.subscriptions.splice(idx, 1);
				json(200, { success: true, title: 'deleted' });
				return;
			}
			json(200, { success: false, title: 'Invalid action' });
		});
		return;
	}
	res.writeHead(404);
	res.end('not found');
}

// ---------- minimal OIDC mock (login only) ----------
const CLIENT_ID = 'test-client';
const CLIENT_SECRET = 'test-secret';
const OWNER_SUB = 'owner-sub';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const JWK = {
	...(publicKey.export({ format: 'jwk' }) as Record<string, string>),
	kid: 'test-key',
	alg: 'RS256',
	use: 'sig'
};

let ISSUER = '';
const codes = new Map<string, string>();
const b64url = (buf: Buffer): string => buf.toString('base64url');

function mintJwt(nonce: string): string {
	const header = b64url(Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'test-key' })));
	const now = Math.floor(Date.now() / 1000);
	const payload = b64url(
		Buffer.from(
			JSON.stringify({
				iss: ISSUER,
				aud: CLIENT_ID,
				sub: OWNER_SUB,
				iat: now,
				exp: now + 300,
				nonce
			})
		)
	);
	const data = `${header}.${payload}`;
	return `${data}.${b64url(sign('RSA-SHA256', Buffer.from(data), privateKey))}`;
}

function oidcHandler(req: http.IncomingMessage, res: http.ServerResponse): void {
	const url = new URL(req.url ?? '/', ISSUER);
	const json = (obj: unknown): void => {
		res.writeHead(200, { 'content-type': 'application/json' });
		res.end(JSON.stringify(obj));
	};
	if (url.pathname === '/.well-known/openid-configuration') {
		json({
			issuer: ISSUER,
			authorization_endpoint: `${ISSUER}/auth`,
			token_endpoint: `${ISSUER}/token`,
			jwks_uri: `${ISSUER}/jwks`,
			response_types_supported: ['code'],
			token_endpoint_auth_methods_supported: ['client_secret_post']
		});
		return;
	}
	if (url.pathname === '/jwks') {
		json({ keys: [JWK] });
		return;
	}
	if (url.pathname === '/auth') {
		const code = randomBytes(16).toString('base64url');
		codes.set(code, url.searchParams.get('nonce') ?? '');
		const back = new URL(url.searchParams.get('redirect_uri') ?? '');
		back.searchParams.set('code', code);
		back.searchParams.set('state', url.searchParams.get('state') ?? '');
		res.writeHead(302, { location: back.toString() });
		res.end();
		return;
	}
	if (url.pathname === '/token') {
		const chunks: Buffer[] = [];
		req.on('data', (c) => chunks.push(c as Buffer));
		req.on('end', () => {
			const body = new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
			const nonce = codes.get(body.get('code') ?? '') ?? '';
			json({
				access_token: 't',
				token_type: 'Bearer',
				expires_in: 300,
				id_token: mintJwt(nonce)
			});
		});
		return;
	}
	res.writeHead(404);
	res.end('not found');
}

// ---------- harness ----------
type Jar = Map<string, string>;
interface Resp {
	status: number;
	headers: Record<string, string | string[] | undefined>;
	body: string;
}

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
				headers: { accept: 'text/html', ...(opts.headers ?? {}), ...(cookie ? { cookie } : {}) }
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

function proxyHandler(appPort: number, proxyPort: number) {
	return (cReq: http.IncomingMessage, cRes: http.ServerResponse) => {
		const chunks: Buffer[] = [];
		cReq.on('data', (c) => chunks.push(c as Buffer));
		cReq.on('end', () => {
			const headers: Record<string, string | string[] | undefined> = { ...cReq.headers };
			// Tell adapter-node the public authority so SvelteKit's CSRF
			// origin check compares Origin against the proxy origin.
			// Host header must carry no port when PORT_HEADER is set, else the
			// adapter builds origin with double port (Kit 3 get_origin).
			headers.host = `127.0.0.1:${appPort}`;
			headers['x-forwarded-host'] = '127.0.0.1';
			headers['x-forwarded-proto'] = 'https';
			headers['x-forwarded-port'] = String(proxyPort);
			delete headers.connection;
			const fwd = http.request(
				{ host: '127.0.0.1', port: appPort, path: cReq.url, method: cReq.method, headers },
				(upRes) => {
					const bufs: Buffer[] = [];
					upRes.on('data', (c) => bufs.push(c as Buffer));
					upRes.on('end', () => {
						const h: Record<string, string | string[]> = {};
						for (const [k, v] of Object.entries(upRes.headers)) if (v !== undefined) h[k] = v;
						cRes.writeHead(upRes.statusCode ?? 502, h);
						cRes.end(Buffer.concat(bufs));
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

function freePort(): Promise<number> {
	return new Promise((resolve) => {
		const s = net.createServer();
		s.listen(0, '127.0.0.1', () => {
			const port = (s.address() as net.AddressInfo).port;
			s.close(() => resolve(port));
		});
	});
}

function spawnApp(envExtra: Record<string, string>, port: number): ChildProcess {
	return spawn('node', ['build'], {
		cwd: new URL('..', import.meta.url).pathname,
		env: { ...process.env, HOST: '127.0.0.1', PORT: String(port), ...envExtra },
		stdio: ['ignore', 'pipe', 'pipe']
	});
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
		new Promise<boolean>((resolve) => child.on('exit', () => resolve(true))),
		new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 5000))
	]);
	if (!exited) child.kill('SIGKILL');
}

let tmp = '';
let certFile = '';
let ORIGIN = '';
let mockOidc: https.Server;
let wallos: http.Server;
let proxy: https.Server;
let app: ChildProcess;
const jar: Jar = new Map();

before(async () => {
	tmp = mkdtempSync(join(tmpdir(), 'renew-subs-test-'));
	const keyFile = join(tmp, 'key.pem');
	certFile = join(tmp, 'cert.pem');
	writeFileSync(join(tmp, 'marker'), 'x');
	const ssl = spawnSync('openssl', [
		'req', '-x509', '-newkey', 'rsa:2048', '-keyout', keyFile, '-out', certFile,
		'-days', '2', '-nodes', '-subj', '/CN=localhost',
		'-addext', 'subjectAltName=IP:127.0.0.1,DNS:localhost'
	]);
	if (ssl.status !== 0) throw new Error('openssl required');
	const key = readFileSync(keyFile, 'utf8');
	const cert = readFileSync(certFile, 'utf8');

	mockOidc = https.createServer({ key, cert }, oidcHandler);
	await new Promise<void>((r) => mockOidc.listen(0, '127.0.0.1', r));
	ISSUER = `https://127.0.0.1:${(mockOidc.address() as net.AddressInfo).port}`;

	wallos = http.createServer(wallosHandler);
	await new Promise<void>((r) => wallos.listen(0, '127.0.0.1', r));
	const wallosBase = `http://127.0.0.1:${(wallos.address() as net.AddressInfo).port}`;

	const appPort = await freePort();
	const proxyPort = await freePort();
	const proxySrv = https.createServer({ key, cert }, proxyHandler(appPort, proxyPort));
	await new Promise<void>((r) => proxySrv.listen(proxyPort, '127.0.0.1', r));
	proxy = proxySrv;
	ORIGIN = `https://127.0.0.1:${(proxy.address() as net.AddressInfo).port}`;

	app = spawnApp(
		{
			ORIGIN,
			OIDC_ISSUER: ISSUER,
			OIDC_CLIENT_ID: CLIENT_ID,
			OIDC_CLIENT_SECRET: CLIENT_SECRET,
			OIDC_ALLOWED_SUB: OWNER_SUB,
			SESSION_SECRET: 'subs-suite-session-secret-0123456789abcdef',
			WALLOS_BASE_URL: wallosBase,
			WALLOS_API_KEY: SECRET,
			NODE_EXTRA_CA_CERTS: certFile,
			PROTOCOL_HEADER: 'x-forwarded-proto',
			HOST_HEADER: 'x-forwarded-host',
			PORT_HEADER: 'x-forwarded-port'
		},
		appPort
	);
	await waitReady(ORIGIN, certFile);

	// Login once for the suite.
	const login = await request(`${ORIGIN}/auth/login`, {
		method: 'POST',
		headers: { origin: ORIGIN },
		ca: certFile,
		jar
	});
	assert.equal(login.status, 303);
	const authorize = await request(login.headers.location as string, { ca: certFile, jar: new Map() });
	assert.equal(authorize.status, 302);
	const cb = await request(authorize.headers.location as string, { ca: certFile, jar });
	assert.equal(cb.status, 303);
});

after(async () => {
	await Promise.allSettled([stopChild(app)]);
	await Promise.allSettled([
		new Promise((r) => mockOidc.close(r)),
		new Promise((r) => wallos.close(r)),
		new Promise((r) => proxy.close(r))
	]);
	rmSync(tmp, { recursive: true, force: true });
});

describe('subscriptions gate', () => {
	it('anonymous dashboard redirects to /login', async () => {
		const r = await request(`${ORIGIN}/`, { ca: certFile, jar: new Map() });
		assert.equal(r.status, 303);
		assert.equal(r.headers.location, '/login');
	});

	it('anonymous detail redirects to /login', async () => {
		const r = await request(`${ORIGIN}/subscriptions/1`, { ca: certFile, jar: new Map() });
		assert.equal(r.status, 303);
	});
});

describe('subscriptions list', () => {
	it('renders fixture names with no key leak', async () => {
		const r = await request(`${ORIGIN}/`, { ca: certFile, jar });
		assert.equal(r.status, 200);
		assert.match(r.body, /Fixture One/);
		assert.match(r.body, /Fixture Two/);
		assert.match(r.body, /EUR/);
		assert.doesNotMatch(r.body, /apiKey/);
		assert.doesNotMatch(r.body, /api_key/);
		assert.doesNotMatch(r.body, new RegExp(SECRET));
	});

	it('prefixes list titles with category and shows only payment in metadata', async () => {
		const r = await request(`${ORIGIN}/`, { ca: certFile, jar });
		assert.equal(r.status, 200);
		const list = r.body.match(/<ul aria-label="Subscriptions"[^>]*>[\s\S]*?<\/ul>/)?.[0] ?? '';
		assert.ok(list.length > 0, 'subscriptions list');
		assert.match(list, /\[Video\] Fixture One/);
		assert.match(list, /\[Music\] Fixture Two/);
		assert.doesNotMatch(list, /Video · Card/);
		assert.doesNotMatch(list, /Music · Cash/);
		assert.equal((list.match(/Video/g) ?? []).length, 1);
		assert.equal((list.match(/Music/g) ?? []).length, 1);
		assert.match(list, />Card</);
		assert.match(list, />Cash</);
	});

	it('omits category prefix when absent and labels empty payment metadata', async () => {
		const previous = F.subscriptions[0];
		try {
			F.subscriptions[0] = { ...previous, category_name: '', payment_method_name: '' };
			const r = await request(`${ORIGIN}/`, { ca: certFile, jar });
			assert.equal(r.status, 200);
			const list = r.body.match(/<ul aria-label="Subscriptions"[^>]*>[\s\S]*?<\/ul>/)?.[0] ?? '';
			assert.ok(list.length > 0, 'subscriptions list');
			assert.doesNotMatch(list, /\[\] Fixture One/);
			assert.ok(list.includes('>Fixture One<'));
			const item = list.match(/<li>[\s\S]*?Fixture One[\s\S]*?<\/li>/)?.[0] ?? '';
			assert.ok(item.length > 0, 'fixture row');
			assert.doesNotMatch(item, /text-muted-foreground">\s*(?:\[|\])/);
			assert.match(item, />No payment method</);
		} finally { F.subscriptions[0] = previous; }
	});

	it('streams full reference lists for client-side filter menus', async () => {
		const prevCats = F.categories;
		const prevPays = F.paymentMethods;
		try {
			F.categories = [...prevCats, { id: 99, name: 'Unused Category', order: 3, in_use: 0 }];
			F.paymentMethods = [...prevPays, { id: 99, name: 'Unused Pay', icon: '', enabled: 1, order: 3, in_use: 0 }];
			const r = await request(`${ORIGIN}/`, { ca: certFile, jar });
			assert.equal(r.status, 200);
			const catsPayload = r.body.match(/resolve\(1,\s*\(\)\s*=>\s*(\[\[[\s\S]*?\]\])/)?.[1] ?? '';
			const paysPayload = r.body.match(/resolve\(2,\s*\(\)\s*=>\s*(\[\[[\s\S]*?\]\])/)?.[1] ?? '';
			assert.ok(catsPayload.length > 0, 'streamed categories');
			assert.ok(paysPayload.length > 0, 'streamed payment methods');
			// Server men-stream referensi mentah apa adanya; penyaringan ke yang
			// terpakai dilakukan client setelah hydrate (lihat stream-refs.test.ts).
			assert.match(catsPayload, /Video/);
			assert.match(catsPayload, /Unused Category/);
			assert.match(paysPayload, /Card/);
			assert.match(paysPayload, /Unused Pay/);
		} finally { F.categories = prevCats; F.paymentMethods = prevPays; }
	});
});

describe('subscription detail', () => {
	it('places formatted price beside the name and shares it with home', async () => {
		const previous = F.subscriptions[0];
		const currency = F.currencies[0];
		try {
			F.subscriptions[0] = { ...previous, price: 36000 };
			F.currencies[0] = { ...currency, code: 'IDR' };
			const detail = await request(`${ORIGIN}/subscriptions/1`, { ca: certFile, jar });
			assert.equal(detail.status, 200);
			assert.match(detail.body, /<h1[^>]*>Fixture One<\/h1>\s*<p[^>]*tabular-nums[^>]*><span class="sr-only">Price:\s*<\/span>Rp\u00a036\.000<\/p>/);
			assert.ok(detail.body.indexOf('Rp\u00a036.000') < detail.body.indexOf('<dl class="billing-grid"'));
			const home = await request(`${ORIGIN}/`, { ca: certFile, jar });
			assert.equal(home.status, 200);
			assert.ok(home.body.includes('Rp\u00a036.000'));
		} finally { F.subscriptions[0] = previous; F.currencies[0] = currency; }
	});
	it('renders one human-readable billing interval without raw cycle or frequency labels', async () => {
		const previous = F.subscriptions[0];
		try {
			for (const [cycle, frequency, expected] of [
				[1, 1, 'Every day'], [1, 3, 'Every 3 days'],
				[2, 1, 'Every week'], [2, 2, 'Every 2 weeks'],
				[3, 1, 'Every month'], [3, 3, 'Every 3 months'],
				[4, 1, 'Every year'], [4, 2, 'Every 2 years'],
				[0, 1, 'Not set'], [5, 1, 'Not set'], [2.5, 1, 'Not set'],
				[3, 0, 'Not set'], [3, -1, 'Not set'], [3, 1.5, 'Not set']
			] as const) {
				F.subscriptions[0] = { ...previous, cycle, frequency };
				const r = await request(`${ORIGIN}/subscriptions/1`, { ca: certFile, jar });
				assert.equal(r.status, 200);
				const billing = r.body.match(/<dl class="billing-grid">[\s\S]*?<\/dl>/)?.[0] ?? '';
				assert.equal((billing.match(/>Billing interval<\/dt>/g) ?? []).length, 1);
				assert.match(billing, new RegExp(`>Billing interval</dt>\\s*<dd[^>]*>${expected}</dd>`));
				assert.doesNotMatch(billing, />(?:Cycle|Frequency)<\/dt>/);
			}
		} finally { F.subscriptions[0] = previous; }
	});

	it('renders fields and edit/delete controls', async () => {
		const r = await request(`${ORIGIN}/subscriptions/1`, { ca: certFile, jar });
		assert.equal(r.status, 200);
		assert.match(r.body, /Fixture One/);
		assert.match(r.body, /9\.99/);
		assert.match(r.body, /\/subscriptions\/1\/edit/);
		assert.match(r.body, /Delete/);
	});

	it('unknown id renders 404', async () => {
		const r = await request(`${ORIGIN}/subscriptions/999`, { ca: certFile, jar });
		assert.equal(r.status, 404);
	});

	it('non-numeric id renders 404', async () => {
		const r = await request(`${ORIGIN}/subscriptions/abc`, { ca: certFile, jar });
		assert.equal(r.status, 404);
	});
});

describe('upstream boundary', () => {
	it('maps outages and redirects to safe 503 responses', async () => {
		try {
			for (const mode of ['unavailable', 'redirect'] as const) {
				upstreamMode = mode;
				const r = await request(`${ORIGIN}/`, { ca: certFile, jar });
				assert.equal(r.status, 503);
				assert.doesNotMatch(r.body, /private upstream failure|wallos-test-key/);
			}
		} finally { upstreamMode = 'normal'; }
	});

	it('renders unsupported URLs as inert text and strips unknown private fields', async () => {
		const previous = F.subscriptions[0];
		try {
			for (const url of ['javascript:alert(1)', 'ftp://example.com', 'data:text/html,test']) {
				F.subscriptions[0] = { ...previous, url, api_key: SECRET, password: 'upstream-private-marker' };
				const r = await request(`${ORIGIN}/subscriptions/1`, { ca: certFile, jar });
				assert.equal(r.status, 200);
				assert.ok(r.body.includes(url));
				assert.doesNotMatch(r.body, /href="(?:javascript:|ftp:|data:)|upstream-private-marker|wallos-test-key/);
			}
			F.subscriptions[0] = { ...previous, url: 'https://example.com' };
			const r = await request(`${ORIGIN}/subscriptions/1`, { ca: certFile, jar });
			assert.match(r.body, /href="https:\/\/example\.com\/"/);
			assert.match(r.body, /target="_blank"/);
			assert.match(r.body, /rel="noopener"/);
		} finally { F.subscriptions[0] = previous; }
	});

	it('rejects duplicate subscription IDs before rendering the list', async () => {
		const previous = F.subscriptions;
		F.subscriptions = [...previous, { ...previous[0], name: 'Duplicate ID' }];
		try {
			const r = await request(`${ORIGIN}/`, { ca: certFile, jar });
			assert.equal(r.status, 500);
			assert.doesNotMatch(r.body, /Duplicate ID|each_key_duplicate|wallos-test-key/);
		} finally { F.subscriptions = previous; }
	});

	it('rejects malformed subscription payloads instead of hiding rows', async () => {
		const previous = F.subscriptions[0];
		F.subscriptions[0] = { ...previous, name: 42 };
		try {
			const r = await request(`${ORIGIN}/`, { ca: certFile, jar });
			assert.equal(r.status, 500);
		} finally { F.subscriptions[0] = previous; }
	});
});

describe('mobile list semantics', () => {
  it('renders search with icon filter menus', async () => {
    const r = await request(`${ORIGIN}/`, { ca: certFile, jar });
    assert.equal(r.status, 200);
    assert.doesNotMatch(r.body, /<label[^>]*for="subscription-search"[^>]*>\s*Search subscriptions\s*<\/label>/);
    assert.match(r.body, /aria-label="Search subscriptions"/);
    assert.ok(r.body.includes('id="subscription-search"'));
    // Referensi di-stream: SSR awal me-render skeleton pending + chunk resolve,
    // menu details baru muncul setelah JS client jalan. Template details
    // dijamin oleh stream-refs.test.ts (source assertion).
    assert.match(r.body, /Loading filters…/);
    assert.match(r.body, /resolve\(1,/);
    assert.match(r.body, /resolve\(2,/);
    assert.match(r.body, /aria-label="Subscriptions"/);
    assert.match(r.body, /Next payment/);
  });
});

describe('mobile detail actions', () => {
  it('offers price beside the title with edit below billing and delete in a dialog', async () => {
    const r = await request(`${ORIGIN}/subscriptions/1`, { ca: certFile, jar });
    assert.equal(r.status, 200);
    const billing = r.body.indexOf('<dl class="billing-grid"');
    const billingEnd = r.body.indexOf('</dl>');
    const edit = r.body.indexOf('href="/subscriptions/1/edit"');
    const dialog = r.body.indexOf('<dialog');
    assert.ok(billing >= 0 && billingEnd > billing && edit > billingEnd && dialog > edit);
    assert.match(r.body, /<div class="detail-actions">\s*<a[^>]*>Edit<\/a>\s*<button/);
    assert.match(r.body, /<dialog[^>]*aria-labelledby="delete-dialog-title"/);
    assert.match(r.body, /<h2[^>]*>Delete Fixture One \?<\/h2>/);
    assert.match(r.body, /This permanently deletes this subscription\. This cannot be undone\./);
    assert.doesNotMatch(r.body, /Delete Fixture One permanently/);
    assert.match(r.body, /<form method="POST" action="\/subscriptions\/1\?\/delete"/);
    assert.match(r.body, /<input[^>]*type="hidden"[^>]*name="confirm"[^>]*value="yes"/);
    assert.match(r.body, /<form method="dialog"/);
  });
});

it('captures local fixture pages for responsive review', async () => {
  const out = process.env.RENEW_UI_CAPTURE_DIR;
  if (!out) return;
  mkdirSync(out, { recursive: true });
  const pages = [
    ['/', 'list'],
    ['/subscriptions/1', 'detail'],
    ['/subscriptions/new', 'new'],
    ['/subscriptions/1/edit', 'edit'],
    ['/login', 'login'],
    ['/subscriptions/999', 'error']
  ];
  for (const [path, name] of pages) {
    const r = await request(`${ORIGIN}${path}`, {
      ca: certFile,
      jar: path === '/login' ? new Map() : jar
    });
    assert.equal(r.status, name === 'error' ? 404 : 200);
    assert.ok(!r.body.includes(SECRET));
    let html = r.body.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
    for (const match of html.matchAll(/<link\b[^>]*href="([^"]+\.css)"[^>]*>/g)) {
      const css = await request(new URL(match[1], ORIGIN).href, { ca: certFile, jar });
      assert.equal(css.status, 200);
      html = html.replace(match[0], `<style>${css.body}</style>`);
    }
    html = html.replace(/<form\b/g, '<form onsubmit="return false"');
    writeFileSync(join(out, `${name}.html`), html);
  }
});

describe('billing interval form', () => {
	it('defaults only fresh add to every one month and retains existing edit values', async () => {
		for (const [path, frequency, cycle] of [['new', '1', '3'], ['2/edit', '3', '4']]) {
			const r = await request(`${ORIGIN}/subscriptions/${path}`, { ca: certFile, jar });
			assert.equal(r.status, 200);
			assert.match(r.body, new RegExp(`<input name="frequency"[^>]*value="${frequency}"`));
			const select = r.body.match(/<select name="cycle"[^>]*>[\s\S]*?<\/select>/)?.[0] ?? '';
			assert.match(select, new RegExp(`<option value="${cycle}" selected`));
		}
	});
	for (const [path, action] of [['new', 'create'], ['2/edit', 'update']]) {
		it(`retains submitted interval after native ${action} validation errors`, async () => {
			for (const [frequency, cycle] of [['2', '2'], ['', ''], ['0', '5'], ['1.5', '0']]) {
				const r = await request(`${ORIGIN}/subscriptions/${path}?/${action}`, {
					method: 'POST', headers: { origin: ORIGIN, 'content-type': 'application/x-www-form-urlencoded' },
					body: new URLSearchParams({ name: 'Interval draft', price: '-5', frequency, cycle }).toString(),
					ca: certFile, jar
				});
				assert.equal(r.status, 400);
				assert.match(r.body, new RegExp(`<input name="frequency"[^>]*value="${frequency}"`));
				const select = r.body.match(/<select name="cycle"[^>]*>[\s\S]*?<\/select>/)?.[0] ?? '';
				assert.match(select, new RegExp(`<option value="${cycle}" selected`));
				assert.match(r.body, /role="alert"/);
				assert.match(r.body, /name="name"[^>]*value="Interval draft"/);
			}
		});
	}
	for (const path of ['new', '2/edit']) {
		it(`renders one accessible native interval on ${path}`, async () => {
			const r = await request(`${ORIGIN}/subscriptions/${path}`, { ca: certFile, jar });
			assert.equal(r.status, 200);
			assert.equal((r.body.match(/>Billing interval</g) ?? []).length, 1);
			assert.match(r.body, /role="group" aria-labelledby="billing-interval"/);
			assert.match(r.body, /<span[^>]*>Every<\/span>/);
			assert.match(r.body, /<label[^>]*>[\s\S]*?Repeat every[\s\S]*?<input name="frequency"/);
			assert.match(r.body, /<label[^>]*>[\s\S]*?Period unit[\s\S]*?<select name="cycle"/);
			const input = r.body.match(/<input name="frequency"[^>]*>/)?.[0] ?? '';
			for (const attr of ['type="number"', 'min="1"', 'step="1"', 'inputmode="numeric"', 'required']) assert.ok(input.includes(attr), attr);
			const select = r.body.match(/<select name="cycle"[^>]*>[\s\S]*?<\/select>/)?.[0] ?? '';
			for (const [value, text] of [['1', 'Days'], ['2', 'Weeks'], ['3', 'Months'], ['4', 'Years']]) {
				assert.match(select, new RegExp(`<option value="${value}"[^>]*>${text}</option>`));
			}
			assert.doesNotMatch(r.body, />\s*(?:Frequency|Cycle)\s*</);
			assert.doesNotMatch(r.body, /Cycle: 1 Days|per Wallos|frequency-help/);
			assert.match(r.body, /<form method="POST"/);
		});
	}
});

describe('subscription mutations', () => {
	it('preserves unsupported URLs for editing and requires correction or clearing on save', async () => {
		const previous = F.subscriptions[0];
		const previousPost = F.lastPost;
		try {
			for (const url of ['ftp://example.com', 'javascript:alert(1)']) {
				F.subscriptions[0] = { ...previous, url };
				const edit = await request(`${ORIGIN}/subscriptions/1/edit`, { ca: certFile, jar });
				assert.equal(edit.status, 200);
				assert.ok(edit.body.includes(`name="url"`));
				assert.ok(edit.body.includes(`value="${url}"`));
				assert.doesNotMatch(edit.body, /href="(?:ftp:|javascript:)/);
				const r = await request(`${ORIGIN}/subscriptions/1/edit?/update`, {
					method: 'POST',
					headers: { origin: ORIGIN, 'content-type': 'application/x-www-form-urlencoded' },
					body: new URLSearchParams({
						name: 'Unrelated edit', price: '9.99', currency_id: '1', frequency: '1', cycle: '3',
						next_payment: '2026-10-01', url
					}).toString(),
					ca: certFile, jar
				});
				assert.equal(r.status, 400);
				assert.match(r.body, /URL must start with http\(s\):\/\//);
				assert.ok(r.body.includes(`name="url"`));
				assert.ok(r.body.includes(`value="${url}"`));
				assert.equal(F.lastPost, previousPost);
				assert.equal(F.subscriptions[0].url, url);
			}
			for (const url of ['https://example.com', '']) {
				const r = await request(`${ORIGIN}/subscriptions/1/edit?/update`, {
					method: 'POST',
					headers: { origin: ORIGIN, 'content-type': 'application/x-www-form-urlencoded' },
					body: new URLSearchParams({
						name: 'Corrected edit', price: '9.99', currency_id: '1', frequency: '1', cycle: '3',
						next_payment: '2026-10-01', url
					}).toString(),
					ca: certFile, jar
				});
				assert.equal(r.status, 303);
				assert.equal(F.lastPost?.url, url);
				assert.equal(F.subscriptions[0].url, url);
			}
		} finally { F.subscriptions[0] = previous; F.lastPost = previousPost; }
	});

	for (const [path, action] of [['new', 'create'], ['1/edit', 'update']]) {
		it(`preserves native ${action} POST values during a full upstream outage without hiding GET failures`, async () => {
			const previousPost = F.lastPost;
			upstreamMode = 'unavailable';
			try {
				for (const price of ['13.25', '-5']) {
					const r = await request(`${ORIGIN}/subscriptions/${path}?/${action}`, {
						method: 'POST',
						headers: { origin: ORIGIN, 'content-type': 'application/x-www-form-urlencoded' },
						body: new URLSearchParams({
							name: 'Retained draft', price, currency_id: '2', frequency: '2', cycle: '4',
							next_payment: '2026-12-20', category_id: '2', payment_method_id: '2',
							notify_days_before: '0', url: 'https://example.com/draft', notes: 'Retained notes',
							unknown: 'untrusted-extra-marker'
						}).toString(),
						ca: certFile, jar
					});
					assert.equal(r.status, price === '-5' ? 400 : 503);
					assert.match(r.body, price === '-5' ? /Price must be a non-negative number/ : /Service unavailable/);
					assert.match(r.body, /Reference data is unavailable/);
					assert.match(r.body, /name="name"[^>]*value="Retained draft"/);
					assert.ok(r.body.includes(`value="${price}"`));
					for (const [field, value] of [['frequency', '2'], ['next_payment', '2026-12-20'], ['notify_days_before', '0'], ['url', 'https://example.com/draft']]) {
						assert.match(r.body, new RegExp(`name="${field}"[^>]*value="${value}"`));
					}
					assert.match(r.body, /<select name="cycle"[^>]*>[\s\S]*?<option value="4" selected/);
					for (const field of ['currency_id', 'category_id', 'payment_method_id']) {
						assert.match(r.body, new RegExp(`<select name="${field}"[^>]*>[\\s\\S]*?<option value="2" selected`));
					}
					assert.match(r.body, /<textarea name="notes"[^>]*>Retained notes<\/textarea>/);
					assert.doesNotMatch(r.body, /<input[^>]*name="notify"[^>]*checked/);
					assert.doesNotMatch(r.body, /private upstream failure|wallos-test-key|untrusted-extra-marker/);
					assert.equal(F.lastPost, previousPost);
				}
				const get = await request(`${ORIGIN}/subscriptions/${path}`, { ca: certFile, jar });
				assert.equal(get.status, 503);
				assert.doesNotMatch(get.body, /Retained draft|Reference data is unavailable/);
			} finally { upstreamMode = 'normal'; }
		});
	}

	it('requires delete confirmation and surfaces the error', async () => {
		const previous = F.lastPost;
		const r = await request(`${ORIGIN}/subscriptions/2?/delete`, {
			method: 'POST', headers: { origin: ORIGIN, 'content-type': 'application/x-www-form-urlencoded' },
			body: '', ca: certFile, jar
		});
		assert.equal(r.status, 400);
		assert.match(r.body, /Confirm deletion first/);
		assert.equal(F.lastPost, previous);
	});

	it('creates via form action and lists the new row', async () => {
		const body = new URLSearchParams({
			name: 'Added Sub',
			price: '3.50',
			currency_id: '1',
			frequency: '1',
			cycle: '3',
			next_payment: '2026-12-01'
		}).toString();
		const r = await request(`${ORIGIN}/subscriptions/new?/create`, {
			method: 'POST',
			headers: { origin: ORIGIN, 'content-type': 'application/x-www-form-urlencoded' },
			body,
			ca: certFile,
			jar
		});
		assert.equal(r.status, 303, JSON.stringify({ status: r.status, hasErrors: r.body.includes('Service unavailable'), validation: r.body.includes('Price must'), hasSave: r.body.includes('Save'), postReceived: F.lastPost !== null }));
		assert.equal(F.lastPost?.action, 'add');
		assert.equal(F.lastPost?.name, 'Added Sub');
		const list = await request(`${ORIGIN}/`, { ca: certFile, jar });
		assert.match(list.body, /Added Sub/);
	});

	it('rejects invalid input with 400 and preserves values', async () => {
		const body = new URLSearchParams({ name: 'Bad', price: '-5' }).toString();
		const r = await request(`${ORIGIN}/subscriptions/new?/create`, {
			method: 'POST',
			headers: { origin: ORIGIN, 'content-type': 'application/x-www-form-urlencoded' },
			body,
			ca: certFile,
			jar
		});
		assert.equal(r.status, 400);
		assert.match(r.body, /Price must be a non-negative number/);
	});

	it('rejects wrong origin with 403', async () => {
		const body = new URLSearchParams({
			name: 'Evil',
			price: '1',
			currency_id: '1',
			frequency: '1',
			cycle: '3',
			next_payment: '2026-12-01'
		}).toString();
		const r = await request(`${ORIGIN}/subscriptions/new?/create`, {
			method: 'POST',
			headers: { origin: 'https://evil.example', 'content-type': 'application/x-www-form-urlencoded' },
			body,
			ca: certFile,
			jar
		});
		assert.equal(r.status, 403);
	});

	it('edits and redirects to detail', async () => {
		const body = new URLSearchParams({
			name: 'Fixture One Edited',
			price: '11.00',
			currency_id: '1',
			frequency: '1',
			cycle: '3',
			next_payment: '2026-10-01'
		}).toString();
		const r = await request(`${ORIGIN}/subscriptions/1/edit?/update`, {
			method: 'POST',
			headers: { origin: ORIGIN, 'content-type': 'application/x-www-form-urlencoded' },
			body,
			ca: certFile,
			jar
		});
		assert.equal(r.status, 303);
		assert.equal(F.lastPost?.action, 'edit');
		const detail = await request(`${ORIGIN}/subscriptions/1`, { ca: certFile, jar });
		assert.match(detail.body, /Fixture One Edited/);
	});

	it('deletes and removes the row', async () => {
		const r = await request(`${ORIGIN}/subscriptions/2?/delete`, {
			method: 'POST',
			headers: { origin: ORIGIN, 'content-type': 'application/x-www-form-urlencoded' },
			body: 'confirm=yes',
			ca: certFile,
			jar
		});
		assert.equal(r.status, 303);
		assert.equal(F.lastPost?.action, 'delete');
		const list = await request(`${ORIGIN}/`, { ca: certFile, jar });
		assert.doesNotMatch(list.body, /Fixture Two/);
	});
});
