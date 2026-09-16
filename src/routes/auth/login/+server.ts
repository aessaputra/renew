import { error, redirect, type RequestHandler } from '@sveltejs/kit';
import { createTransaction, isValidOrigin } from '$lib/server/auth-state';
import { buildLoginChallenge, discardServerConfig, getServerConfig } from '$lib/server/oidc';

const TRANSACTION_COOKIE = 'renew_oidc';

export const POST: RequestHandler = async ({ request, cookies }) => {
	let config;
	try {
		config = await getServerConfig();
	} catch {
		discardServerConfig();
		throw error(503);
	}
	if (!isValidOrigin(request.headers.get('origin'), config.origin)) {
		throw error(403, 'Request not allowed.');
	}
	const challenge = await buildLoginChallenge(config);
	const created = createTransaction({
		state: challenge.state,
		nonce: challenge.nonce,
		codeVerifier: challenge.codeVerifier
	});
	if (!created) throw error(503);
	cookies.set(TRANSACTION_COOKIE, created.id, {
		httpOnly: true,
		sameSite: 'lax',
		secure: true,
		path: '/',
		maxAge: 5 * 60
	});
	throw redirect(303, challenge.url);
};
