import { dev } from '$app/environment';
import { env } from '$env/dynamic/private';
import type { Handle } from '@sveltejs/kit';
import { getSession, isValidHttpsOrigin } from '$lib/server/auth-state';

const SESSION_COOKIE = 'renew_session';
const PUBLIC_ROUTES = new Set(['/login', '/offline', '/auth/login', '/auth/callback']);

function configOrigin(): string | null {
	const origin = env.ORIGIN;
	if (!origin || !isValidHttpsOrigin(origin, dev)) return null;
	return origin;
}

function isApiOrDataRequest(url: URL, request: Request): boolean {
	if (url.pathname.startsWith('/api')) return true;
	if (request.method !== 'GET' && request.method !== 'HEAD') return true;
	const accept = request.headers.get('accept') ?? '';
	if (accept.includes('application/json')) return true;
	if (request.headers.has('x-sveltekit-invalidated')) return true;
	return false;
}

function withNoStore(response: Response, extra?: Record<string, string>): Response {
	response.headers.set('cache-control', 'no-store');
	if (extra) {
		for (const [key, value] of Object.entries(extra)) response.headers.set(key, value);
	}
	return response;
}

export const handle: Handle = async ({ event, resolve }) => {
	if (!configOrigin()) {
		if (PUBLIC_ROUTES.has(event.route.id ?? '')) {
			return withNoStore(await resolve(event));
		}
		return withNoStore(new Response('Service unavailable.', { status: 503 }));
	}

	const sessionId = event.cookies.get(SESSION_COOKIE);
	const session = sessionId ? getSession(sessionId) : null;
	if (sessionId && !session) {
		event.cookies.delete(SESSION_COOKIE, { path: '/' });
	}
	event.locals.user = session ? { sub: session.sub } : null;

	const routeId = event.route.id ?? '';
	const pathname = event.url.pathname;

	if (pathname === '/auth/logout') {
		return withNoStore(await resolve(event));
	}

	if (PUBLIC_ROUTES.has(routeId)) {
		if (routeId === '/login' && session) {
			return withNoStore(new Response(null, { status: 303, headers: { location: '/' } }));
		}
		const response = await resolve(event);
		if (routeId === '/auth/callback') {
			return withNoStore(response, { 'referrer-policy': 'no-referrer' });
		}
		return withNoStore(response);
	}

	if (!session) {
		if (isApiOrDataRequest(event.url, event.request)) {
			return withNoStore(new Response('Sign in required.', { status: 401 }));
		}
		return withNoStore(new Response(null, { status: 303, headers: { location: '/login' } }));
	}

	return withNoStore(await resolve(event));
};
