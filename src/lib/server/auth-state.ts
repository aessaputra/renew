import { createHash, randomBytes } from 'node:crypto';

export const TRANSACTION_TTL_MS = 5 * 60 * 1000;
export const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
export const MAX_TRANSACTIONS = 100;
export const MAX_SESSIONS = 10;
export const COOKIE_ID_BYTES = 32;

export interface Transaction {
	state: string;
	nonce: string;
	codeVerifier: string;
	expiresAt: number;
}

export interface Session {
	sub: string;
	expiresAt: number;
}

const transactions = new Map<string, Transaction>();
const sessions = new Map<string, Session>();

let cleanupTimer: ReturnType<typeof setInterval> | undefined;

function digest(id: string): string {
	return createHash('sha256').update(id, 'utf8').digest('hex');
}

export function isValidCookieId(id: string): boolean {
	if (typeof id !== 'string' || id.length === 0 || id.length > 256) return false;
	return /^[A-Za-z0-9_-]+$/.test(id);
}

export function prune(now: number = Date.now()): void {
	for (const [key, value] of transactions) {
		if (now >= value.expiresAt) transactions.delete(key);
	}
	for (const [key, value] of sessions) {
		if (now >= value.expiresAt) sessions.delete(key);
	}
}

function ensureCleanupTimer(): void {
	// ponytail: single-process in-memory state is the ceiling; upgrade to a
	// shared store (e.g. Redis/database) if replicas or restart-persistent sessions are needed.
	if (cleanupTimer) return;
	cleanupTimer = setInterval(prune, 60_000);
	// setInterval returns a Timeout in Node but a number under DOM libs; guard the call.
	(cleanupTimer as unknown as { unref?: () => void }).unref?.();
}

export function dispose(): void {
	if (cleanupTimer) {
		clearInterval(cleanupTimer);
		cleanupTimer = undefined;
	}
}

export function reset(): void {
	transactions.clear();
	sessions.clear();
	dispose();
}

export function newCookieId(): string {
	return randomBytes(COOKIE_ID_BYTES).toString('base64url');
}

export function createTransaction(
	input: Omit<Transaction, 'expiresAt'>,
	now: number = Date.now()
): { id: string; transaction: Transaction } | null {
	prune(now);
	ensureCleanupTimer();
	if (transactions.size >= MAX_TRANSACTIONS) return null;
	const id = newCookieId();
	const transaction: Transaction = { ...input, expiresAt: now + TRANSACTION_TTL_MS };
	transactions.set(digest(id), transaction);
	return { id, transaction };
}

export function consumeTransaction(id: string, now: number = Date.now()): Transaction | null {
	if (!isValidCookieId(id)) return null;
	const key = digest(id);
	const transaction = transactions.get(key);
	transactions.delete(key);
	if (!transaction || now >= transaction.expiresAt) return null;
	return transaction;
}

export function deleteTransaction(id: string): void {
	if (!isValidCookieId(id)) return;
	transactions.delete(digest(id));
}

export function createSession(sub: string, now: number = Date.now()): { id: string; session: Session } | null {
	if (typeof sub !== 'string' || sub.length === 0) return null;
	prune(now);
	ensureCleanupTimer();
	if (sessions.size >= MAX_SESSIONS) return null;
	const id = newCookieId();
	const session: Session = { sub, expiresAt: now + SESSION_TTL_MS };
	sessions.set(digest(id), session);
	return { id, session };
}

export function getSession(id: string, now: number = Date.now()): Session | null {
	if (!isValidCookieId(id)) return null;
	const key = digest(id);
	const session = sessions.get(key);
	if (!session || now >= session.expiresAt) {
		if (session) sessions.delete(key);
		return null;
	}
	return session;
}

export function deleteSession(id: string): void {
	if (!isValidCookieId(id)) return;
	sessions.delete(digest(id));
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
