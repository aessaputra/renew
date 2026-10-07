import { createHmac, timingSafeEqual } from 'node:crypto';

export const TRANSACTION_TTL_MS = 5 * 60 * 1000;
export const SESSION_IDLE_MS = 7 * 24 * 60 * 60 * 1000;
export const SESSION_ABSOLUTE_MS = 30 * 24 * 60 * 60 * 1000;
export const SESSION_REFRESH_THRESHOLD_MS = 24 * 60 * 60 * 1000;
const CLOCK_SKEW_MS = 60 * 1000;
// ponytail: stateless signed cookies are the ceiling for single-owner;
// add a shared store only for server-side revocation or multi-user sessions.

export interface Transaction {
	state: string;
	nonce: string;
	codeVerifier: string;
	expiresAt: number;
}

export interface Session {
	sub: string;
	issuedAt: number;
	expiresAt: number;
}

export interface SessionRefresh {
	id: string;
	session: Session;
}

function signingKey(): Buffer | null {
	// ponytail: process.env keeps this importable by node:test; $app/env/private only resolves inside SvelteKit build.
	const raw = process.env.SESSION_SECRET ?? '';
	if (!raw) return null;
	const key = Buffer.from(raw, 'utf8');
	return key.length >= 32 ? key : null;
}

function sign(data: string, key: Buffer): string {
	return createHmac('sha256', key).update(data, 'utf8').digest('base64url');
}

function verify(data: string, sig: string, key: Buffer): boolean {
	const actual = Buffer.from(sig, 'utf8');
	const expected = Buffer.from(sign(data, key), 'utf8');
	return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function validTokenInput(value: unknown): value is string {
	return typeof value === 'string' && value.length > 0;
}

export function isValidCookieId(id: string): boolean {
	if (typeof id !== 'string' || id.length === 0 || id.length > 2048) return false;
	return /^[A-Za-z0-9_.-]+$/.test(id);
}

export function createTransaction(
	input: Omit<Transaction, 'expiresAt'>,
	now: number = Date.now()
): { id: string; transaction: Transaction } | null {
	const key = signingKey();
	if (
		!key ||
		!validTokenInput(input.state) ||
		!validTokenInput(input.nonce) ||
		!validTokenInput(input.codeVerifier)
	) {
		return null;
	}
	const transaction: Transaction = { ...input, expiresAt: now + TRANSACTION_TTL_MS };
	const payload = Buffer.from(
		JSON.stringify({ s: input.state, n: input.nonce, v: input.codeVerifier, e: transaction.expiresAt }),
		'utf8'
	).toString('base64url');
	const body = `t1.${payload}`;
	return { id: `${body}.${sign(body, key)}`, transaction };
}

export function consumeTransaction(id: string, now: number = Date.now()): Transaction | null {
	if (!isValidCookieId(id)) return null;
	const key = signingKey();
	if (!key) return null;
	const parts = id.split('.');
	if (parts.length !== 3 || parts[0] !== 't1') return null;
	const body = `t1.${parts[1]}`;
	if (!verify(body, parts[2], key)) return null;
	let obj: { s?: unknown; n?: unknown; v?: unknown; e?: unknown };
	try {
		obj = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
	} catch {
		return null;
	}
	if (!validTokenInput(obj.s) || !validTokenInput(obj.n) || !validTokenInput(obj.v)) return null;
	if (!Number.isSafeInteger(obj.e) || now >= (obj.e as number)) return null;
	return { state: obj.s, nonce: obj.n, codeVerifier: obj.v, expiresAt: obj.e as number };
}

export function createSession(sub: string, now: number = Date.now()): { id: string; session: Session } | null {
	const key = signingKey();
	if (!key || typeof sub !== 'string' || sub.length === 0) return null;
	const session: Session = { sub, issuedAt: now, expiresAt: now + SESSION_IDLE_MS };
	const body = `s2.${Buffer.from(sub, 'utf8').toString('base64url')}.${session.issuedAt}.${session.expiresAt}`;
	return { id: `${body}.${sign(body, key)}`, session };
}

export function getSession(id: string, now: number = Date.now()): Session | null {
	if (!isValidCookieId(id)) return null;
	const key = signingKey();
	if (!key) return null;
	const parts = id.split('.');
	if (parts.length !== 5 || parts[0] !== 's2') return null;
	const body = `s2.${parts[1]}.${parts[2]}.${parts[3]}`;
	if (!verify(body, parts[4], key)) return null;
	const issuedAt = Number(parts[2]);
	const expiresAt = Number(parts[3]);
	if (!Number.isSafeInteger(issuedAt) || !Number.isSafeInteger(expiresAt)) return null;
	if (issuedAt > now + CLOCK_SKEW_MS || now >= expiresAt) return null;
	if (now >= issuedAt + SESSION_ABSOLUTE_MS) return null;
	let decoded: string;
	try {
		decoded = Buffer.from(parts[1], 'base64url').toString('utf8');
	} catch {
		return null;
	}
	const sub = decoded;
	if (!sub) return null;
	return { sub, issuedAt, expiresAt };
}

export function maybeRefreshSession(
	id: string,
	now: number = Date.now()
): { session: Session; refresh: SessionRefresh | null } | null {
	const session = getSession(id, now);
	if (!session) return null;
	if (session.expiresAt - now >= SESSION_REFRESH_THRESHOLD_MS) return { session, refresh: null };
	if (session.issuedAt + SESSION_ABSOLUTE_MS - now < SESSION_IDLE_MS) return { session, refresh: null };
	const key = signingKey();
	if (!key) return null;
	const refreshed: Session = { sub: session.sub, issuedAt: session.issuedAt, expiresAt: now + SESSION_IDLE_MS };
	const body = `s2.${Buffer.from(refreshed.sub, 'utf8').toString('base64url')}.${refreshed.issuedAt}.${refreshed.expiresAt}`;
	return { session, refresh: { id: `${body}.${sign(body, key)}`, session: refreshed } };
}

export function isAllowedSubject(sub: string | null | undefined, allowedSub: string): boolean {
	return typeof sub === 'string' && sub.length > 0 && sub === allowedSub;
}

export function isValidOrigin(origin: string | null, expected: string): boolean {
	return typeof origin === 'string' && origin.length > 0 && origin === expected;
}

export function isValidHttpsOrigin(value: string, allowLoopbackHttp: boolean): boolean {
	let url: URL;
	try {
		url = new URL(value);
	} catch {
		return false;
	}
	if (url.username || url.password || url.search || url.hash) return false;
	if (url.pathname !== '/' && url.pathname !== '') return false;
	if (url.protocol === 'https:') return true;
	if (allowLoopbackHttp && url.protocol === 'http:') {
		return url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '::1';
	}
	return false;
}

export function isValidIssuer(value: string): boolean {
	let url: URL;
	try {
		url = new URL(value);
	} catch {
		return false;
	}
	if (url.protocol !== 'https:') return false;
	if (url.search || url.hash || url.username || url.password) return false;
	return true;
}
