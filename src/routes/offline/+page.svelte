<svelte:head>
	<title>Offline — Renew</title>
	<meta name="description" content="Renew is offline. Check your connection." />
</svelte:head>

<main class="page-shell bg-background font-sans text-foreground">
	<div class="mx-auto w-full max-w-5xl text-center">
		<p aria-hidden="true" class="mt-16 text-4xl">Offline</p>
		<h1 class="page-title mt-4">You are offline</h1>
		<p class="mt-2 text-muted-foreground">Saved pages work. New data needs a connection.</p>
		<div class="mt-6 flex justify-center gap-2">
			<a href="/" class="primary-action primary-action-inline">Home</a>
			<button
				type="button"
				class="primary-action primary-action-inline"
				onclick={() => location.reload()}
			>
				Retry
			</button>
		</div>
	</div>
</main>
