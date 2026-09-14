import { dev } from '$app/environment';
import { env } from '$env/dynamic/private';
import { error, redirect, type RequestHandler } from '@sveltejs/kit';
import { deleteSession, deleteTransaction, isValidHttpsOrigin } from '$lib/server/auth-state';

const SESSION_COOKIE = 'renew_session';
const TRANSACTION_COOKIE = 'renew_oidc';

export const POST: RequestHandler = async ({ request, cookies }) => {
	const origin = env.ORIGIN;
	if (!origin || !isValidHttpsOrigin(origin, dev)) throw error(503);
	if (request.headers.get('origin') !== origin) throw error(403, 'Request not allowed.');
	const sessionId = cookies.get(SESSION_COOKIE);
	if (sessionId) deleteSession(sessionId);
	const transactionId = cookies.get(TRANSACTION_COOKIE);
	if (transactionId) deleteTransaction(transactionId);
	cookies.delete(SESSION_COOKIE, { path: '/' });
	cookies.delete(TRANSACTION_COOKIE, { path: '/' });
	throw redirect(303, '/login');
};
