import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

test('manifest exists with installable fields', () => {
	const p = new URL('../static/manifest.webmanifest', import.meta.url);
	const raw = readFileSync(p, 'utf8');
	const m = JSON.parse(raw);
	assert.equal(m.display, 'standalone');
	assert.equal(m.scope, '/');
	assert.ok(m.start_url.startsWith('/'));
	assert.ok(m.name.includes('Renew'));
	assert.ok(m.short_name.length <= 12);
	const sizes = m.icons.map((i: any) => i.sizes);
	assert.ok(sizes.includes('192x192'), 'needs 192 icon');
	assert.ok(sizes.includes('512x512'), 'needs 512 icon');
	assert.ok(m.icons.some((i: any) => (i.purpose || '').includes('maskable')), 'needs maskable icon');
});

test('required icon PNGs exist and are PNG', () => {
	const files = [
		'../static/icons/icon-192.png',
		'../static/icons/icon-512.png',
		'../static/icons/icon-maskable-512.png',
		'../static/icons/apple-touch-icon.png'
	];
	for (const f of files) {
		const u = new URL(f, import.meta.url);
		assert.ok(existsSync(u), `missing ${f}`);
		const buf = readFileSync(u);
		assert.deepEqual(
			buf.subarray(0, 8),
			Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
		);
	}
});

test('app.html links manifest and apple touch icon', () => {
	const html = readFileSync(new URL('../src/app.html', import.meta.url), 'utf8');
	assert.match(html, /rel="manifest" href="\/manifest\.webmanifest"/);
	assert.match(html, /rel="apple-touch-icon" href="\/icons\/apple-touch-icon\.png"/);
	assert.match(html, /apple-mobile-web-app-capable/);
});
