<script lang="ts">
	import Markdown from './Markdown.svelte';
	import type { QuestionType } from '$lib/types';

	interface ChoiceOption {
		id: number;
		labelHtml: string;
	}

	interface Props {
		choices: ChoiceOption[];
		questionType: QuestionType;
		selectCount: number;
		selected: number[];
		disabled?: boolean;
		onchange?: (selected: number[]) => void;
	}

	let {
		choices,
		questionType,
		selectCount,
		selected = $bindable(),
		disabled = false,
		onchange
	}: Props = $props();

	const isMultiple = $derived(questionType === 'multiple_response');

	function toggle(id: number) {
		if (disabled) return;
		if (isMultiple) {
			if (selected.includes(id)) {
				selected = selected.filter((c) => c !== id);
			} else if (selected.length < selectCount) {
				selected = [...selected, id];
			} else {
				return;
			}
		} else {
			selected = [id];
		}
		onchange?.(selected);
	}
</script>

<div class="picker" role="group">
	{#if isMultiple}
		<p class="hint">Select {selectCount}</p>
	{/if}
	{#each choices as choice (choice.id)}
		{@const checked = selected.includes(choice.id)}
		<button
			type="button"
			class="option"
			class:checked
			{disabled}
			onclick={() => toggle(choice.id)}
			role={isMultiple ? 'checkbox' : 'radio'}
			aria-checked={checked}
		>
			<span class="control" class:isMultiple>
				{#if checked}<span class="dot"></span>{/if}
			</span>
			<Markdown html={choice.labelHtml} tag="div" />
		</button>
	{/each}
</div>

<style>
	.picker {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	.hint {
		font-size: 0.8rem;
		color: var(--text-muted);
		margin-bottom: var(--space-1);
	}

	.option {
		display: flex;
		align-items: flex-start;
		gap: var(--space-3);
		text-align: left;
		padding: var(--space-3) var(--space-4);
		border-radius: var(--radius-md);
		border: 1px solid var(--border);
		background: var(--surface);
		color: var(--text);
		cursor: pointer;
		font-size: 0.94rem;
	}

	.option:hover:not(:disabled) {
		border-color: var(--accent);
		background: var(--surface-hover);
	}

	.option.checked {
		border-color: var(--accent);
		background: var(--accent-soft);
	}

	.option:disabled {
		cursor: default;
		opacity: 0.75;
	}

	.control {
		flex-shrink: 0;
		width: 18px;
		height: 18px;
		margin-top: 0.15em;
		border-radius: 50%;
		border: 1.5px solid var(--text-muted);
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.control.isMultiple {
		border-radius: 4px;
	}

	.option.checked .control {
		border-color: var(--accent);
	}

	.dot {
		width: 9px;
		height: 9px;
		border-radius: inherit;
		background: var(--accent);
	}
</style>
