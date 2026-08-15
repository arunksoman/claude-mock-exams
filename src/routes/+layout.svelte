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
		/* Viewport unit, not a percentage of body/html — percentage min-height on this element
		   would depend on body/html having a definite height, which isn't reliable across
		   browsers unless html/body are given an explicit `height` (which in turn clips any
		   content taller than one viewport, since a fixed `height` doesn't grow to fit
		   overflowing children — the actual bug this replaced: pages taller than one screen had
		   an unpainted gap below the clipped body background). `dvh` sizes against the real
		   viewport directly and still lets this element grow past 100dvh for taller content. */
		min-height: 100dvh;
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
