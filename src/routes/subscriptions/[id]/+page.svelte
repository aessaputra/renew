<svelte:head>
	<title>Renew — Subscription detail</title>
	<meta name="description" content="Renew — subscription detail." />
</svelte:head>

<script lang="ts">
	import { formatBillingInterval, formatPrice, safeSubscriptionUrl } from '#lib/wallos.js';
	let { data, form } = $props();
	let s = $derived(data.subscription);
	let href = $derived(safeSubscriptionUrl(s.url));
	let deleteDialog = $state<HTMLDialogElement | undefined>();
</script>

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
		<a href="/" class="back-link">
			<svg aria-hidden="true" class="size-4" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M16 10H4M10 4l-6 6 6 6" stroke-linecap="round" stroke-linejoin="round" /></svg> Back to list
		</a>

		<section aria-labelledby="subscription-heading" class="mt-6">
			<div class="detail-hero mb-8">
				<h1 id="subscription-heading" class="page-title min-w-0">{s.name}</h1>
				<p class="text-2xl font-medium tracking-tight tabular-nums [overflow-wrap:anywhere] sm:text-3xl"><span class="sr-only">Price: </span>{formatPrice(s.price, s.currencyCode)}</p>
			</div>
			<dl class="billing-grid">
			<div>
				<dt>Next payment</dt>
				<dd>{s.next_payment || 'Not set'}</dd>
			</div>
			<div>
				<dt>Start date</dt>
				<dd>{s.start_date || 'Not set'}</dd>
			</div>
			<div>
				<dt>Billing interval</dt>
				<dd class="tabular-nums">{formatBillingInterval(s.cycle, s.frequency)}</dd>
			</div>
			<div>
				<dt>Category</dt>
				<dd>{s.category_name || 'Not set'}</dd>
			</div>
			<div>
				<dt>Payment method</dt>
				<dd>{s.payment_method_name || 'Not set'}</dd>
			</div>
			<div>
				<dt>Reminder</dt>
				<dd>
					{s.notify === 1 ? `On · ${s.notify_days_before} days before` : 'Off'}
				</dd>
			</div>
			{#if s.url}
				<div>
					<dt>URL</dt>
					<dd>
						{#if href}
							<a {href} target="_blank" rel="noopener" class="inline-flex min-h-11 items-center gap-1.5 rounded-[var(--radius-control)] px-2 underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"><svg aria-hidden="true" class="size-4 shrink-0" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 4h4v4M16 4l-9 9M8 6H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-3" stroke-linecap="round" stroke-linejoin="round" /></svg>Open<span class="sr-only"> in new tab</span></a>
						{:else}
							{s.url}
						{/if}
					</dd>
				</div>
			{/if}
			{#if s.notes}
				<div class="billing-notes">
					<dt>Notes</dt>
					<dd class="text-base leading-relaxed whitespace-pre-line">{s.notes}</dd>
				</div>
			{/if}
			</dl>
			<div class="detail-actions">
				<a href="/subscriptions/{s.id}/edit" aria-label="Edit {s.name}" class="primary-action primary-action-inline">Edit</a>
				<button type="button" onclick={() => { if (deleteDialog && !deleteDialog.open) deleteDialog.showModal(); }} class="danger-action danger-action-inline">Delete subscription</button>
				<dialog bind:this={deleteDialog} aria-labelledby="delete-dialog-title" class="delete-dialog">
					<h2 id="delete-dialog-title" class="text-xl font-semibold tracking-tight">Delete {s.name} ?</h2>
					<p class="mt-2 text-base leading-relaxed text-muted-foreground">This permanently deletes this subscription. This cannot be undone.</p>
					<div class="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
						<form method="dialog">
							<button type="submit" class="secondary-action">Cancel</button>
						</form>
						<form method="POST" action="/subscriptions/{s.id}?/delete">
							<input type="hidden" name="confirm" value="yes" />
							<button
								type="submit"
								aria-label="Delete {s.name}"
								class="danger-action danger-action-inline"
							>
								Delete
							</button>
						</form>
					</div>
				</dialog>
			</div>
		</section>

		{#if form?.errors}
			<ul role="alert" class="mt-6 rounded-[var(--radius-control)] border border-border bg-surface px-4 py-3 text-danger">
				{#each form.errors as e, i (i)}
					<li class="text-base">{e}</li>
				{/each}
			</ul>
		{/if}
	</div>
</main>
