import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { it } from 'node:test';

const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

it('mobile foundations reserve safe areas and surface tokens', () => {
  const css = source('src/routes/layout.css');
  assert.match(css, /--color-surface:\s*var\(--surface\)/);
  assert.match(css, /\.page-shell/);
  assert.match(css, /safe-area-inset-bottom/);
  assert.match(css, /scrollbar-gutter:\s*stable/);
  assert.match(css, /@media\s*\(min-width:\s*40rem\)/);
  assert.match(source('src/app.html'), /viewport-fit=cover/);
  assert.match(source('src/app.html'), /<link[^>]*rel="icon"[^>]*href="\/favicon\.svg"[^>]*media="\(prefers-color-scheme: light\)"/);
  assert.match(source('src/app.html'), /<link[^>]*rel="icon"[^>]*href="\/favicon-dark\.svg"[^>]*media="\(prefers-color-scheme: dark\)"/);
  assert.match(source('src/app.html'), /<meta[^>]*name="theme-color"[^>]*media="\(prefers-color-scheme: light\)"/);
  assert.match(source('src/app.html'), /<meta[^>]*name="theme-color"[^>]*media="\(prefers-color-scheme: dark\)"/);
  assert.match(source('static/favicon.svg'), /<svg[^>]*viewBox="0 0 64 64"/);
  assert.match(source('static/favicon-dark.svg'), /<svg[^>]*viewBox="0 0 64 64"/);
});

