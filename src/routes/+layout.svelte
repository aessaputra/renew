<script lang="ts">
	import './layout.css';
	import { onMount } from 'svelte';

	let { children } = $props();
	let online = $state(true);

	onMount(() => {
		online = navigator.onLine;
		const up = () => (online = true);
		const down = () => (online = false);
		window.addEventListener('online', up);
		window.addEventListener('offline', down);
		if ('serviceWorker' in navigator) {
			navigator.serviceWorker.register('/service-worker.js', { scope: '/' }).catch(() => {});
			navigator.serviceWorker.addEventListener('controllerchange', () => location.reload());
		}
		return () => {
			window.removeEventListener('online', up);
			window.removeEventListener('offline', down);
		};
	});
</script>

{#if !online}
	<p role="status" class="w-full bg-primary px-4 py-2 text-center text-sm text-primary-foreground">
		Offline. Showing saved pages.
	</p>
{/if}

{@render children()}
