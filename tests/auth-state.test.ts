import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
	createSession,
	createTransaction,
	consumeTransaction,
	getSession,
	isAllowedSubject,
	isValidCookieId,
	isValidHttpsOrigin,
	isValidIssuer,
	isValidOrigin,
	maybeRefreshSession,
	SESSION_ABSOLUTE_MS,
	SESSION_IDLE_MS,
	TRANSACTION_TTL_MS
} from '../src/lib/server/auth-state.ts';

const TX = () => ({ state: 's', nonce: 'n', codeVerifier: 'v' });
const OLD_SECRET = process.env.SESSION_SECRET;

beforeEach(() => {
	process.env.SESSION_SECRET = 'test-session-secret-0123456789abcdef';
});
afterEach(() => {
	if (OLD_SECRET === undefined) delete process.env.SESSION_SECRET;
	else process.env.SESSION_SECRET = OLD_SECRET;
});

describe('cookie ids', () => {
	it('signed cookies are valid ids with size cap', () => {
		const created = createTransaction(TX(), 1000)!;
		assert.ok(isValidCookieId(created.id));
		assert.equal(isValidCookieId(''), false);
		assert.equal(isValidCookieId('a'.repeat(2049)), false);
		assert.equal(isValidCookieId('bad id!'), false);
	});
});

describe('transactions', () => {
	it('create/consume roundtrip with TTL', () => {
		const created = createTransaction(TX(), 1000)!;
		assert.equal(created.transaction.expiresAt, 1000 + TRANSACTION_TTL_MS);
		assert.deepEqual(consumeTransaction(created.id, 1000), created.transaction);
	});

	it('expired transaction is invalid', () => {
		const created = createTransaction(TX(), 1000)!;
		assert.equal(consumeTransaction(created.id, 1000 + TRANSACTION_TTL_MS), null);
	});

	it('invalid id format never matches', () => {
		createTransaction(TX(), 1000);
		assert.equal(consumeTransaction('!!!', 1000), null);
	});

	it('tampered transaction is rejected', () => {
		const created = createTransaction(TX(), 1000)!;
		const parts = created.id.split('.');
		const forged = `${parts[0]}.${parts[1]}.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA`;
		assert.equal(consumeTransaction(forged, 1000), null);
	});

	it('missing secret fails closed', () => {
		delete process.env.SESSION_SECRET;
		assert.equal(createTransaction(TX(), 1000), null);
	});

	it('short secret fails closed', () => {
		process.env.SESSION_SECRET = 'short';
		assert.equal(createTransaction(TX(), 1000), null);
	});

	it('wrong secret rejects foreign cookies', () => {
		const created = createTransaction(TX(), 1000)!;
		process.env.SESSION_SECRET = 'different-secret-0123456789abcdef';
		assert.equal(consumeTransaction(created.id, 1000), null);
	});

	it('cross-type and legacy cookies rejected', () => {
		const session = createSession('owner-sub', 2000)!;
		assert.equal(consumeTransaction(session.id, 2000), null);
		assert.equal(consumeTransaction('abc123base64url', 2000), null);
	});
});

describe('sessions', () => {
	it('create/get roundtrip with idle TTL and issue time', () => {
		const created = createSession('owner-sub', 2000)!;
		assert.equal(created.session.issuedAt, 2000);
		assert.equal(created.session.expiresAt, 2000 + SESSION_IDLE_MS);
		assert.deepEqual(getSession(created.id, 2000), created.session);
	});

	it('idle expiry is invalid even before absolute', () => {
		const created = createSession('owner-sub', 2000)!;
		assert.equal(getSession(created.id, 2000 + SESSION_IDLE_MS), null);
	});

	it('absolute expiry wins over refreshed idle', () => {
		const created = createSession('owner-sub', 2000)!;
		assert.equal(getSession(created.id, 2000 + SESSION_ABSOLUTE_MS), null);
	});

	it('legacy s1 cookies are rejected', () => {
		const created = createSession('owner-sub', 2000)!;
		const parts = created.id.split('.');
		assert.equal(parts[0], 's2');
		assert.equal(getSession(`s1.${parts[1]}.${parts[3]}.${parts[4]}`, 2000), null);
	});

	it('empty sub rejected, invalid id safe', () => {
		assert.equal(createSession('', 2000), null);
		assert.equal(getSession('!!!', 2000), null);
	});

	it('tampered session is rejected', () => {
		const created = createSession('owner-sub', 2000)!;
		const parts = created.id.split('.');
		const forged = `${parts[0]}.${parts[1]}.${parts[2]}.${parts[3]}.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA`;
		assert.equal(getSession(forged, 2000), null);
	});

	it('missing secret fails closed', () => {
		delete process.env.SESSION_SECRET;
		assert.equal(createSession('owner-sub', 2000), null);
	});

	it('short secret fails closed', () => {
		process.env.SESSION_SECRET = 'short';
		assert.equal(createSession('owner-sub', 2000), null);
	});

	it('wrong secret rejects foreign cookies', () => {
		const created = createSession('owner-sub', 2000)!;
		process.env.SESSION_SECRET = 'different-secret-0123456789abcdef';
		assert.equal(getSession(created.id, 2000), null);
	});

	it('cross-type cookies rejected', () => {
		const tx = createTransaction(TX(), 1000)!;
		assert.equal(getSession(tx.id, 1000), null);
	});

	it('no refresh while idle window is fresh', () => {
		const created = createSession('owner-sub', 2000)!;
		const checked = maybeRefreshSession(created.id, 2000)!;
		assert.deepEqual(checked.session, created.session);
		assert.equal(checked.refresh, null);
	});

	it('refresh extends idle but keeps issue time', () => {
		const created = createSession('owner-sub', 2000)!;
		const late = 2000 + SESSION_IDLE_MS - 60 * 1000;
		const checked = maybeRefreshSession(created.id, late)!;
		assert.ok(checked.refresh);
		assert.equal(checked.refresh.session.issuedAt, 2000);
		assert.equal(checked.refresh.session.expiresAt, late + SESSION_IDLE_MS);
		assert.deepEqual(getSession(checked.refresh.id, late), checked.refresh.session);
	});

	it('no refresh when absolute cap is near', () => {
		const DAY = 24 * 60 * 60 * 1000;
		const t0 = 2000;
		let id = createSession('owner-sub', t0)!.id;
		for (const d of [6.5, 13, 19.5]) {
			const stepped = maybeRefreshSession(id, t0 + d * DAY)!;
			assert.ok(stepped.refresh, `refresh at day ${d}`);
			id = stepped.refresh.id;
		}
		const target = t0 + 26 * DAY;
		const checked = maybeRefreshSession(id, target)!;
		assert.ok(checked);
		assert.equal(checked.refresh, null);
		assert.deepEqual(getSession(id, target), checked.session);
	});

	it('future issue time rejected beyond skew', () => {
		const created = createSession('owner-sub', 2000)!;
		assert.equal(getSession(created.id, 2000 - 61 * 1000), null);
	});

	it('absolute rejects at cap after full refresh chain', () => {
		const DAY = 24 * 60 * 60 * 1000;
		const t0 = 2000;
		let id = createSession('owner-sub', t0)!.id;
		for (const d of [6.5, 13, 19.5]) {
			id = maybeRefreshSession(id, t0 + d * DAY)!.refresh!.id;
		}
		const target = t0 + 26 * DAY;
		assert.deepEqual(getSession(id, target), maybeRefreshSession(id, target)!.session);
		assert.equal(getSession(id, t0 + SESSION_ABSOLUTE_MS), null);
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
