import { dev } from '$app/environment';
import { env } from '$env/dynamic/private';
import type { Handle } from '@sveltejs/kit';
import { isValidHttpsOrigin, maybeRefreshSession, SESSION_ABSOLUTE_MS } from '$lib/server/auth-state';

const SESSION_COOKIE = 'renew_session';
const SESSION_COOKIE_MAX_AGE = Math.floor(SESSION_ABSOLUTE_MS / 1000);
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

const PUBLIC_CACHEABLE_PREFIXES = ['/_app/immutable/', '/icons/'];
const PUBLIC_CACHEABLE_EXACT = new Set([
	'/manifest.webmanifest',
	'/favicon.svg',
	'/favicon-dark.svg',
	'/offline'
]);

function isPublicCacheable(pathname: string): boolean {
	if (PUBLIC_CACHEABLE_EXACT.has(pathname)) return true;
	return PUBLIC_CACHEABLE_PREFIXES.some((p) => pathname.startsWith(p));
}

export const handle: Handle = async ({ event, resolve }) => {
	if (!configOrigin()) {
		if (PUBLIC_ROUTES.has(event.route.id ?? '')) {
			return withNoStore(await resolve(event));
		}
		return withNoStore(new Response('Service unavailable.', { status: 503 }));
	}

	const sessionId = event.cookies.get(SESSION_COOKIE);
	const checked = sessionId ? maybeRefreshSession(sessionId) : null;
	const session = checked?.session ?? null;
	if (sessionId && !session) {
		event.cookies.delete(SESSION_COOKIE, { path: '/' });
	}
	event.locals.user = session ? { sub: session.sub } : null;
	const refreshedId = checked?.refresh?.id ?? null;
	if (refreshedId) {
		event.cookies.set(SESSION_COOKIE, refreshedId, {
			path: '/',
			httpOnly: true,
			secure: true,
			sameSite: 'lax',
			maxAge: SESSION_COOKIE_MAX_AGE
		});
	}

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

	const response = await resolve(event);
	if (isPublicCacheable(event.url.pathname)) {
		response.headers.set('cache-control', 'public, max-age=31536000, immutable');
		return response;
	}
	return withNoStore(response);
};
