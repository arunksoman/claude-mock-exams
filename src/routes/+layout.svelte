<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import { browser } from '$app/environment';
	import AppHeader from '$lib/components/AppHeader.svelte';
	import { initAllAppState } from '$lib/state/index.svelte';

	let { children } = $props();

	$effect(() => {
		if (browser) initAllAppState();
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<div class="app-shell">
	<AppHeader />
	<main>
		{@render children()}
	</main>
</div>

<style>
	.app-shell {
		min-height: 100%;
		display: flex;
		flex-direction: column;
	}

	main {
		flex: 1;
		width: 100%;
		max-width: 960px;
		margin: 0 auto;
		padding: var(--space-6) var(--space-5) var(--space-8);
	}

	@media (max-width: 640px) {
		main {
			padding: var(--space-4) var(--space-4) var(--space-6);
		}
	}
</style>
