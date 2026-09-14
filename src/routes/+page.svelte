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

		<h1 class="mt-4 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">Subscriptions</h1>
		<p class="mt-2 text-base leading-relaxed text-muted-foreground">Your subscriptions, in one place.</p>

		<p class="mt-6">
			<a href="/subscriptions/new" class="flex min-h-12 w-full items-center justify-center rounded-[var(--radius-control)] bg-primary px-5 text-base font-semibold text-primary-foreground transition-colors hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
				Add subscription
			</a>
		</p>

		<div class="mt-6 flex flex-col gap-3">
			<input type="search" bind:value={q} placeholder="Search subscriptions" aria-label="Search subscriptions" class="min-h-12 w-full rounded-[var(--radius-control)] border border-border bg-background px-4 text-base focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" />
			<select bind:value={categoryId} aria-label="Filter by category" class="min-h-12 w-full rounded-[var(--radius-control)] border border-border bg-background px-3 text-base focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
				<option value="">All categories</option>
				{#each data.categories as c (c.id)}<option value={String(c.id)}>{c.name}</option>{/each}
			</select>
			<select bind:value={paymentMethodId} aria-label="Filter by payment method" class="min-h-12 w-full rounded-[var(--radius-control)] border border-border bg-background px-3 text-base focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
				<option value="">All payments</option>
				{#each data.paymentMethods as m (m.id)}<option value={String(m.id)}>{m.name}</option>{/each}
			</select>
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
			<ul class="flex flex-col divide-y divide-border border-y border-border">
				{#each filtered as s (s.id)}
					<li>
						<a href="/subscriptions/{s.id}" class="flex min-h-12 flex-col items-start gap-1 py-3 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring">
							<span class="break-words text-base font-medium [overflow-wrap:anywhere]">{s.name}</span>
							<span class="text-sm text-muted-foreground tabular-nums">
								{s.currencyCode} {s.price} · {s.next_payment || '—'}
							</span>
							{#if s.category_name || s.payment_method_name}
								<span class="text-sm text-muted-foreground break-words">{[s.category_name, s.payment_method_name].filter(Boolean).join(' · ')}</span>
							{/if}
						</a>
					</li>
				{/each}
			</ul>
		{/if}
	</div>
</main>