it('application pages use responsive widths rather than a phone-only column', () => {
  const pages = [
    ['src/routes/+page.svelte', 'max-w-5xl'],
    ['src/routes/subscriptions/[id]/+page.svelte', 'max-w-5xl'],
    ['src/routes/subscriptions/new/+page.svelte', 'max-w-5xl'],
    ['src/routes/subscriptions/[id]/edit/+page.svelte', 'max-w-5xl']
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
  assert.equal((form.match(/grid grid-cols-1 gap-4 sm:grid-cols-2/g) ?? []).length, 2);
  assert.match(form, /for="reminder-days"/);
  assert.match(form, /id="reminder-days"/);
  assert.doesNotMatch(form, /placeholder:text-muted-foreground\/70/);
  assert.match(form, /\{c\.code\}<\/option>/);
  assert.doesNotMatch(form, /\{c\.code\} \{c\.symbol\}/);
});

it('login and errors share safe shell and readable surfaces', () => {
  for (const path of ['src/routes/login/+page.svelte', 'src/routes/+error.svelte']) {
    const text = source(path);
    assert.ok(text.includes('page-shell'), path);
    assert.ok(text.includes('card'), path);
    assert.ok(text.includes('max-w-md'), path);
    assert.ok(text.includes('primary-action'), path);
  }
});

it('every form section uses a shrinkable surface', () => {
  const form = source('src/lib/components/subscription-form.svelte');
  const sections = form.match(/<fieldset[^>]+>/g) ?? [];
  assert.equal(sections.length, 3);
  for (const section of sections) assert.match(section, /card/);
});

it('control boundaries use a contrasting neutral in both themes', () => {
  const css = source('src/routes/layout.css');
  assert.match(css, /--color-control-border:\s*var\(--control-border\)/);
  assert.match(css, /\.field-control\s*\{[^}]*border-control-border/);
  assert.match(css, /button\.border-border\s*\{\s*border-color: var\(--control-border\)/);
});

it('warm monochrome themes retain accessible text, controls and focus contrast', () => {
  const themes = [...source('src/routes/layout.css').matchAll(/:root\s*\{([^}]+)\}/g)].slice(0, 2);
  assert.equal(themes.length, 2);
  const luminance = (hex: string) => {
    assert.match(hex, /^#[\da-f]{6}$/i);
    const rgb = hex.slice(1).match(/../g)!.map((channel) => {
      const value = parseInt(channel, 16) / 255;
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
  };
  for (const [index, theme] of themes.entries()) {
    const tokens = Object.fromEntries([...theme[1].matchAll(/--([\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2]]));
    assert.equal(tokens.primary, index === 0 ? '#111111' : '#f7f6f3');
    assert.notEqual(tokens.border, tokens['control-border']);
    const contrast = (a: string, b: string, minimum: number) => {
      const values = [luminance(tokens[a]), luminance(tokens[b])].sort((x, y) => y - x);
      const ratio = (values[0] + 0.05) / (values[1] + 0.05);
      assert.ok(ratio >= minimum, `${index ? 'dark' : 'light'} ${a}/${b}: ${ratio.toFixed(2)}`);
    };
    for (const background of ['background', 'surface']) {
      for (const text of ['foreground', 'muted-foreground']) contrast(text, background, 4.5);
      for (const control of ['control-border', 'ring']) contrast(control, background, 3);
    }
    for (const background of ['primary', 'primary-hover']) contrast('primary-foreground', background, 4.5);
  }
});

it('centered shells do not override safe-area padding with utilities', () => {
  for (const path of ['src/routes/login/+page.svelte', 'src/routes/+error.svelte']) {
    const main = source(path).match(/<main[^>]*>/)?.[0] ?? '';
    assert.doesNotMatch(main, /\b(?:p|px|py|pt|pb|pl|pr)-\d/);
  }
});

it('page titles share the Renew brand pattern', () => {
  const titles: Array<[string, RegExp]> = [
    ['src/routes/+page.svelte', /<title>Renew — Subscriptions<\/title>/],
    ['src/routes/login/+page.svelte', /<title>Renew — Sign in<\/title>/],
    ['src/routes/+error.svelte', /<title>Renew — /],
    ['src/routes/subscriptions/new/+page.svelte', /<title>Renew — Add subscription<\/title>/],
    ['src/routes/subscriptions/[id]/+page.svelte', /<title>Renew — Subscription detail<\/title>/],
    ['src/routes/subscriptions/[id]/edit/+page.svelte', /<title>Renew — Edit subscription<\/title>/]
  ];
  for (const [path, pattern] of titles) assert.match(source(path), pattern);
});

it('page headings share one title pattern', () => {
  const css = source('src/routes/layout.css');
  assert.match(css, /\.page-title\s*\{/);
  assert.match(css, /\.eyebrow\s*\{/);
  for (const path of [
    'src/routes/+page.svelte',
    'src/routes/login/+page.svelte',
    'src/routes/+error.svelte',
    'src/routes/subscriptions/new/+page.svelte',
    'src/routes/subscriptions/[id]/+page.svelte',
    'src/routes/subscriptions/[id]/edit/+page.svelte'
  ]) {
    assert.ok(source(path).includes('page-title'), `${path} title`);
  }
  for (const path of ['src/routes/+error.svelte']) {
    assert.ok(source(path).includes('eyebrow'), `${path} eyebrow`);
  }
  assert.ok(source('src/routes/login/+page.svelte').includes('brand-link'), 'login brand');
});

it('danger actions share one pattern without raw borders', () => {
  const css = source('src/routes/layout.css');
  assert.match(css, /\.danger-action\s*\{/);
  const detail = source('src/routes/subscriptions/[id]/+page.svelte');
  assert.ok(detail.includes('danger-action'), 'detail danger');
  const tagged = detail.match(/class="[^"]*danger-action[^"]*"/g) ?? [];
  assert.ok(tagged.length > 0, 'danger usage');
  for (const cls of tagged) assert.doesNotMatch(cls, /\bborder-border\b/);
});

it('cards share one surface pattern', () => {
  const css = source('src/routes/layout.css');
  assert.match(css, /\.card\s*\{/);
  assert.match(css, /\.empty-state\s*\{/);
  const noRawCard = [
    'src/routes/+page.svelte',
    'src/routes/login/+page.svelte',
    'src/routes/+error.svelte',
    'src/lib/components/subscription-form.svelte'
  ];
  for (const path of noRawCard) {
    const text = source(path);
    assert.ok(text.includes('card') || text.includes('empty-state'), path);
    const rawCards = text.match(/class="[^"]*"/g) ?? [];
    for (const cls of rawCards) {
      if (cls.includes('rounded-xl') && cls.includes('border-border') && !cls.includes('border-dashed')) {
        assert.ok(cls.includes('card'), `${path}: ${cls}`);
      }
    }
  }
});

it('headers and back links share one pattern', () => {
  const css = source('src/routes/layout.css');
  assert.match(css, /\.app-header/);
  assert.match(css, /\.app-header\s*\{[^}]*min-h-16/);
  assert.match(css, /\.brand-link/);
  assert.match(css, /\.back-link\s*\{[^}]*min-h-12/);
  assert.match(css, /\.back-link\s*\{[^}]*focus-visible:outline/);
  const home = source('src/routes/+page.svelte');
  assert.ok(home.includes('app-header'), '+page header');
  assert.ok(home.includes('brand-link'), '+page brand');
  assert.ok(home.includes('Sign out'), '+page signout');
  for (const path of [
    'src/routes/subscriptions/[id]/+page.svelte',
    'src/routes/subscriptions/new/+page.svelte',
    'src/routes/subscriptions/[id]/edit/+page.svelte'
  ]) {
    const text = source(path);
    assert.ok(text.includes('app-header'), `${path} header`);
    assert.ok(text.includes('brand-link'), `${path} brand`);
    assert.ok(text.includes('Sign out'), `${path} signout`);
    assert.ok(text.includes('action="/auth/logout"'), `${path} logout action`);
    assert.ok(text.includes('back-link'), `${path} back-link`);
    assert.equal((text.match(/Back to list/g) ?? []).length, 1, `${path} label`);
    assert.equal((text.match(/\bback-link\b/g) ?? []).length, 1, `${path} class`);
    assert.ok(text.indexOf('</header>') < text.indexOf('back-link'), `${path} below header`);
    assert.ok(text.indexOf('Back to list') < text.indexOf('<h1'), `${path} above title`);
    const link = text.match(/<a[^>]*class="back-link"[^>]*>[\s\S]*?<\/a>/)?.[0] ?? '';
    assert.match(link, /<svg[^>]*aria-hidden="true"[^>]*stroke="currentColor"/, `${path} svg arrow`);
    assert.doesNotMatch(link, /←/, `${path} no char arrow`);
  }
});

it('home search is a label-free field with inline clear', () => {
  const home = source('src/routes/+page.svelte');
  assert.match(home, /id="subscription-search"/);
  assert.match(home, /aria-label="Clear search"/);
  assert.match(home, /\{#if q\}/);
  assert.match(home, /<svg[^>]*aria-hidden="true"/);
  assert.doesNotMatch(home, />Search subscriptions<\/label>/);
  assert.match(home, /aria-label="Search subscriptions"|sr-only[^>]*>Search subscriptions/);
});

it('home filters are icon buttons with dropdown menus beside search', () => {
  const home = source('src/routes/+page.svelte');
  assert.match(home, /id="subscription-search"/);
  assert.match(home, /openFilter/);
  assert.match(home, /toggleFilter\('category'\)/);
  assert.match(home, /toggleFilter\('payment'\)/);
  assert.match(home, /closest\(['"]\.filter-menu['"]\)/);
  assert.match(home, /Promise\.all\(\[data\.categories,\s*data\.paymentMethods\]\)/);
  assert.match(home, /\{#await Promise\.all/);
  assert.match(home, /<details[^>]*id="category-filter"/);
  assert.match(home, /<details[^>]*id="payment-filter"/);
  assert.match(home, /<summary[^>]*aria-label="Filter by category/);
  assert.match(home, /<summary[^>]*aria-label="Filter by payment method/);
  assert.match(home, /filter-menu-panel/);
  assert.match(home, /role="option"/);
  const css = source('src/routes/layout.css');
  assert.match(css, /\.filter-menu-panel\s*\{/);
  assert.doesNotMatch(home, /<select[^>]*id="category-filter"/);
  assert.doesNotMatch(home, /<select[^>]*id="payment-filter"/);
  assert.doesNotMatch(home, /snap-x|snap-mandatory|overflow-x-auto|md:contents/);
});

it('home result status shares one bar with clear', () => {
  const css = source('src/routes/layout.css');
  assert.match(css, /\.filter-status\s*\{/);
  const home = source('src/routes/+page.svelte');
  assert.ok(home.includes('filter-status'), 'status bar usage');
  assert.match(home, /aria-label="Clear filters"/);
});

it('home empty state routes both zero cases', () => {
  const home = source('src/routes/+page.svelte');
  const empty = home.match(/<div class="empty-state">[\s\S]*?<\/div>/)?.[0] ?? '';
  assert.ok(empty.length > 0, 'empty state block');
  assert.match(empty, /No subscriptions/);
  assert.match(empty, /primary-action/);
  assert.match(empty, /aria-label="Clear filters"/);
});

it('home list rows stay tidy on mobile with title-price baseline', () => {
  const home = source('src/routes/+page.svelte');
  const list = home.match(/<ul aria-label="Subscriptions"[\s\S]*?<\/ul>/)?.[0] ?? '';
  assert.ok(list.length > 0, 'subscriptions list');
  assert.match(list, /flex[^"]*items-center[^"]*gap-3/);
  assert.match(list, /truncate/);
  assert.match(list, /Next payment/);
  assert.match(list, /text-right[^"]*tabular-nums|tabular-nums[^"]*text-right/);
  assert.doesNotMatch(list, /md:row-span-2/);
});

it('detail puts its only back link above the title', () => {
  const detail = source('src/routes/subscriptions/[id]/+page.svelte');
  assert.equal((detail.match(/Back to list/g) ?? []).length, 1);
  assert.equal((detail.match(/\bback-link\b/g) ?? []).length, 1);
  assert.ok(detail.includes('brand-link'), 'detail brand');
  assert.ok(detail.indexOf('</header>') < detail.indexOf('back-link'));
  assert.ok(detail.indexOf('Back to list') < detail.indexOf('<h1'));
  assert.doesNotMatch(detail, /secondary-action back-link/);
});

it('detail presents data once with price beside the title and actions below billing', () => {
  const detail = source('src/routes/subscriptions/[id]/+page.svelte');
  const heading = detail.match(/<div class="detail-hero mb-8">[\s\S]*?<\/div>/)?.[0] ?? '';
  assert.match(heading, /<h1/);
  assert.match(heading, /\{formatPrice\(s\.price, s\.currencyCode\)\}/);
  assert.doesNotMatch(heading, /aria-label="Edit \{s\.name\}"/);
  assert.ok(detail.indexOf('<dl class="billing-grid">') < detail.indexOf('class="detail-actions"'));
  assert.ok(detail.indexOf('</dl>') < detail.indexOf('class="detail-actions"'));
  assert.doesNotMatch(detail, /\bcard(?:-pad)?\b|eyebrow|billing-heading|action-bar/);
  for (const field of ['next_payment', 'category_name', 'payment_method_name', 'price', 'start_date', 'cycle', 'frequency']) {
    assert.equal((detail.match(new RegExp(`s\\.${field}\\b`, 'g')) ?? []).length, 1, field);
  }
  assert.equal((detail.match(/>Billing interval<\/dt>/g) ?? []).length, 1);
  assert.match(detail, /\{formatBillingInterval\(s\.cycle, s\.frequency\)\}/);
  assert.doesNotMatch(detail, />(?:Cycle|Frequency)<\/dt>/);
  assert.match(detail, /<dl class="billing-grid">/);
  assert.match(detail, /class="billing-notes"/);
  assert.doesNotMatch(detail, /class="sm:col-span-2"/);
  const css = source('src/routes/layout.css');
  assert.match(css, /\.detail-hero\s*\{[^}]*grid-cols-\[minmax\(0,1fr\)_auto\][^}]*items-baseline/);
  assert.match(css, /\.detail-actions\s*\{[^}]*mt-8/);
  assert.match(css, /\.billing-grid\s*\{[^}]*grid-cols-1[^}]*divide-y/);
  assert.doesNotMatch(css, /\.billing-grid\s*\{[^}]*sm:grid-cols-2/);
  assert.match(css, /\.billing-grid > div\s*\{[^}]*justify-between/);
  assert.match(css, /\.billing-notes\s*\{[^}]*flex-col/);
});

it('detail delete confirms in a native dialog with explicit actions', () => {
  const detail = source('src/routes/subscriptions/[id]/+page.svelte');
  assert.match(detail, /<dialog[^>]*aria-labelledby="delete-dialog-title"/);
  assert.match(detail, /<h2[^>]*id="delete-dialog-title"[^>]*>Delete \{s\.name\} \?<\/h2>/);
  assert.match(detail, /This permanently deletes this subscription\. This cannot be undone\./);
  assert.doesNotMatch(detail, /Delete \{s\.name\} permanently/);
  assert.match(detail, /<input[^>]*type="hidden"[^>]*name="confirm"[^>]*value="yes"/);
  assert.doesNotMatch(detail, /<details|confirm-delete|name="confirm"[^>]*required/);
  assert.match(detail, /<div class="detail-actions">\s*<a[\s\S]*?>Edit<\/a>\s*<button[\s\S]*?>Delete subscription<\/button>/);
  assert.ok(detail.indexOf('</dl>') < detail.indexOf('<dialog'));
  assert.match(detail, /<form method="dialog"/);
  assert.match(detail, /<form method="POST" action="\/subscriptions\/\{s\.id\}\?\/delete"/);
  assert.doesNotMatch(detail, /payment history/);
  assert.match(detail, /min-h-11|min-h-12/);
  assert.match(detail, /danger-action-inline/);
  assert.match(detail, /if\s*\(\s*deleteDialog && !deleteDialog\.open\s*\)/);
  const css = source('src/routes/layout.css');
  assert.match(css, /\.danger-action-inline\s*\{[^}]*sm:w-auto/);
  assert.match(css, /\.delete-dialog\s*\{[^}]*m-auto/);
  assert.match(css, /\.delete-dialog::backdrop/);
});

it('detail delete errors share the form alert pattern', () => {
  const detail = source('src/routes/subscriptions/[id]/+page.svelte');
  const alert = detail.match(/<(ul|div)[^>]*role="alert"[^>]*>[\s\S]*?<\/(ul|div)>/)?.[0] ?? '';
  assert.ok(alert.length > 0, 'detail alert block');
  assert.match(alert, /border-border/);
  assert.match(alert, /bg-surface/);
  assert.match(alert, /text-danger/);
});

it('form error lists key by index to survive duplicate messages', () => {
  for (const path of [
    'src/routes/subscriptions/new/+page.svelte',
    'src/routes/subscriptions/[id]/edit/+page.svelte',
    'src/routes/subscriptions/[id]/+page.svelte'
  ]) {
    const text = source(path);
    assert.match(text, /\{#each .*errors as \w+, \w+ \(\w+\)\}/, path);
    assert.doesNotMatch(text, /\{#each .*errors as \w+ \(\w+\)\}/, `${path} no value key`);
  }
});

it('detail actions keep consistent touch, hover and focus treatment', () => {
  const css = source('src/routes/layout.css');
  assert.match(css, /\.secondary-action\s*\{[^}]*min-h-12/);
  assert.match(css, /\.secondary-action\s*\{[^}]*focus-visible:outline/);
  assert.match(css, /\.danger-action-inline\s*\{[^}]*min-h-12/);
  const detail = source('src/routes/subscriptions/[id]/+page.svelte');
  assert.match(detail, /aria-label="Delete \{s\.name\}"/);
});

it('primary actions share one responsive width pattern', () => {
  const css = source('src/routes/layout.css');
  assert.match(css, /\.primary-action\s*\{[^}]*w-full/);
  assert.match(css, /\.primary-action-inline\s*\{[^}]*sm:w-auto/);
  assert.match(css, /\.primary-action-block/);
  const usages = [
    'src/routes/+page.svelte',
    'src/routes/login/+page.svelte',
    'src/routes/+error.svelte',
    'src/routes/subscriptions/[id]/+page.svelte',
    'src/lib/components/subscription-form.svelte'
  ];
  for (const path of usages) {
    const text = source(path);
    const tagged = text.match(/class="[^"]*primary-action[^"]*"/g) ?? [];
    assert.ok(tagged.length > 0, path);
    for (const cls of tagged) assert.doesNotMatch(cls, /\bw-full\b|\bsm:w-auto\b|\bsm:min-w-40\b|\bwhitespace-nowrap\b/);
  }
});
