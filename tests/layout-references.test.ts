import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

test('root layout loads shared references once with invalidation key', () => {
	const src = readFileSync('src/routes/+layout.server.ts', 'utf8');
	assert.match(src, /depends\(['"]app:references['"]\)/);
	assert.match(src, /listCurrencies/);
	assert.match(src, /listCategories/);
	assert.match(src, /listPaymentMethods/);
	assert.match(src, /references/);
});

test('root layout degrades to empty references instead of throwing 503', () => {
	const src = readFileSync('src/routes/+layout.server.ts', 'utf8');
	assert.match(src, /referencesUnavailable/);
	assert.ok(!/throw error\(503\)/.test(src), 'layout must not 503 the whole app when references fail');
});
