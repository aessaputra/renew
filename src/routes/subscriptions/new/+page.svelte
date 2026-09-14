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
	let values = $derived(state.values ?? {});
</script>

<main
	class="min-h-dvh bg-background px-4 pb-16 font-sans text-foreground sm:px-8 [padding-left:max(1rem,env(safe-area-inset-left))] [padding-right:max(1rem,env(safe-area-inset-right))]"
>
	<div class="mx-auto w-full max-w-md text-left">
		<a href="/" class="inline-flex min-h-12 items-center gap-2 rounded-[var(--radius-control)] text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
			<span aria-hidden="true">←</span> Back to list
		</a>

		<h1 class="mt-4 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
			Add subscription
		</h1>

		{#if state.errors}
			<ul role="alert" class="mt-6 rounded-[var(--radius-control)] border border-border px-4 py-3">
				{#each state.errors as e (e)}
					<li class="text-base text-foreground">{e}</li>
				{/each}
			</ul>
		{/if}

		<SubscriptionForm {data} {values} action="?/create" />
			</div>
</main>
