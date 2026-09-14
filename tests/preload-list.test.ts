import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

test('subscription list limits preload to tap data + viewport code', () => {
	const src = readFileSync('src/routes/+page.svelte', 'utf8');
	const ul = src.match(/<ul[^>]*aria-label="Subscriptions"[^>]*>/)?.[0];
	assert.ok(ul, 'expected subscription <ul> to exist');
	assert.match(ul, /data-sveltekit-preload-data="tap"/);
	assert.match(ul, /data-sveltekit-preload-code="viewport"/);
});

test('global body hover preload stays for header/back links', () => {
	const html = readFileSync('src/app.html', 'utf8');
	assert.match(html, /data-sveltekit-preload-data="hover"/);
});
