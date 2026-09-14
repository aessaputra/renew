<svelte:head>
	<title>Renew — Edit subscription</title>
	<meta name="description" content="Renew — edit a subscription." />
</svelte:head>

<script lang="ts">
	import SubscriptionForm from '$lib/components/subscription-form.svelte';
	let { data, form } = $props();
	let sub = $derived(data.subscription);
	let state = $derived(
		(form ?? {}) as { errors?: string[]; values?: Record<string, string> }
	);
	let values = $derived({
		...(sub ? {
			name: sub.name,
			price: String(sub.price),
			currency_id: String(sub.currency_id),
			frequency: String(sub.frequency),
			cycle: String(sub.cycle),
			next_payment: sub.next_payment,
			category_id: sub.category_id ? String(sub.category_id) : '',
			payment_method_id: sub.payment_method_id ? String(sub.payment_method_id) : '',
			notify: String(sub.notify),
			notify_days_before: String(sub.notify_days_before),
			url: sub.url,
			notes: sub.notes
		} : {}),
		...state.values
	});
</script>

<main
	class="min-h-dvh bg-background px-4 pb-16 font-sans text-foreground sm:px-8 [padding-left:max(1rem,env(safe-area-inset-left))] [padding-right:max(1rem,env(safe-area-inset-right))]"
>
	<div class="mx-auto w-full max-w-md text-left">
		<a href="/" class="inline-flex min-h-12 items-center gap-2 rounded-[var(--radius-control)] text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
			<span aria-hidden="true">←</span> Back to list
		</a>

		<h1 class="mt-4 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
			Edit subscription
		</h1>

		{#if state.errors}
			<ul role="alert" class="mt-6 rounded-[var(--radius-control)] border border-border px-4 py-3">
				{#each state.errors as e (e)}
					<li class="text-base text-foreground">{e}</li>
				{/each}
			</ul>
		{/if}

		<SubscriptionForm {data} {values} action="?/update" />
			</div>
</main>
