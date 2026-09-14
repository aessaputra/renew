<svelte:head>
	<title>Sign in to Renew</title>
	<meta name="description" content="Sign in to Renew to manage your subscriptions." />
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

<main
	class="flex min-h-dvh items-center justify-center bg-background px-4 py-10 font-sans text-foreground sm:px-8 [padding-left:max(1rem,env(safe-area-inset-left))] [padding-right:max(1rem,env(safe-area-inset-right))]"
>
	<div class="w-full max-w-md">
		<p class="text-sm font-medium text-muted-foreground">Renew</p>
		<h1 class="mt-2 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
			Sign in
		</h1>
		<p class="mt-2 text-base leading-relaxed text-muted-foreground">
			Your subscriptions, in one place.
		</p>
		{#if errorMessage}
			<p
				role="alert"
				class="mt-6 rounded-[var(--radius-control)] border border-border px-4 py-3 text-base text-foreground"
			>
				{errorMessage}
			</p>
		{/if}
		<form method="POST" action="/auth/login" class="mt-6">
			<button
				type="submit"
				class="flex min-h-12 w-full items-center justify-center rounded-[var(--radius-control)] bg-primary px-5 text-base font-semibold whitespace-nowrap text-primary-foreground transition-colors hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
			>
				Continue with OIDC
			</button>
		</form>
	</div>
</main>
