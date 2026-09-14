import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { it } from 'node:test';

const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

it('mobile foundations reserve safe areas and surface tokens', () => {
  const css = source('src/routes/layout.css');
  assert.match(css, /--color-surface:\s*var\(--surface\)/);
  assert.match(css, /\.page-shell/);
  assert.match(css, /safe-area-inset-bottom/);
  assert.match(css, /@media\s*\(min-width:\s*40rem\)/);
  assert.match(source('src/app.html'), /viewport-fit=cover/);
});

it('application pages use responsive widths rather than a phone-only column', () => {
  const pages = [
    ['src/routes/+page.svelte', 'max-w-5xl'],
    ['src/routes/subscriptions/[id]/+page.svelte', 'max-w-3xl'],
    ['src/routes/subscriptions/new/+page.svelte', 'max-w-3xl'],
    ['src/routes/subscriptions/[id]/edit/+page.svelte', 'max-w-3xl']
  ];
  for (const [path, width] of pages) {
    const text = source(path);
    assert.ok(text.includes('page-shell'), path);
    assert.ok(text.includes(width), path);
    assert.ok(!text.includes('max-w-md'), path);
  }
});
