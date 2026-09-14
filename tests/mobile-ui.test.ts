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

it('form has responsive pairs and a visible reminder-days label', () => {
  const form = source('src/lib/components/subscription-form.svelte');
  assert.equal((form.match(/grid grid-cols-1 gap-4 sm:grid-cols-2/g) ?? []).length, 3);
  assert.match(form, /for="reminder-days"/);
  assert.match(form, /id="reminder-days"/);
  assert.doesNotMatch(form, /placeholder:text-muted-foreground\/70/);
});

it('login and errors share safe shell and readable surfaces', () => {
  for (const path of ['src/routes/login/+page.svelte', 'src/routes/+error.svelte']) {
    const text = source(path);
    assert.ok(text.includes('page-shell'), path);
    assert.ok(text.includes('bg-surface'), path);
    assert.ok(text.includes('max-w-md'), path);
    assert.ok(text.includes('primary-action'), path);
  }
});

it('every form section uses a shrinkable surface', () => {
  const sections = source('src/lib/components/subscription-form.svelte').match(/<fieldset[^>]+>/g) ?? [];
  assert.equal(sections.length, 3);
  for (const section of sections) assert.match(section, /min-w-0 bg-surface/);
});

it('control boundaries use a contrasting neutral in both themes', () => {
  assert.equal((source('src/routes/layout.css').match(/--border: var\(--color-stone-500\)/g) ?? []).length, 2);
});

it('centered shells do not override safe-area padding with utilities', () => {
  for (const path of ['src/routes/login/+page.svelte', 'src/routes/+error.svelte']) {
    const main = source(path).match(/<main[^>]*>/)?.[0] ?? '';
    assert.doesNotMatch(main, /\b(?:p|px|py|pt|pb|pl|pr)-\d/);
  }
});
