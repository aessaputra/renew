import { redirect, type RequestHandler } from '@sveltejs/kit';
import { consumeTransaction, createSession, SESSION_ABSOLUTE_MS } from '#lib/server/auth-state.js';
import { discardServerConfig, exchangeCallback, getServerConfig } from '#lib/server/oidc.js';

const TRANSACTION_COOKIE = 'renew_oidc';
const SESSION_COOKIE = 'renew_session';

export const GET: RequestHandler = async ({ url, cookies }) => {
	const transactionId = cookies.get(TRANSACTION_COOKIE);
	cookies.delete(TRANSACTION_COOKIE, { path: '/' });
	if (!transactionId) throw redirect(303, '/login?error=expired');
	const transaction = consumeTransaction(transactionId);
	if (!transaction) throw redirect(303, '/login?error=expired');
	let config;
	try {
		config = await getServerConfig();
	} catch {
		discardServerConfig();
		throw redirect(303, '/login?error=unavailable');
	}
	const callbackUrl = new URL(`${config.origin}/auth/callback${url.search}`);
	let sub: string;
	try {
		sub = await exchangeCallback(config, callbackUrl, {
			pkceCodeVerifier: transaction.codeVerifier,
			expectedState: transaction.state,
			expectedNonce: transaction.nonce
		});
	} catch (err) {
		const code = err instanceof Error ? err.message : 'failed';
		const safe = code === 'denied' || code === 'expired' || code === 'unavailable' ? code : 'failed';
		throw redirect(303, `/login?error=${safe}`);
	}
	const created = createSession(sub);
	if (!created) throw redirect(303, '/login?error=unavailable');
	cookies.set(SESSION_COOKIE, created.id, {
		httpOnly: true,
		sameSite: 'lax',
		secure: true,
		path: '/',
		maxAge: Math.floor(SESSION_ABSOLUTE_MS / 1000)
	});
	throw redirect(303, '/');
};
