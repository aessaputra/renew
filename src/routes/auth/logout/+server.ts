import { dev } from '$app/env';
import { ORIGIN } from '$app/env/private';
import { error, redirect, type RequestHandler } from '@sveltejs/kit';
import { isValidHttpsOrigin } from '#lib/server/auth-state.js';

const SESSION_COOKIE = 'renew_session';
const TRANSACTION_COOKIE = 'renew_oidc';

export const POST: RequestHandler = async ({ request, cookies }) => {
	const origin = ORIGIN;
	if (!origin || !isValidHttpsOrigin(origin, dev)) throw error(503);
	if (request.headers.get('origin') !== origin) throw error(403, 'Request not allowed.');
	cookies.delete(SESSION_COOKIE, { path: '/' });
	cookies.delete(TRANSACTION_COOKIE, { path: '/' });
	throw redirect(303, '/login');
};
