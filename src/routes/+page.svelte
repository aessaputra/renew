<script lang="ts">
	import { filterSubscriptions, formatPrice } from '$lib/wallos';

	let { data } = $props();
	let q = $state('');
	let debouncedQ = $state('');
	let debounceTimer: ReturnType<typeof setTimeout> | undefined;
	function onSearchInput(value: string) {
		q = value;
		clearTimeout(debounceTimer);
		debounceTimer = setTimeout(() => {
			debouncedQ = value;
		}, 150);
	}
	function clearSearch() {
		clearTimeout(debounceTimer);
		q = '';
		debouncedQ = '';
	}
	let categoryId = $state('');
	let paymentMethodId = $state('');
	let activeSubs = $derived(data.subscriptions.filter((s) => s.inactive === 0));
	let activeCount = $derived(activeSubs.length);
	let activeCategoryIds = $derived(new Set(activeSubs.map((s) => s.category_id)));
	let activePaymentIds = $derived(new Set(activeSubs.map((s) => s.payment_method_id)));
	let usedCategories = $derived(data.categories.filter((c) => activeCategoryIds.has(c.id)));
	let usedPaymentMethods = $derived(data.paymentMethods.filter((m) => activePaymentIds.has(m.id)));
let filterCategories = $derived(usedCategories.length > 0 ? usedCategories : data.categories);
let filterPaymentMethods = $derived(usedPaymentMethods.length > 0 ? usedPaymentMethods : data.paymentMethods);
	let hasFilters = $derived(Boolean(q || categoryId || paymentMethodId));
	let openFilter = $state<'category' | 'payment' | null>(null);
	function toggleFilter(which: 'category' | 'payment') {
		openFilter = openFilter === which ? null : which;
	}
	function closeFilters() {
		openFilter = null;
	}
	let categoryName = $derived(data.categories.find((c) => String(c.id) === categoryId)?.name ?? '');
	let paymentName = $derived(data.paymentMethods.find((m) => String(m.id) === paymentMethodId)?.name ?? '');
	let filtered = $derived(filterSubscriptions(data.subscriptions, { q: debouncedQ, categoryId, paymentMethodId }));
	function clearAllFilters() {
		clearTimeout(debounceTimer);
		q = '';
		debouncedQ = '';
		categoryId = '';
		paymentMethodId = '';
	}
</script>

<svelte:head>
	<title>Renew — Subscriptions</title>
	<meta name="description" content="Renew — your subscriptions, in one place." />
</svelte:head>

<svelte:window onpointerdown={(e) => { if (!((e.target as HTMLElement | null)?.closest('.filter-menu'))) closeFilters(); }} />

