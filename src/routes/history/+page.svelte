<script lang="ts">
	import { BookOpen, GraduationCap, Inbox } from '@lucide/svelte';
	import { resolve } from '$app/paths';
	import { historyState } from '$lib/state/history.svelte';

	function formatDate(ts: number): string {
		return new Date(ts).toLocaleString(undefined, {
			dateStyle: 'medium',
			timeStyle: 'short'
		});
	}
</script>

<svelte:head>
	<title>History</title>
</svelte:head>

<h1>History</h1>
<p class="lead">Every practice session and mock exam you've completed on this device.</p>

{#if historyState.attempts.length === 0}
	<div class="empty">
		<Inbox size={28} strokeWidth={1.5} />
		<p>No attempts yet. Start a practice session or mock exam to see it here.</p>
	</div>
{:else}
	<ul class="list">
		{#each historyState.attempts as attempt (attempt.id)}
			<li>
				<a href={resolve('/history/[id]', { id: attempt.id })}>
					<div class="icon" class:exam={attempt.kind === 'exam'}>
						{#if attempt.kind === 'exam'}
							<GraduationCap size={18} strokeWidth={1.75} />
						{:else}
							<BookOpen size={18} strokeWidth={1.75} />
						{/if}
					</div>
					<div class="info">
						<span class="title">{attempt.kind === 'exam' ? 'Mock Exam' : 'Practice Session'}</span>
						<span class="meta">{formatDate(attempt.completedAt)}</span>
					</div>
					<div class="score">
						{#if attempt.kind === 'exam'}
							<span class="score-value" class:passed={attempt.overall.passed}
								>{attempt.overall.scaledScore}</span
							>
							<span class="score-label">{attempt.overall.passed ? 'Passed' : 'Not passed'}</span>
						{:else}
							<span class="score-value">{attempt.correctCount}/{attempt.totalQuestions}</span>
							<span class="score-label">correct</span>
						{/if}
					</div>
				</a>
			</li>
		{/each}
	</ul>
{/if}

<style>
	h1 {
		font-size: 1.4rem;
		margin-bottom: var(--space-2);
	}

	.lead {
		color: var(--text-secondary);
		margin-bottom: var(--space-6);
	}

	.empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-8) var(--space-4);
		color: var(--text-muted);
		text-align: center;
	}

	.list {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}

	.list a {
		display: flex;
		align-items: center;
		gap: var(--space-4);
		padding: var(--space-4);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		background: var(--surface);
		text-decoration: none;
		color: var(--text);
	}

	.list a:hover {
		border-color: var(--accent);
	}

	.icon {
		flex-shrink: 0;
		width: 38px;
		height: 38px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: var(--radius-md);
		background: var(--accent-soft);
		color: var(--accent);
	}

	.info {
		display: flex;
		flex-direction: column;
		flex: 1;
	}

	.title {
		font-weight: 600;
		font-size: 0.94rem;
	}

	.meta {
		font-size: 0.8rem;
		color: var(--text-muted);
	}

	.score {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		flex-shrink: 0;
	}

	.score-value {
		font-weight: 700;
		font-size: 1.05rem;
	}

	.score-value.passed {
		color: var(--success);
	}

	.score-label {
		font-size: 0.75rem;
		color: var(--text-muted);
	}
</style>
