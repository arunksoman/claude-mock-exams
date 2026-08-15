<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { browser } from '$app/environment';
	import { ChevronLeft, ChevronRight, ChevronDown, Flag } from '@lucide/svelte';
	import Markdown from '$lib/components/Markdown.svelte';
	import ChoicePicker from '$lib/components/ChoicePicker.svelte';
	import Timer from '$lib/components/Timer.svelte';
	import FullscreenToggle from '$lib/components/FullscreenToggle.svelte';
	import QuestionNav from '$lib/components/QuestionNav.svelte';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import {
		examState,
		answerExamQuestion,
		toggleExamFlag,
		toggleExamStrike,
		gotoExamIndex,
		completeExam,
		clearExamSession
	} from '$lib/state/exam.svelte';
	import type { ExamAttempt } from '$lib/types';

	let { data } = $props();

	$effect(() => {
		if (browser && !examState.session) goto(resolve('/exam'));
	});

	const session = $derived(examState.session);
	const currentQuestion = $derived(session?.questions[session.currentIndex] ?? null);
	const domain = $derived(
		currentQuestion ? data.domains.find((d) => d.id === currentQuestion.domainId) : null
	);
	const isFlagged = $derived(
		currentQuestion ? (session?.flagged.includes(currentQuestion.id) ?? false) : false
	);
	const answeredCount = $derived(session ? Object.keys(session.answers).length : 0);

	let selected = $state<number[]>([]);
	let struck = $state<number[]>([]);
	let containerEl = $state<HTMLElement | null>(null);
	let confirmOpen = $state(false);
	let submitting = $state(false);
	let submitError = $state('');
	// Collapsed by default on narrow screens so the 53-question grid doesn't push the
	// current question below the fold; open by default on wider screens.
	let navPanelOpen = $state(true);

	$effect(() => {
		if (browser) navPanelOpen = window.innerWidth > 720;
	});

	$effect(() => {
		if (currentQuestion && session) {
			selected = session.answers[currentQuestion.id] ?? [];
			struck = session.struck[currentQuestion.id] ?? [];
		}
	});

	function onChoiceChange(next: number[]) {
		if (!currentQuestion) return;
		answerExamQuestion(currentQuestion.id, next);
	}

	function onStrikeChange(choiceId: number) {
		if (!currentQuestion) return;
		toggleExamStrike(currentQuestion.id, choiceId);
	}

	function next() {
		if (!session) return;
		if (session.currentIndex < session.questions.length - 1)
			gotoExamIndex(session.currentIndex + 1);
	}

	function prev() {
		if (!session) return;
		gotoExamIndex(session.currentIndex - 1);
	}

	async function submit() {
		if (!session || submitting) return;
		submitting = true;
		submitError = '';
		try {
			const res = await fetch('/api/exam/submit', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					attemptId: session.attemptId,
					startedAt: session.startedAt,
					durationMinutes: session.durationMinutes,
					questionIds: session.questions.map((q) => q.id),
					answers: session.answers
				})
			});
			if (!res.ok) throw new Error('Submit failed');
			const attempt = (await res.json()) as ExamAttempt;
			// Add to history but keep examState.session intact until after navigating away —
			// this page's own guard effect redirects to /exam the instant the session goes
			// null, and clearing it here would race the goto below. See completeExam's doc.
			completeExam(attempt);
			await goto(resolve('/history/[id]', { id: attempt.id }));
			clearExamSession();
		} catch {
			submitError = 'Could not submit the exam. Please check your connection and try again.';
			submitting = false;
		}
	}

	function requestSubmit() {
		confirmOpen = true;
	}
</script>

<svelte:head>
	<title>Mock Exam — in progress</title>
</svelte:head>

