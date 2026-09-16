import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

test('list load streams reference promises instead of awaiting all four', () => {
const src = readFileSync('src/routes/+page.server.ts', 'utf8');
assert.match(src, /categoriesStream/);
assert.match(src, /paymentMethodsStream/);
assert.match(src, /categories:\s*categoriesStream/);
assert.ok(
!/await Promise\.all\(\[[\s\S]*?listSubscriptions[\s\S]*?listCategories[\s\S]*?listPaymentMethods[\s\S]*?listCurrencies/.test(
src
),
'must not await all four together'
);
});

test('list page handles async references with await block', () => {
const src = readFileSync('src/routes/+page.svelte', 'utf8');
assert.match(src, /\{#await Promise\.all\(\[data\.categories,\s*data\.paymentMethods\]\)/);
assert.match(src, /\{:then/);
assert.match(src, /id="category-filter"/);
assert.match(src, /id="payment-filter"/);
});

test('list page limits filter menus to references used by active subscriptions', () => {
const src = readFileSync('src/routes/+page.svelte', 'utf8');
assert.match(src, /activeCatIds = new Set\(activeSubs\.map/);
assert.match(src, /usedCats = cats\.filter\(\(c\) => activeCatIds\.has\(c\.id\)\)/);
assert.match(src, /activePayIds = new Set\(activeSubs\.map/);
assert.match(src, /usedPays = pays\.filter\(\(m\) => activePayIds\.has\(m\.id\)\)/);
assert.match(src, /\{#each filterCats as c/);
assert.match(src, /\{#each filterPays as m/);
});
