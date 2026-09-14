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
