<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { browser } from '$app/environment';
	import { ChevronLeft, ChevronRight, Eye, EyeOff, Check } from '@lucide/svelte';
	import Markdown from '$lib/components/Markdown.svelte';
	import ChoicePicker from '$lib/components/ChoicePicker.svelte';
	import ChoiceReview from '$lib/components/ChoiceReview.svelte';
	import {
		practiceState,
		answerPracticeQuestion,
		gotoPracticeIndex,
		finishPracticeSession
	} from '$lib/state/practice.svelte';
	import { buildGradedQuestion } from '$lib/scoring';

	let { data } = $props();

	$effect(() => {
		if (browser && !practiceState.session) goto(resolve('/practice'));
	});

	const session = $derived(practiceState.session);
	const currentQuestion = $derived(session?.questions[session.currentIndex] ?? null);
	const hasAnswered = $derived(
		currentQuestion ? Boolean(session?.revealed[currentQuestion.id]) : false
	);
	const domain = $derived(
		currentQuestion ? data.domains.find((d) => d.id === currentQuestion.domainId) : null
	);
	const isMultiple = $derived(currentQuestion?.questionType === 'multiple_response');

	let selected = $state<number[]>([]);
	// Whether the reasoning panel is showing for the current question — separate from
	// hasAnswered so the user can hide it again and reconsider without losing their answer.
	let showReasoning = $state(false);

	$effect(() => {
		if (currentQuestion && session) {
			selected = session.answers[currentQuestion.id] ?? [];
			showReasoning = Boolean(session.revealed[currentQuestion.id]);
		}
	});

	function onChoiceChange(next: number[]) {
		if (!currentQuestion) return;
		if (isMultiple) {
			// Multi-select: just persist the picks. Revealing happens only via the
			// explicit "Check answer" button, so the user can review/change their
			// selection before committing to see whether it's right.
			answerPracticeQuestion(currentQuestion.id, next, false);
		} else {
			// Single-choice: one click is a complete answer, reveal immediately.
			answerPracticeQuestion(currentQuestion.id, next, true);
			showReasoning = true;
		}
	}

	function checkAnswer() {
		if (!currentQuestion) return;
		answerPracticeQuestion(currentQuestion.id, selected, true);
		showReasoning = true;
	}

	function next() {
		if (!session) return;
		if (session.currentIndex < session.questions.length - 1)
			gotoPracticeIndex(session.currentIndex + 1);
	}

	function prev() {
		if (!session) return;
		gotoPracticeIndex(session.currentIndex - 1);
	}

	async function finish() {
		const attempt = finishPracticeSession();
		if (attempt) await goto(resolve('/history/[id]', { id: attempt.id }));
	}
</script>

<svelte:head>
	<title>Practice session</title>
</svelte:head>

