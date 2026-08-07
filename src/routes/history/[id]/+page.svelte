<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { browser } from '$app/environment';
	import Markdown from '$lib/components/Markdown.svelte';
	import ChoiceReview from '$lib/components/ChoiceReview.svelte';
	import ScoreBreakdown from '$lib/components/ScoreBreakdown.svelte';
	import { getAttempt } from '$lib/state/history.svelte';

	let { data } = $props();

	const attempt = $derived(browser && page.params.id ? getAttempt(page.params.id) : undefined);

	function formatDate(ts: number): string {
		return new Date(ts).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
	}

	function domainName(domainId: number): string {
		return data.domains.find((d) => d.id === domainId)?.name ?? '';
	}
</script>

<svelte:head>
	<title>{attempt?.kind === 'exam' ? 'Exam review' : 'Practice review'}</title>
</svelte:head>

{#if !browser}
	<!-- avoid flashing "not found" during SSR before localStorage has been read -->
{:else if !attempt}
	<div class="not-found">
		<p>No attempt found with this id — it may have been cleared.</p>
		<a href={resolve('/history')}>Back to history</a>
	</div>
{:else}
	<div class="header">
		<span class="kind">{attempt.kind === 'exam' ? 'Mock Exam' : 'Practice Session'}</span>
		<h1>{formatDate(attempt.completedAt)}</h1>
	</div>

	{#if attempt.kind === 'exam'}
		<ScoreBreakdown overall={attempt.overall} domainBreakdown={attempt.domainBreakdown} />
	{:else}
		<div class="summary">
			<span class="summary-value">{attempt.correctCount}/{attempt.totalQuestions}</span>
			<span class="summary-label">correct</span>
		</div>
	{/if}

	<div class="questions">
		{#each attempt.questions as q, i (q.id)}
			<div class="question">
				<div class="q-header">
					<span class="badge">{domainName(q.domainId)}</span>
					<span class="badge" class:correct={q.correct} class:incorrect={!q.correct}>
						Q{i + 1} — {q.correct ? 'Correct' : 'Incorrect'}
					</span>
				</div>
				<Markdown html={q.stemHtml} tag="div" />
				<div class="choices">
					<ChoiceReview choices={q.choices} />
				</div>
				{#if q.explanationHtml}
					<div class="explanation">
						<h3>Explanation</h3>
						<Markdown html={q.explanationHtml} tag="div" />
					</div>
				{/if}
			</div>
		{/each}
	</div>
{/if}

<style>
	.not-found {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		align-items: flex-start;
	}

	.header {
		margin-bottom: var(--space-5);
	}

	.kind {
		font-size: 0.78rem;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--text-muted);
	}

	h1 {
		font-size: 1.3rem;
		margin-top: var(--space-1);
	}

	.summary {
		display: flex;
		align-items: baseline;
		gap: var(--space-2);
		margin-bottom: var(--space-6);
		padding: var(--space-4) var(--space-5);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		background: var(--surface);
	}

	.summary-value {
		font-size: 1.3rem;
		font-weight: 700;
	}

	.summary-label {
		color: var(--text-muted);
		font-size: 0.85rem;
	}

	.questions {
		display: flex;
		flex-direction: column;
		gap: var(--space-6);
	}

	.question {
		padding-top: var(--space-6);
		border-top: 1px solid var(--border);
	}

	.question:first-child {
		padding-top: 0;
		border-top: none;
	}

	.q-header {
		display: flex;
		gap: var(--space-2);
		margin-bottom: var(--space-3);
	}

	.badge {
		font-size: 0.72rem;
		padding: var(--space-1) var(--space-2);
		border-radius: var(--radius-sm);
		background: var(--surface-hover);
		color: var(--text-secondary);
	}

	.badge.correct {
		background: var(--success-soft);
		color: var(--success);
	}

	.badge.incorrect {
		background: var(--danger-soft);
		color: var(--danger);
	}

	.choices {
		margin: var(--space-4) 0;
	}

	.explanation {
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
</style>
