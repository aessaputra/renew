import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
	createSession,
	createTransaction,
	consumeTransaction,
	deleteSession,
	deleteTransaction,
	dispose,
	getSession,
	isAllowedSubject,
	isValidCookieId,
	isValidHttpsOrigin,
	isValidIssuer,
	isValidOrigin,
	newCookieId,
	prune,
	reset,
	MAX_SESSIONS,
	MAX_TRANSACTIONS,
	SESSION_TTL_MS,
	TRANSACTION_TTL_MS
} from '../src/lib/server/auth-state.ts';

const TX = () => ({ state: 's', nonce: 'n', codeVerifier: 'v' });

beforeEach(() => reset());
afterEach(() => reset());

describe('cookie ids', () => {
	it('newCookieId is unique base64url', () => {
		const a = newCookieId();
		const b = newCookieId();
		assert.notEqual(a, b);
		assert.ok(isValidCookieId(a));
		assert.equal(isValidCookieId(''), false);
		assert.equal(isValidCookieId('a'.repeat(257)), false);
		assert.equal(isValidCookieId('bad id!'), false);
	});
});

describe('transactions', () => {
	it('create/consume roundtrip, single-use', () => {
		const created = createTransaction(TX(), 1000);
		assert.ok(created);
		assert.equal(created.transaction.expiresAt, 1000 + TRANSACTION_TTL_MS);
		const got = consumeTransaction(created.id, 1000);
		assert.deepEqual(got, created.transaction);
		assert.equal(consumeTransaction(created.id, 1000), null);
	});

	it('expired transaction is invalid', () => {
		const created = createTransaction(TX(), 1000)!;
		assert.equal(consumeTransaction(created.id, 1000 + TRANSACTION_TTL_MS), null);
	});

	it('invalid id format never matches', () => {
		createTransaction(TX(), 1000);
		assert.equal(consumeTransaction('!!!', 1000), null);
	});

	it('deleteTransaction removes entry', () => {
		const created = createTransaction(TX(), 1000)!;
		deleteTransaction(created.id);
		assert.equal(consumeTransaction(created.id, 1000), null);
		deleteTransaction('!!!'); // no throw
	});

	it('capacity bounded, prune frees expired', () => {
		for (let i = 0; i < MAX_TRANSACTIONS; i++) assert.ok(createTransaction(TX(), 1000));
		assert.equal(createTransaction(TX(), 1000), null);
		prune(1000 + TRANSACTION_TTL_MS);
		assert.ok(createTransaction(TX(), 1000 + TRANSACTION_TTL_MS));
	});
});

describe('sessions', () => {
	it('create/get/delete roundtrip with TTL', () => {
		const created = createSession('owner-sub', 2000)!;
		assert.equal(created.session.expiresAt, 2000 + SESSION_TTL_MS);
		assert.deepEqual(getSession(created.id, 2000), created.session);
		deleteSession(created.id);
		assert.equal(getSession(created.id, 2000), null);
	});

	it('expired session is invalid and cleaned', () => {
		const created = createSession('owner-sub', 2000)!;
		assert.equal(getSession(created.id, 2000 + SESSION_TTL_MS), null);
		assert.equal(getSession(created.id, 2000 + SESSION_TTL_MS), null);
	});

	it('empty sub rejected, invalid id safe', () => {
		assert.equal(createSession('', 2000), null);
		assert.equal(getSession('!!!', 2000), null);
		deleteSession('!!!'); // no throw
	});

	it('capacity bounded', () => {
		for (let i = 0; i < MAX_SESSIONS; i++) assert.ok(createSession(`sub-${i}`, 2000));
		assert.equal(createSession('extra', 2000), null);
	});
});

describe('validators', () => {
	it('subject exact match only', () => {
		assert.equal(isAllowedSubject('a', 'a'), true);
		assert.equal(isAllowedSubject('b', 'a'), false);
		assert.equal(isAllowedSubject('', 'a'), false);
		assert.equal(isAllowedSubject(null, 'a'), false);
		assert.equal(isAllowedSubject(undefined, 'a'), false);
	});

	it('origin exact match only', () => {
		assert.equal(isValidOrigin('https://x.example', 'https://x.example'), true);
		assert.equal(isValidOrigin('https://y.example', 'https://x.example'), false);
		assert.equal(isValidOrigin(null, 'https://x.example'), false);
	});

	it('https origin validation', () => {
		assert.equal(isValidHttpsOrigin('https://x.example', false), true);
		assert.equal(isValidHttpsOrigin('https://x.example/', false), true);
		assert.equal(isValidHttpsOrigin('https://x.example/path', false), false);
		assert.equal(isValidHttpsOrigin('https://u@x.example', false), false);
		assert.equal(isValidHttpsOrigin('https://x.example?a=b', false), false);
		assert.equal(isValidHttpsOrigin('http://x.example', false), false);
		assert.equal(isValidHttpsOrigin('http://localhost:3000', true), true);
		assert.equal(isValidHttpsOrigin('http://127.0.0.1:3000', true), true);
		assert.equal(isValidHttpsOrigin('http:// lan.example', true), false);
		assert.equal(isValidHttpsOrigin('not-a-url', false), false);
	});

	it('issuer must be https without query/fragment/userinfo', () => {
		assert.equal(isValidIssuer('https://id.example.com'), true);
		assert.equal(isValidIssuer('https://id.example.com/tenant'), true);
		assert.equal(isValidIssuer('http://id.example.com'), false);
		assert.equal(isValidIssuer('https://id.example.com?a=b'), false);
		assert.equal(isValidIssuer('https://id.example.com#x'), false);
		assert.equal(isValidIssuer('https://u@id.example.com'), false);
	});
});

describe('cleanup timer', () => {
	it('dispose leaves no live handle', () => {
		createTransaction(TX(), 1000);
		dispose();
		assert.ok(createTransaction(TX(), 1000));
		dispose();
	});
});
