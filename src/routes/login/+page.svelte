<svelte:head>
	<title>Renew — Sign in</title>
	<meta name="description" content="Renew — sign in to manage your subscriptions." />
</svelte:head>

<script lang="ts">
	import { page } from '$app/state';

	const messages: Record<string, string> = {
		failed: "Couldn't sign in. Please try again.",
		denied: "This account can't access Renew.",
		expired: 'Sign-in expired. Please try again.',
		unavailable: 'Sign-in is unavailable. Please try again later.'
	};

	let errorCode = $derived(page.url.searchParams.get('error'));
	let errorMessage = $derived(errorCode ? (messages[errorCode] ?? messages.failed) : null);
</script>

<main class="page-shell page-shell-centered flex items-center justify-center bg-background font-sans text-foreground">
	<div class="card w-full max-w-md text-left">
		<a href="/" aria-label="Renew home" class="brand-link">
			<span aria-hidden="true" class="flex size-8 items-center justify-center rounded-[var(--radius-control)] bg-primary text-base text-primary-foreground">r.</span>
			<span>Renew</span>
		</a>
		<h1 class="page-title mt-4">
			Sign in
		</h1>
		<p class="mt-2 text-base leading-relaxed text-muted-foreground">
			Your subscriptions, in one place.
		</p>
		{#if errorMessage}
			<p
				role="alert"
				class="mt-6 rounded-[var(--radius-control)] border border-border bg-surface px-4 py-3 text-base text-danger"
			>
				{errorMessage}
			</p>
		{/if}
		<form method="POST" action="/auth/login" class="mt-6">
			<button
				type="submit"
				class="primary-action primary-action-block"
			>
				Continue with OIDC
			</button>
		</form>
	</div>
</main>
