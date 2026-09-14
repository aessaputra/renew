<svelte:head>
	<title>Renew</title>
	<meta name="description" content="Renew — something went wrong." />
</svelte:head>

<script lang="ts">
	import { page } from '$app/state';

	let message = $derived(
		page.status === 404
			? 'That page could not be found.'
			: 'Something went wrong. Please try again.'
	);
</script>

<main class="page-shell page-shell-centered flex items-center justify-center bg-background font-sans text-foreground">
	<div class="w-full max-w-md rounded-xl border border-border bg-surface p-6 text-left sm:p-8">
		<p class="text-sm font-medium text-muted-foreground">Renew</p>
		<h1 class="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
			Something went wrong
		</h1>
		<p role="alert" class="mt-2 text-base leading-relaxed text-muted-foreground">
			{message}
		</p>
		<p class="mt-6">
			<a
				href="/"
				class="primary-action w-full sm:w-auto"
			>
				Back to home
			</a>
		</p>
	</div>
</main>
