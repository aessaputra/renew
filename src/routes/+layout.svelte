<script lang="ts">
	import './layout.css';
	import { onMount } from 'svelte';

	let { children } = $props();
	let online = $state(true);
	let installEvt = $state<any>(null);

	onMount(() => {
		online = navigator.onLine;
		const up = () => (online = true);
		const down = () => (online = false);
		window.addEventListener('online', up);
		window.addEventListener('offline', down);
		const bip = (e: Event) => {
			e.preventDefault();
			installEvt = e;
		};
		window.addEventListener('beforeinstallprompt', bip);
		if ('serviceWorker' in navigator) {
			navigator.serviceWorker.register('/service-worker.js', { scope: '/' }).catch(() => {});
			navigator.serviceWorker.addEventListener('controllerchange', () => location.reload());
		}
		return () => {
			window.removeEventListener('online', up);
			window.removeEventListener('offline', down);
			window.removeEventListener('beforeinstallprompt', bip);
		};
	});

	async function install() {
		if (!installEvt) return;
		installEvt.prompt();
		await installEvt.userChoice.catch(() => {});
		installEvt = null;
	}
</script>

{#if !online}
	<p role="status" class="w-full bg-primary px-4 py-2 text-center text-sm text-primary-foreground">
		Offline. Showing saved pages.
	</p>
{/if}

{@render children()}

{#if installEvt}
	<button
		type="button"
		onclick={install}
		class="primary-action"
		style="position: fixed; right: 1rem; bottom: 1rem;"
	>
		Install Renew
	</button>
{/if}
