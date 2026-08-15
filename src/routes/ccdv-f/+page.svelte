<script lang="ts">
	import { BookOpen, GraduationCap, ListChecks, NotebookText } from '@lucide/svelte';
	import { resolve } from '$app/paths';
	import { historyState } from '$lib/state/history.svelte';
	import type { ExamAttempt } from '$lib/types';

	let { data } = $props();

	let examAttempts = $derived(
		historyState.attempts.filter((a): a is ExamAttempt => a.kind === 'exam')
	);
	let bestScore = $derived(
		examAttempts.length > 0 ? Math.max(...examAttempts.map((a) => a.overall.scaledScore)) : null
	);
</script>

<svelte:head>
	<title>{data.certification.name}</title>
</svelte:head>

<section class="hero">
	<h1>{data.certification.name}</h1>
	<p class="lead">
		Study the domains, practice questions with instant feedback, or sit a timed mock exam that
		mirrors the real {data.certification.examQuestionCount}-question, {data.certification
			.examDurationMinutes}-minute format.
	</p>
</section>

{#if historyState.attempts.length > 0}
	<section class="stats">
		<div class="stat">
			<span class="stat-value">{historyState.attempts.length}</span>
			<span class="stat-label">attempts so far</span>
		</div>
		{#if bestScore !== null}
			<div class="stat">
				<span class="stat-value">{bestScore}</span>
				<span class="stat-label">best exam score (of {data.certification.maxScore})</span>
			</div>
		{/if}
	</section>
{/if}

<section class="modes">
	<a class="mode-card" href={resolve('/notes/ccdv-f')}>
		<div class="icon"><NotebookText size={22} strokeWidth={1.75} /></div>
		<h2>Study Notes</h2>
		<p>A full domain-by-domain reference to read or cram from before you practice.</p>
	</a>

	<a class="mode-card" href={resolve('/practice/ccdv-f')}>
		<div class="icon"><BookOpen size={22} strokeWidth={1.75} /></div>
		<h2>Practice Mode</h2>
		<p>
			Pick domains and difficulty, answer at your own pace, and see the reasoning behind every
			choice immediately.
		</p>
	</a>

	<a class="mode-card" href={resolve('/exam/ccdv-f')}>
		<div class="icon"><GraduationCap size={22} strokeWidth={1.75} /></div>
		<h2>Mock Exam</h2>
		<p>
			{data.certification.examQuestionCount} questions, {data.certification.examDurationMinutes} minutes,
			no feedback until you submit — just like the real thing.
		</p>
	</a>
</section>

<a class="history-link" href={resolve('/history')}>
	<ListChecks size={16} strokeWidth={1.75} />
	View past attempts
</a>

<style>
	.hero {
		margin-bottom: var(--space-6);
	}

	h1 {
		font-size: 1.6rem;
		margin-bottom: var(--space-3);
	}

	.lead {
		color: var(--text-secondary);
		max-width: 56ch;
	}

	.stats {
		display: flex;
		gap: var(--space-6);
		margin-bottom: var(--space-6);
		padding: var(--space-4) var(--space-5);
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
	}

	.stat {
		display: flex;
		flex-direction: column;
	}

	.stat-value {
		font-size: 1.4rem;
		font-weight: 600;
	}

	.stat-label {
		font-size: 0.82rem;
		color: var(--text-muted);
	}

	.modes {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
		gap: var(--space-4);
		margin-bottom: var(--space-6);
	}

	.mode-card {
		display: block;
		padding: var(--space-5);
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		text-decoration: none;
		color: var(--text);
		transition:
			border-color 0.15s ease,
			box-shadow 0.15s ease;
	}

	.mode-card:hover {
		border-color: var(--accent);
		box-shadow: var(--shadow-sm);
	}

	.icon {
		width: 40px;
		height: 40px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: var(--radius-md);
		background: var(--accent-soft);
		color: var(--accent);
		margin-bottom: var(--space-3);
	}

	.mode-card h2 {
		font-size: 1.05rem;
		margin-bottom: var(--space-2);
	}

	.mode-card p {
		font-size: 0.88rem;
		color: var(--text-secondary);
	}

	.history-link {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		font-size: 0.88rem;
		color: var(--text-secondary);
		text-decoration: none;
	}

	.history-link:hover {
		color: var(--text);
	}
</style>
