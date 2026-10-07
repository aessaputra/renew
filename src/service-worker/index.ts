/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />
import { self } from '$app/service-worker';
import { version } from '$app/env';
import { assets, immutable, prerendered } from '$app/manifest';
import { asset } from '$app/paths';

const CACHE = `renew-${version}`;

// immutable build output precached via manifest; static assets resolved to absolute paths.
// prerendered pages (/offline) included so fallback works without network.
const PRECACHE: string[] = [
	...immutable.map((entry) => entry.path),
	...assets.map((a) => asset(a.path)),
	...prerendered.map((page) => page.path)
];
const OFFLINE_URL = '/offline';

// ponytail: private HTML must never persist on device; only /offline may be cached as navigation.
function isPrivateNavigation(pathname: string): boolean {
	if (pathname === '/offline' || pathname === '/login') return false;
	return pathname === '/' || pathname.startsWith('/subscriptions');
}

self.addEventListener('install', (event) => {
	event.waitUntil(
		(async () => {
			const cache = await caches.open(CACHE);
			await cache.addAll(PRECACHE);
			await self.skipWaiting();
		})()
	);
});

self.addEventListener('activate', (event) => {
	event.waitUntil(
		(async () => {
			const keys = await caches.keys();
			await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
			await self.clients.claim();
		})()
	);
});

self.addEventListener('fetch', (event) => {
	const req = event.request;
	const url = new URL(req.url);
	if (req.method !== 'GET') return;
	if (url.origin !== self.location.origin) return;
	// Auth and server mutations always hit network.
	if (url.pathname.startsWith('/auth/') || url.pathname === '/login') return;

	// Navigations: network first, cache fallback, offline page last.
	if (req.mode === 'navigate') {
		event.respondWith(
			(async () => {
				try {
					const fresh = await fetch(req);
					if (!isPrivateNavigation(url.pathname)) {
						const cache = await caches.open(CACHE);
						cache.put(req, fresh.clone());
					}
					return fresh;
				} catch {
					const cached = await caches.match(req);
					if (cached) return cached;
					const offline = await caches.match(OFFLINE_URL);
					if (offline) return offline;
					throw new Error('offline');
				}
			})()
		);
		return;
	}

	// Immutable built assets + icons: cache first.
	if (
		url.pathname.startsWith('/_app/immutable/') ||
		url.pathname.startsWith('/icons/') ||
		url.pathname === '/manifest.webmanifest' ||
		url.pathname === '/favicon.svg' ||
		url.pathname === '/favicon-dark.svg'
	) {
		event.respondWith(
			(async () => {
				const cached = await caches.match(req);
				if (cached) return cached;
				const fresh = await fetch(req);
				const cache = await caches.open(CACHE);
				cache.put(req, fresh.clone());
				return fresh;
			})()
		);
	}
});
