<script lang="ts">
	import { Maximize, Minimize } from '@lucide/svelte';

	interface Props {
		target: HTMLElement | null;
	}

	let { target }: Props = $props();

	let fullscreenElement = $state<Element | null>(null);
	const isFullscreen = $derived(fullscreenElement !== null);

	function toggle() {
		if (isFullscreen) {
			document.exitFullscreen();
		} else {
			target?.requestFullscreen();
		}
	}
</script>

<svelte:document bind:fullscreenElement />

<button
	type="button"
	class="toggle"
	onclick={toggle}
	aria-label={isFullscreen ? 'Exit distraction-free mode' : 'Enter distraction-free mode'}
	title={isFullscreen ? 'Exit distraction-free mode' : 'Enter distraction-free mode'}
>
	{#if isFullscreen}
		<Minimize size={16} strokeWidth={1.75} />
	{:else}
		<Maximize size={16} strokeWidth={1.75} />
	{/if}
	<span>{isFullscreen ? 'Exit full screen' : 'Full screen'}</span>
</button>

<style>
	.toggle {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-2) var(--space-3);
		border-radius: var(--radius-sm);
		border: 1px solid var(--border);
		background: var(--surface);
		color: var(--text-secondary);
		cursor: pointer;
		font-size: 0.85rem;
	}

	.toggle:hover {
		background: var(--surface-hover);
		color: var(--text);
	}
</style>
