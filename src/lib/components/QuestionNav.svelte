<script lang="ts">
	import { Flag } from '@lucide/svelte';

	interface Props {
		count: number;
		currentIndex: number;
		isAnswered: (index: number) => boolean;
		isFlagged: (index: number) => boolean;
		onselect: (index: number) => void;
	}

	let { count, currentIndex, isAnswered, isFlagged, onselect }: Props = $props();

	const indices = $derived(Array.from({ length: count }, (_, i) => i));
</script>

<div class="nav">
	{#each indices as i (i)}
		<button
			type="button"
			class="cell"
			class:current={i === currentIndex}
			class:answered={isAnswered(i)}
			onclick={() => onselect(i)}
			aria-current={i === currentIndex}
			aria-label={`Question ${i + 1}${isAnswered(i) ? ', answered' : ', unanswered'}${isFlagged(i) ? ', flagged' : ''}`}
		>
			{i + 1}
			{#if isFlagged(i)}
				<Flag class="flag-dot" size={9} strokeWidth={2} fill="currentColor" />
			{/if}
		</button>
	{/each}
</div>

<style>
	.nav {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(34px, 1fr));
		gap: var(--space-2);
	}

	.cell {
		position: relative;
		height: 34px;
		border-radius: var(--radius-sm);
		border: 1px solid var(--border);
		background: var(--surface);
		color: var(--text-secondary);
		font-size: 0.8rem;
		cursor: pointer;
	}

	.cell:hover {
		border-color: var(--accent);
	}

	.cell.answered {
		background: var(--accent-soft);
		color: var(--accent);
		border-color: var(--accent-soft);
	}

	.cell.current {
		border-color: var(--accent);
		border-width: 2px;
		font-weight: 700;
	}

	.cell :global(.flag-dot) {
		position: absolute;
		top: -4px;
		right: -4px;
		color: var(--danger);
	}
</style>
