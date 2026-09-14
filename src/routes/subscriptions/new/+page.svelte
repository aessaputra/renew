<svelte:head>
	<title>Renew — Add subscription</title>
	<meta name="description" content="Renew — add a subscription." />
</svelte:head>

<script lang="ts">
	import SubscriptionForm from '$lib/components/subscription-form.svelte';
	let { data, form } = $props();
	let state = $derived(
		(form ?? {}) as { errors?: string[]; values?: Record<string, string> }
	);
	let values = $derived({ frequency: '1', cycle: '3', ...state.values });
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

		<h1 class="page-title mt-4">
			Add subscription
		</h1>

		{#if state.errors}
			<ul role="alert" class="mt-6 rounded-[var(--radius-control)] border border-border bg-surface px-4 py-3 text-danger">
				{#each state.errors as e, i (i)}
					<li class="text-base">{e}</li>
				{/each}
			</ul>
		{/if}

		<SubscriptionForm {data} {values} action="?/create" />
			</div>
</main>
