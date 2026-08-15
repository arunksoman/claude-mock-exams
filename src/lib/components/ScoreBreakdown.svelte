<script lang="ts">
	import { CircleCheck, CircleX } from '@lucide/svelte';
	import type { DomainBreakdown, OverallScore } from '$lib/types';

	interface Props {
		overall: OverallScore;
		domainBreakdown: DomainBreakdown[];
	}

	let { overall, domainBreakdown }: Props = $props();
</script>

<div class="banner" class:passed={overall.passed}>
	<div class="banner-icon">
		{#if overall.passed}
			<CircleCheck size={28} strokeWidth={1.75} />
		{:else}
			<CircleX size={28} strokeWidth={1.75} />
		{/if}
	</div>
	<div class="banner-text">
		<h2>{overall.passed ? 'Passed' : 'Not passed'}</h2>
		<p>
			{overall.correctCount} / {overall.totalQuestions} correct ({overall.pct}%) — approximate
			scaled score {overall.scaledScore} / {overall.maxScore} (passing: {overall.passingScore})
		</p>
	</div>
</div>

<div class="domains">
	{#each domainBreakdown as d (d.domainId)}
		<div class="domain-row">
			<div class="domain-header">
				<span class="name">{d.domainName}</span>
				<span class="count">{d.correct}/{d.total} ({d.pct}%)</span>
			</div>
			<div class="bar-track">
				<div class="bar-fill" style:width="{d.pct}%"></div>
			</div>
		</div>
	{/each}
</div>

<style>
	.banner {
		display: flex;
		align-items: center;
		gap: var(--space-4);
		padding: var(--space-5);
		border-radius: var(--radius-lg);
		border: 1px solid var(--danger);
		background: var(--danger-soft);
		margin-bottom: var(--space-6);
	}

	.banner.passed {
		border-color: var(--success);
		background: var(--success-soft);
	}

	.banner-icon {
		color: var(--danger);
		flex-shrink: 0;
	}

	.banner.passed .banner-icon {
		color: var(--success);
	}

	.banner-text h2 {
		font-size: 1.15rem;
		margin-bottom: var(--space-1);
	}

	.banner-text p {
		font-size: 0.88rem;
		color: var(--text-secondary);
	}

	.domains {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		margin-bottom: var(--space-6);
	}

	.domain-header {
		display: flex;
		justify-content: space-between;
		font-size: 0.86rem;
		margin-bottom: var(--space-1);
	}

	.domain-header .name {
		color: var(--text);
	}

	.domain-header .count {
		color: var(--text-muted);
	}

	.bar-track {
		height: 6px;
		border-radius: 0;
		background: var(--surface-hover);
		overflow: hidden;
	}

	.bar-fill {
		height: 100%;
		background: var(--accent);
		border-radius: inherit;
	}
</style>
