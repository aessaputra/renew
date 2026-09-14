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

<main
	class="flex min-h-dvh items-center justify-center bg-background px-4 py-10 font-sans text-foreground sm:px-8 [padding-left:max(1rem,env(safe-area-inset-left))] [padding-right:max(1rem,env(safe-area-inset-right))]"
>
	<div class="w-full max-w-md text-left">
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
				class="inline-flex min-h-12 items-center justify-center rounded-[var(--radius-control)] bg-primary px-5 text-base font-semibold text-primary-foreground transition-colors hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
			>
				Back to home
			</a>
		</p>
	</div>
</main>