{#if session && currentQuestion}
	<div class="progress">
		<span>Question {session.currentIndex + 1} of {session.questions.length}</span>
		<div class="track">
			<div
				class="fill"
				style:width="{((session.currentIndex + 1) / session.questions.length) * 100}%"
			></div>
		</div>
	</div>

	<div class="badges">
		{#if domain}<span class="badge">{domain.name}</span>{/if}
		<span class="badge">{currentQuestion.difficulty}</span>
	</div>

	<Markdown html={currentQuestion.stemHtml} tag="div" />

	<div class="choices">
		{#if hasAnswered}
			<div class="reveal-toggle">
				<button type="button" class="ghost-btn" onclick={() => (showReasoning = !showReasoning)}>
					{#if showReasoning}
						<EyeOff size={15} strokeWidth={1.75} /> Hide reasoning
					{:else}
						<Eye size={15} strokeWidth={1.75} /> Show reasoning
					{/if}
				</button>
			</div>
		{/if}

		{#if showReasoning}
			<ChoiceReview
				choices={buildGradedQuestion(currentQuestion, session.answers[currentQuestion.id] ?? [])
					.choices}
				revealAll={false}
			/>
			{#if currentQuestion.explanationHtml}
				<div class="explanation">
					<h3>Explanation</h3>
					<Markdown html={currentQuestion.explanationHtml} tag="div" />
				</div>
			{/if}
		{:else}
			<ChoicePicker
				choices={currentQuestion.choices}
				questionType={currentQuestion.questionType}
				selectCount={currentQuestion.selectCount}
				bind:selected
				onchange={onChoiceChange}
			/>
			{#if isMultiple}
				<div class="check-answer">
					<button
						type="button"
						class="primary"
						onclick={checkAnswer}
						disabled={selected.length !== currentQuestion.selectCount}
					>
						<Check size={16} strokeWidth={1.75} /> Check answer
					</button>
				</div>
			{/if}
		{/if}
	</div>

	<div class="actions">
		<button type="button" class="nav-btn" onclick={prev} disabled={session.currentIndex === 0}>
			<ChevronLeft size={16} strokeWidth={1.75} /> Previous
		</button>

		{#if session.currentIndex < session.questions.length - 1}
			<button type="button" class="primary" onclick={next} disabled={!hasAnswered}>
				Next <ChevronRight size={16} strokeWidth={1.75} />
			</button>
		{:else}
			<button type="button" class="primary" onclick={finish} disabled={!hasAnswered}>
				Finish session
			</button>
		{/if}
	</div>

	<button type="button" class="finish-early" onclick={finish}>End session now</button>
{/if}

<style>
	.progress {
		margin-bottom: var(--space-4);
		font-size: 0.82rem;
		color: var(--text-muted);
	}

	.track {
		height: 4px;
		border-radius: 999px;
		background: var(--surface-hover);
		margin-top: var(--space-2);
		overflow: hidden;
	}

	.fill {
		height: 100%;
		background: var(--accent);
	}

	.badges {
		display: flex;
		gap: var(--space-2);
		margin-bottom: var(--space-3);
	}

	.badge {
		font-size: 0.72rem;
		text-transform: capitalize;
		padding: var(--space-1) var(--space-2);
		border-radius: var(--radius-sm);
		background: var(--surface-hover);
		color: var(--text-secondary);
	}

	.choices {
		margin: var(--space-5) 0;
	}

	.reveal-toggle {
		display: flex;
		justify-content: flex-end;
		margin-bottom: var(--space-3);
	}

	.check-answer {
		display: flex;
		justify-content: flex-end;
		margin-top: var(--space-4);
	}

	.ghost-btn {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		padding: var(--space-1) var(--space-3);
		border-radius: var(--radius-sm);
		border: 1px solid var(--border);
		background: var(--surface);
		color: var(--text-secondary);
		font-size: 0.8rem;
		font-weight: 500;
		cursor: pointer;
	}

	.ghost-btn:hover {
		background: var(--surface-hover);
		color: var(--text);
	}

	.explanation {
		margin-top: var(--space-4);
		padding: var(--space-4);
		border-radius: var(--radius-md);
		background: var(--surface-hover);
	}

	.explanation h3 {
		font-size: 0.8rem;
		text-transform: uppercase;
		letter-spacing: 0.03em;
		color: var(--text-muted);
		margin-bottom: var(--space-2);
	}

	.actions {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	button {
		cursor: pointer;
		border-radius: var(--radius-md);
		font-size: 0.9rem;
		font-weight: 600;
	}

	.nav-btn {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		padding: var(--space-2) var(--space-4);
		border: 1px solid var(--border);
		background: var(--surface);
		color: var(--text-secondary);
	}

	.nav-btn:disabled {
		opacity: 0.5;
		cursor: default;
	}

	.primary {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		padding: var(--space-2) var(--space-5);
		border: none;
		background: var(--accent);
		color: var(--accent-contrast);
	}

	.primary:disabled {
		opacity: 0.5;
		cursor: default;
	}

	.finish-early {
		display: block;
		margin: var(--space-6) auto 0;
		background: none;
		border: none;
		color: var(--text-muted);
		font-size: 0.8rem;
		font-weight: 400;
		text-decoration: underline;
	}
</style>
