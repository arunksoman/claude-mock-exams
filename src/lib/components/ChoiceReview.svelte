<script lang="ts">
	import { CircleCheck, CircleX, Circle } from '@lucide/svelte';
	import Markdown from './Markdown.svelte';
	import type { GradedChoice } from '$lib/types';

	interface Props {
		choices: GradedChoice[];
		/** When false, only selected choices are marked right/wrong — unselected correct
		 * choices stay neutral instead of being revealed. Used for the live in-progress
		 * practice view; the post-session history review keeps the full reveal (default). */
		revealAll?: boolean;
	}

	let { choices, revealAll = true }: Props = $props();
</script>

<div class="review">
	{#each choices as choice (choice.id)}
		{@const showCorrect = choice.isCorrect && (revealAll || choice.selected)}
		<div
			class="choice"
			class:correct={showCorrect}
			class:incorrect={choice.selected && !choice.isCorrect}
			class:selected={choice.selected}
		>
			<div class="row">
				<span class="icon">
					{#if showCorrect}
						<CircleCheck size={18} strokeWidth={1.75} />
					{:else if choice.selected}
						<CircleX size={18} strokeWidth={1.75} />
					{:else}
						<Circle size={18} strokeWidth={1.5} />
					{/if}
				</span>
				<Markdown html={choice.labelHtml} tag="div" />
				{#if choice.selected}
					<span class="tag">your answer</span>
				{/if}
			</div>
			<div class="reasoning">
				<Markdown html={choice.reasoningHtml} tag="div" />
			</div>
		</div>
	{/each}
</div>

<style>
	.review {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}

	.choice {
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		padding: var(--space-3) var(--space-4);
		background: var(--surface);
	}

	.choice.correct {
		border-color: var(--success);
		background: var(--success-soft);
	}

	.choice.incorrect {
		border-color: var(--danger);
		background: var(--danger-soft);
	}

	.row {
		display: flex;
		align-items: flex-start;
		gap: var(--space-3);
		font-size: 0.94rem;
		font-weight: 500;
	}

	.icon {
		flex-shrink: 0;
		margin-top: 0.1em;
	}

	.choice.correct .icon {
		color: var(--success);
	}

	.choice.incorrect .icon {
		color: var(--danger);
	}

	.tag {
		margin-left: auto;
		flex-shrink: 0;
		font-size: 0.72rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.03em;
		color: var(--text-muted);
		white-space: nowrap;
	}

	.reasoning {
		margin-top: var(--space-2);
		margin-left: calc(18px + var(--space-3));
		font-size: 0.88rem;
		color: var(--text-secondary);
	}
</style>
