<svelte:head>
	<title>Renew — Subscription detail</title>
	<meta name="description" content="Renew — subscription detail." />
</svelte:head>

<script lang="ts">
	import { safeSubscriptionUrl } from '$lib/wallos';
	let { data, form } = $props();
	let s = $derived(data.subscription);
	let href = $derived(safeSubscriptionUrl(s.url));
</script>

<main class="page-shell bg-background font-sans text-foreground">
	<div class="mx-auto w-full max-w-3xl text-left">
		<a href="/" class="inline-flex min-h-12 items-center gap-2 rounded-[var(--radius-control)] text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
			<span aria-hidden="true">←</span> Back to list
		</a>

		<h1 class="mt-4 text-3xl font-semibold tracking-tight text-balance break-words sm:text-4xl">
			{s.name}
		</h1>
		<p class="mt-3 text-xl font-semibold tabular-nums">
			{s.currencyCode}
			{s.price} · {s.next_payment || '—'}
		</p>

		<div class="mt-8 flex flex-col gap-4"><section aria-labelledby="billing-heading" class="rounded-xl border border-border px-4 py-4"><h2 id="billing-heading" class="text-sm font-semibold text-muted-foreground">Billing</h2><dl class="mt-3 flex flex-col divide-y divide-border">
			<div class="flex flex-wrap justify-between gap-3 py-3">
				<dt class="text-base text-muted-foreground">Next payment</dt>
				<dd class="min-w-0 break-words text-base">{s.next_payment || '—'}</dd>
			</div>
			<div class="flex flex-wrap justify-between gap-3 py-3">
				<dt class="text-base text-muted-foreground">Start date</dt>
				<dd class="min-w-0 break-words text-base">{s.start_date || '—'}</dd>
			</div>
			<div class="flex flex-wrap justify-between gap-3 py-3">
				<dt class="text-base text-muted-foreground">Cycle</dt>
				<dd class="text-base tabular-nums">{s.cycle}</dd>
			</div>
			<div class="flex flex-wrap justify-between gap-3 py-3">
				<dt class="text-base text-muted-foreground">Frequency</dt>
				<dd class="text-base tabular-nums">{s.frequency}</dd>
			</div>
			<div class="flex flex-wrap justify-between gap-3 py-3">
				<dt class="text-base text-muted-foreground">Category</dt>
				<dd class="min-w-0 break-words text-base">{s.category_name || '—'}</dd>
			</div>
			<div class="flex flex-wrap justify-between gap-3 py-3">
				<dt class="text-base text-muted-foreground">Payment method</dt>
				<dd class="min-w-0 break-words text-base">{s.payment_method_name || '—'}</dd>
			</div>
			<div class="flex flex-wrap justify-between gap-3 py-3">
				<dt class="text-base text-muted-foreground">Reminder</dt>
				<dd class="min-w-0 break-words text-base">
					{s.notify === 1 ? `On · ${s.notify_days_before} days before` : 'Off'}
				</dd>
			</div>
			{#if s.url}
				<div class="flex flex-wrap justify-between gap-3 py-3">
					<dt class="text-base text-muted-foreground">URL</dt>
					<dd class="min-w-0 break-words text-base">
						{#if href}
							<a {href} rel="noopener" class="underline">Open</a>
						{:else}
							{s.url}
						{/if}
					</dd>
				</div>
			{/if}
			{#if s.notes}
				<div class="flex flex-col gap-1 py-3">
					<dt class="text-base text-muted-foreground">Notes</dt>
					<dd class="text-base leading-relaxed break-words whitespace-pre-line">{s.notes}</dd>
				</div>
			{/if}
		</dl></section>
	</div>
		<div class="mt-6 flex flex-col gap-3">
			<a
				href="/subscriptions/{s.id}/edit"
				class="flex min-h-12 w-full items-center justify-center rounded-[var(--radius-control)] bg-primary px-5 text-base font-semibold text-primary-foreground transition-colors hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
			>
				Edit
			</a>
		</div>
		{#if form?.errors}
			<p role="alert" class="mt-3">{form.errors.join(' ')}</p>
		{/if}
		<details class="rounded-xl border border-border px-4 py-1">
			<summary class="inline-flex min-h-12 cursor-pointer items-center py-3 font-medium">Delete subscription</summary>
		<form method="POST" action="/subscriptions/{s.id}?/delete" class="mt-3">
			<label class="flex min-h-12 items-center gap-3">
				<input type="checkbox" name="confirm" value="yes" required />
				Delete {s.name} permanently
			</label>
			<button
				type="submit"
				aria-label="Delete {s.name}"
				class="flex min-h-12 w-full items-center justify-center rounded-[var(--radius-control)] border border-border px-5 text-base font-semibold text-foreground transition-colors hover:bg-primary/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
			>
				Delete
			</button>
		</form>
		</details>
	</div>
</main>
