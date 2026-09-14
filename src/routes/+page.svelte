<script lang="ts">
	import { filterSubscriptions } from '$lib/wallos';

	let { data } = $props();
	let q = $state('');
	let categoryId = $state('');
	let paymentMethodId = $state('');
	let activeCount = $derived(data.subscriptions.filter((s) => s.inactive === 0).length);
	let hasFilters = $derived(Boolean(q || categoryId || paymentMethodId));
	// ponytail: client filtering suits a personal list; use server pagination for large datasets.
	let filtered = $derived(filterSubscriptions(data.subscriptions, { q, categoryId, paymentMethodId }));
</script>

<svelte:head>
	<title>Renew — Subscriptions</title>
	<meta name="description" content="Renew — your subscriptions, in one place." />
</svelte:head>

<main class="page-shell bg-background font-sans text-foreground">
	<div class="mx-auto w-full max-w-5xl text-left">
		<header class="flex min-h-16 items-center justify-between gap-4">
			<a href="/" aria-label="Renew home" class="inline-flex min-h-12 items-center gap-2 rounded-[var(--radius-control)] font-semibold tracking-tight focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
				<span aria-hidden="true" class="flex size-8 items-center justify-center rounded-[var(--radius-control)] bg-primary text-base text-primary-foreground">r.</span>
				<span>Renew</span>
			</a>
			<form method="POST" action="/auth/logout">
				<button type="submit" class="min-h-12 rounded-[var(--radius-control)] px-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">Sign out</button>
			</form>
		</header>

		<div class="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
			<h1 class="text-3xl font-semibold tracking-tight sm:text-4xl">Subscriptions</h1>
			<a href="/subscriptions/new" class="primary-action w-full sm:w-auto">Add subscription</a>
		</div>

		<div class="mt-6 grid grid-cols-1 gap-4 rounded-xl border border-border bg-surface p-4 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
			<div class="flex min-w-0 flex-col gap-2">
				<label for="subscription-search" class="text-sm font-medium">Search subscriptions</label>
				<input id="subscription-search" type="search" bind:value={q} placeholder="Search by name" class="field-control" />
			</div>
			<div class="flex min-w-0 flex-col gap-2">
				<label for="category-filter" class="text-sm font-medium">Category</label>
				<select id="category-filter" bind:value={categoryId} aria-label="Filter by category" class="field-control">
					<option value="">All categories</option>
					{#each data.categories as c (c.id)}<option value={String(c.id)}>{c.name}</option>{/each}
				</select>
			</div>
			<div class="flex min-w-0 flex-col gap-2">
				<label for="payment-filter" class="text-sm font-medium">Payment method</label>
				<select id="payment-filter" bind:value={paymentMethodId} aria-label="Filter by payment method" class="field-control">
					<option value="">All payments</option>
					{#each data.paymentMethods as m (m.id)}<option value={String(m.id)}>{m.name}</option>{/each}
				</select>
			</div>
		</div>

		<div class="flex min-h-14 items-center justify-between gap-4 text-sm text-muted-foreground">
			<p role="status" aria-live="polite">{filtered.length} of {activeCount} {activeCount === 1 ? 'subscription' : 'subscriptions'}</p>
			{#if hasFilters}<button type="button" onclick={() => { q = ''; categoryId = ''; paymentMethodId = ''; }} class="min-h-11 rounded-[var(--radius-control)] px-2 underline decoration-border underline-offset-4 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">Clear</button>{/if}
		</div>

		{#if filtered.length === 0}
			<div class="rounded-xl border border-dashed border-border px-5 py-12 text-center">
				<p class="text-base font-medium">{activeCount === 0 ? 'No subscriptions yet.' : 'No subscriptions match.'}</p>
				<p class="mt-2 text-sm text-muted-foreground">{activeCount === 0 ? 'Add your first subscription to get started.' : 'Try another search or clear your filters.'}</p>
			</div>
		{:else}
			<ul aria-label="Subscriptions" class="divide-y divide-border border-y border-border">
				{#each filtered as s (s.id)}
					<li>
						<a href="/subscriptions/{s.id}" class="grid min-h-12 grid-cols-1 gap-2 rounded-[var(--radius-control)] px-2 py-4 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring md:grid-cols-[minmax(0,1fr)_auto] md:gap-x-6">
							<span class="min-w-0 break-words text-base font-semibold [overflow-wrap:anywhere]">{s.name}</span>
							<span class="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1 tabular-nums md:row-span-2 md:flex-col md:items-end">
								<span class="text-lg font-semibold">{s.currencyCode} {s.price}</span>
								<span class="text-sm text-muted-foreground">Next payment {s.next_payment || 'Not set'}</span>
							</span>
							{#if s.category_name || s.payment_method_name}
								<span class="min-w-0 break-words text-sm text-muted-foreground">{[s.category_name, s.payment_method_name].filter(Boolean).join(' · ')}</span>
							{/if}
						</a>
					</li>
				{/each}
			</ul>
		{/if}
	</div>
</main>
