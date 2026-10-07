import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const sw = new URL('../src/service-worker/index.ts', import.meta.url);

test('service worker file exists with lifecycle handlers', () => {
	assert.ok(existsSync(sw), 'missing src/service-worker/index.ts');
	const src = readFileSync(sw, 'utf8');
	assert.match(src, /addEventListener\('install'/);
	assert.match(src, /addEventListener\('activate'/);
	assert.match(src, /addEventListener\('fetch'/);
	assert.match(src, /skipWaiting/);
	assert.match(src, /clients\.claim|claim\(\)/);
});

test('sw bypasses auth and falls back to offline page', () => {
	const src = readFileSync(sw, 'utf8');
	assert.match(src, /\/auth\//);
	assert.match(src, /\/offline/);
	assert.match(src, /\$app\/manifest/);
	assert.match(src, /\$app\/service-worker/);
	assert.doesNotMatch(src, /\$service-worker/);
});

test('offline route exists and layout registers worker', () => {
	assert.ok(existsSync(new URL('../src/routes/offline/+page.svelte', import.meta.url)));
	const layout = readFileSync(new URL('../src/routes/+layout.svelte', import.meta.url), 'utf8');
	assert.match(layout, /serviceWorker/);
	assert.doesNotMatch(layout, /beforeinstallprompt/);
});
