<script lang="ts">
	import { Strikethrough } from '@lucide/svelte';
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
		struck?: number[];
		onchange?: (selected: number[]) => void;
		onstrike?: (choiceId: number) => void;
	}

	let {
		choices,
		questionType,
		selectCount,
		selected = $bindable(),
		disabled = false,
		struck = $bindable([]),
		onchange,
		onstrike
	}: Props = $props();

	const isMultiple = $derived(questionType === 'multiple_response');

	function toggle(id: number) {
		if (disabled || struck.includes(id)) return;
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

	function toggleStrike(id: number) {
		if (disabled) return;
		const nowStruck = !struck.includes(id);
		struck = nowStruck ? [...struck, id] : struck.filter((c) => c !== id);
		onstrike?.(id);

		// Striking an already-selected choice deselects it — can't leave the picker in a
		// contradictory "eliminated but still my answer" state. Unstriking never re-selects
		// anything on its own; the candidate has to pick it again themselves.
		if (nowStruck && selected.includes(id)) {
			selected = selected.filter((c) => c !== id);
			onchange?.(selected);
		}
	}
</script>

<div class="picker" role="group">
	{#if isMultiple}
		<p class="hint">Select {selectCount}</p>
	{/if}
	{#each choices as choice (choice.id)}
		{@const checked = selected.includes(choice.id)}
		{@const isStruck = struck.includes(choice.id)}
		<div class="row" class:struck={isStruck}>
			<button
				type="button"
				class="option"
				class:checked
				disabled={disabled || isStruck}
				onclick={() => toggle(choice.id)}
				role={isMultiple ? 'checkbox' : 'radio'}
				aria-checked={checked}
			>
				<span class="control" class:isMultiple>
					{#if checked}<span class="dot"></span>{/if}
				</span>
				<Markdown html={choice.labelHtml} tag="div" />
			</button>
			<button
				type="button"
				class="strike-btn"
				class:active={isStruck}
				{disabled}
				aria-pressed={isStruck}
				aria-label={isStruck ? 'Restore this option' : 'Strike out this option'}
				title={isStruck ? 'Restore this option' : 'Strike out this option'}
				onclick={() => toggleStrike(choice.id)}
			>
				<Strikethrough size={13} strokeWidth={1.75} />
			</button>
		</div>
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

	.row {
		display: flex;
		align-items: center;
		gap: var(--space-1);
	}

	.option {
		flex: 1;
		min-width: 0;
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

	/* Struck-off options are the candidate's own "ruled this out" note — dim the whole row and
	   strike the text, but never hide it or block re-selecting it; it's just a reading aid. */
	.row.struck .option {
		opacity: 0.55;
	}

	.row.struck .option :global(.markdown) {
		text-decoration: line-through;
		text-decoration-thickness: 1.5px;
		text-decoration-color: var(--text-muted);
	}

	/* Just a small icon, not a full button — a subtle hover/focus circle is the only chrome, so
	   it doesn't visually compete with the choice itself. The padding (not a fixed box) is what
	   keeps the tap target reasonable on mobile without making the icon look bigger than it is. */
	.strike-btn {
		flex-shrink: 0;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 6px;
		border: none;
		border-radius: 50%;
		background: none;
		color: var(--text-muted);
		cursor: pointer;
	}

	.strike-btn:hover:not(:disabled),
	.strike-btn:focus-visible {
		background: var(--surface-hover);
		color: var(--text);
	}

	.strike-btn.active {
		color: var(--danger);
	}

	.strike-btn.active:hover:not(:disabled) {
		background: var(--danger-soft);
	}

	.strike-btn:disabled {
		cursor: default;
		opacity: 0.5;
	}
</style>