<main class="page-shell bg-background font-sans text-foreground">
	<div class="mx-auto w-full max-w-5xl text-left">
		<header class="app-header">
			<a href="/" aria-label="Renew home" class="brand-link">
				<span aria-hidden="true" class="flex size-8 items-center justify-center rounded-[var(--radius-control)] bg-primary text-base text-primary-foreground">r.</span>
				<span>Renew</span>
			</a>
			<form method="POST" action="/auth/logout">
				<button type="submit" class="min-h-12 rounded-[var(--radius-control)] px-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">Sign out</button>
			</form>
		</header>

		<div class="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
			<h1 class="page-title">Subscriptions</h1>
			<a href="/subscriptions/new" class="primary-action primary-action-inline">Add subscription</a>
		</div>

		<div class="mt-6 border-b border-border pb-6">
			<div class="flex min-w-0 items-stretch gap-2">
				<div class="relative min-w-0 flex-1">
					<svg aria-hidden="true" class="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="9" cy="9" r="5.5" /><path d="m13.5 13.5 3 3" stroke-linecap="round" /></svg>
					<input id="subscription-search" type="search" value={q} oninput={(e) => onSearchInput(e.currentTarget.value)} placeholder="Search by name" aria-label="Search subscriptions" class="field-control py-2 pl-10 pr-11" />
					{#if q}
						<button type="button" aria-label="Clear search" onclick={clearSearch} class="absolute right-1 top-1/2 flex min-h-11 min-w-11 -translate-y-1/2 items-center justify-center rounded-[var(--radius-control)] text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">
							<svg aria-hidden="true" class="size-5" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6 6l8 8M14 6l-8 8" stroke-linecap="round" /></svg>
						</button>
					{/if}
				</div>
				<details id="category-filter" class="filter-menu" open={openFilter === 'category'} ontoggle={(e) => { if ((e.currentTarget as HTMLDetailsElement).open) openFilter = 'category'; else if (openFilter === 'category') openFilter = null; }}>
					<summary aria-label="Filter by category{categoryName ? `: ${categoryName}` : ''}" aria-expanded={openFilter === 'category'} onclick={(e) => { e.preventDefault(); toggleFilter('category'); }} onkeydown={(e) => { if (e.key === 'Escape') closeFilters(); }} class="filter-menu-button {categoryId ? 'filter-menu-button-active' : ''}">
						<svg aria-hidden="true" class="size-5" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 5h14l-5.5 6.5V16l-3 1.5v-6L3 5Z" stroke-linejoin="round" /></svg>
						{#if categoryId}<span aria-hidden="true" class="absolute right-2 top-2 size-2 rounded-full bg-primary"></span>{/if}
					</summary>
					<div class="filter-menu-panel" role="listbox" aria-label="Category options">
						<button type="button" role="option" aria-selected={categoryId === ''} onclick={() => { categoryId = ''; closeFilters(); }} class="filter-menu-option {categoryId === '' ? 'filter-menu-option-active' : ''}">All categories</button>
						{#each filterCategories as c (c.id)}<button type="button" role="option" aria-selected={categoryId === String(c.id)} onclick={() => { categoryId = String(c.id); closeFilters(); }} class="filter-menu-option {categoryId === String(c.id) ? 'filter-menu-option-active' : ''}">{c.name}</button>{/each}
					</div>
				</details>
				<details id="payment-filter" class="filter-menu" open={openFilter === 'payment'} ontoggle={(e) => { if ((e.currentTarget as HTMLDetailsElement).open) openFilter = 'payment'; else if (openFilter === 'payment') openFilter = null; }}>
					<summary aria-label="Filter by payment method{paymentName ? `: ${paymentName}` : ''}" aria-expanded={openFilter === 'payment'} onclick={(e) => { e.preventDefault(); toggleFilter('payment'); }} onkeydown={(e) => { if (e.key === 'Escape') closeFilters(); }} class="filter-menu-button {paymentMethodId ? 'filter-menu-button-active' : ''}">
						<svg aria-hidden="true" class="size-5" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="5.5" width="14" height="9" rx="1.5" /><path d="M3 8.5h14M6.5 12h4" stroke-linecap="round" /></svg>
						{#if paymentMethodId}<span aria-hidden="true" class="absolute right-2 top-2 size-2 rounded-full bg-primary"></span>{/if}
					</summary>
					<div class="filter-menu-panel" role="listbox" aria-label="Payment method options">
						<button type="button" role="option" aria-selected={paymentMethodId === ''} onclick={() => { paymentMethodId = ''; closeFilters(); }} class="filter-menu-option {paymentMethodId === '' ? 'filter-menu-option-active' : ''}">All payment methods</button>
						{#each filterPaymentMethods as m (m.id)}<button type="button" role="option" aria-selected={paymentMethodId === String(m.id)} onclick={() => { paymentMethodId = String(m.id); closeFilters(); }} class="filter-menu-option {paymentMethodId === String(m.id) ? 'filter-menu-option-active' : ''}">{m.name}</button>{/each}
					</div>
				</details>
			</div>
		</div>

		<div class="filter-status">
			<p role="status" aria-live="polite">{filtered.length} of {activeCount} {activeCount === 1 ? 'subscription' : 'subscriptions'}</p>
			{#if hasFilters}<button type="button" aria-label="Clear filters" onclick={clearAllFilters} class="min-h-11 rounded-[var(--radius-control)] px-2 underline decoration-border underline-offset-4 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">Clear</button>{/if}
		</div>

		{#if filtered.length === 0}
			<div class="empty-state">
				<p class="text-base font-medium">{activeCount === 0 ? 'No subscriptions yet.' : 'No subscriptions match.'}</p>
				<p class="mt-2 text-sm text-muted-foreground">{activeCount === 0 ? 'Add your first subscription to get started.' : 'Try another search or clear your filters.'}</p>
				<div class="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
					{#if activeCount === 0}
						<a href="/subscriptions/new" class="primary-action primary-action-inline">Add subscription</a>
					{:else}
						<button type="button" aria-label="Clear filters" onclick={clearAllFilters} class="primary-action primary-action-inline">Clear filters</button>
					{/if}
				</div>
			</div>
		{:else}
			<ul aria-label="Subscriptions" class="divide-y divide-border border-y border-border" data-sveltekit-preload-data="tap" data-sveltekit-preload-code="viewport">
				{#each filtered as s (s.id)}
					<li class="sub-row">
						<a href="/subscriptions/{s.id}" class="flex min-h-14 items-center gap-3 rounded-[var(--radius-control)] px-3 py-3.5 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring">
							<span class="min-w-0 flex-1">
								<span class="flex min-w-0 items-center gap-3">
									<span class="min-w-0 flex-1 truncate text-base font-semibold">{s.category_name ? `[${s.category_name}] ${s.name}` : s.name}</span>
									<span class="shrink-0 text-right text-base font-semibold tabular-nums">{formatPrice(s.price, s.currencyCode)}</span>
								</span>
								<span class="mt-1 flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
									<span class="min-w-0 flex-1 truncate">{s.payment_method_name || 'No payment method'}</span>
									<span class="shrink-0 tabular-nums">Next payment {s.next_payment || 'Not set'}</span>
								</span>
							</span>
						</a>
					</li>
				{/each}
			</ul>
		{/if}
	</div>
</main>