{#if session && currentQuestion}
	<div class="exam" bind:this={containerEl}>
		<div class="toolbar">
			<Timer
				startedAt={session.startedAt}
				durationMinutes={session.durationMinutes}
				ontimeup={submit}
			/>
			<span class="answered-count">{answeredCount} / {session.questions.length} answered</span>
			<div class="toolbar-actions">
				<FullscreenToggle target={containerEl} />
				<button type="button" class="submit-btn" onclick={requestSubmit} disabled={submitting}>
					Submit exam
				</button>
			</div>
		</div>

		{#if submitError}
			<p class="error">{submitError}</p>
		{/if}

		<div class="layout">
			<div class="question-panel">
				<div class="q-header">
					<div class="badges">
						{#if domain}<span class="badge">{domain.name}</span>{/if}
						<span class="badge">Q{session.currentIndex + 1}</span>
					</div>
					<button
						type="button"
						class="flag-btn"
						class:active={isFlagged}
						onclick={() => currentQuestion && toggleExamFlag(currentQuestion.id)}
					>
						<Flag size={15} strokeWidth={1.75} fill={isFlagged ? 'currentColor' : 'none'} />
						{isFlagged ? 'Flagged' : 'Flag for review'}
					</button>
				</div>

				<Markdown html={currentQuestion.stemHtml} tag="div" />

				<div class="choices">
					<ChoicePicker
						choices={currentQuestion.choices}
						questionType={currentQuestion.questionType}
						selectCount={currentQuestion.selectCount}
						bind:selected
						bind:struck
						onchange={onChoiceChange}
						onstrike={onStrikeChange}
					/>
				</div>

				<div class="actions">
					<button
						type="button"
						class="nav-btn"
						onclick={prev}
						disabled={session.currentIndex === 0}
					>
						<ChevronLeft size={16} strokeWidth={1.75} /> Previous
					</button>
					<button
						type="button"
						class="nav-btn"
						onclick={next}
						disabled={session.currentIndex === session.questions.length - 1}
					>
						Next <ChevronRight size={16} strokeWidth={1.75} />
					</button>
				</div>
			</div>

			<aside class="nav-panel">
				<button
					type="button"
					class="nav-panel-toggle"
					aria-expanded={navPanelOpen}
					onclick={() => (navPanelOpen = !navPanelOpen)}
				>
					Question {session.currentIndex + 1} of {session.questions.length}
					<ChevronDown
						size={16}
						strokeWidth={1.75}
						class={navPanelOpen ? 'chevron open' : 'chevron'}
					/>
				</button>
				{#if navPanelOpen}
					<QuestionNav
						count={session.questions.length}
						currentIndex={session.currentIndex}
						isAnswered={(i) => Boolean(session.answers[session.questions[i].id]?.length)}
						isFlagged={(i) => session.flagged.includes(session.questions[i].id)}
						onselect={(i) => gotoExamIndex(i)}
					/>
				{/if}
			</aside>
		</div>
	</div>
{/if}

<ConfirmDialog
	bind:open={confirmOpen}
	title="Submit exam?"
	message={session
		? `You've answered ${answeredCount} of ${session.questions.length} questions. Once submitted you can't change your answers.`
		: ''}
	confirmLabel="Submit"
	onconfirm={() => {
		confirmOpen = false;
		submit();
	}}
	oncancel={() => (confirmOpen = false)}
/>

<style>
	.exam {
		background: var(--bg);
		min-height: 100%;
	}

	/* The Fullscreen API detaches this element from the page layout's <main>,
	   which normally provides the page's padding — without this it renders
	   flush against the screen edges. */
	.exam:fullscreen {
		padding: var(--space-6) var(--space-6) var(--space-8);
		overflow-y: auto;
	}

	.toolbar {
		display: flex;
		align-items: center;
		gap: var(--space-4);
		margin-bottom: var(--space-5);
		flex-wrap: wrap;
	}

	.answered-count {
		font-size: 0.85rem;
		color: var(--text-muted);
	}

	.toolbar-actions {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		margin-left: auto;
	}

	.submit-btn {
		padding: var(--space-2) var(--space-4);
		border-radius: var(--radius-sm);
		border: none;
		background: var(--accent);
		color: var(--accent-contrast);
		font-weight: 600;
		font-size: 0.85rem;
		cursor: pointer;
	}

	.submit-btn:disabled {
		opacity: 0.6;
		cursor: default;
	}

	.error {
		color: var(--danger);
		font-size: 0.88rem;
		margin-bottom: var(--space-4);
	}

	.layout {
		display: grid;
		grid-template-columns: 1fr 220px;
		gap: var(--space-6);
		align-items: start;
	}

	.q-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: var(--space-3);
	}

	.badges {
		display: flex;
		gap: var(--space-2);
	}

	.badge {
		font-size: 0.72rem;
		padding: var(--space-1) var(--space-2);
		border-radius: var(--radius-sm);
		background: var(--surface-hover);
		color: var(--text-secondary);
	}

	.flag-btn {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		padding: var(--space-1) var(--space-3);
		border-radius: var(--radius-sm);
		border: 1px solid var(--border);
		background: var(--surface);
		color: var(--text-secondary);
		font-size: 0.8rem;
		cursor: pointer;
	}

	.flag-btn.active {
		border-color: var(--danger);
		color: var(--danger);
		background: var(--danger-soft);
	}

	.choices {
		margin: var(--space-5) 0;
	}

	.actions {
		display: flex;
		justify-content: space-between;
	}

	.nav-btn {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		padding: var(--space-2) var(--space-4);
		border-radius: var(--radius-md);
		border: 1px solid var(--border);
		background: var(--surface);
		color: var(--text-secondary);
		font-size: 0.9rem;
		font-weight: 600;
		cursor: pointer;
	}

	.nav-btn:disabled {
		opacity: 0.5;
		cursor: default;
	}

	.nav-panel {
		position: sticky;
		top: calc(var(--space-6) + 60px);
	}

	.nav-panel-toggle {
		display: none;
		width: 100%;
		align-items: center;
		justify-content: space-between;
		padding: var(--space-2) var(--space-3);
		margin-bottom: var(--space-3);
		border-radius: var(--radius-sm);
		border: 1px solid var(--border);
		background: var(--surface);
		color: var(--text-secondary);
		font-size: 0.85rem;
		font-weight: 600;
		cursor: pointer;
	}

	.nav-panel-toggle :global(.chevron) {
		transition: transform 0.15s ease;
	}

	.nav-panel-toggle :global(.chevron.open) {
		transform: rotate(180deg);
	}

	@media (max-width: 720px) {
		.layout {
			grid-template-columns: 1fr;
		}
		.nav-panel {
			position: static;
			order: -1;
		}
		.nav-panel-toggle {
			display: flex;
		}
	}
</style>
