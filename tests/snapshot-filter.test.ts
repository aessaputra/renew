import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

test('list captures filter state in a snapshot', () => {
	const src = readFileSync('src/routes/+page.svelte', 'utf8');
	assert.match(src, /export const snapshot/);
	assert.match(src, /capture/);
	assert.match(src, /restore/);
	assert.match(src, /categoryId/);
	assert.match(src, /paymentMethodId/);
});
