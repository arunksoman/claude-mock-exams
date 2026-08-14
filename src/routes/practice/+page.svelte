<script lang="ts">
	import { untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { DIFFICULTIES, PRACTICE_COUNT_PRESETS } from '$lib/constants';
	import { startPracticeSession } from '$lib/state/practice.svelte';
	import type { Difficulty, PracticeConfig, QuestionFull } from '$lib/types';

	let { data } = $props();

	let selectedDomains = $state<number[]>(untrack(() => data.domains.map((d) => d.id)));
	let selectedDifficulties = $state<Difficulty[]>([...DIFFICULTIES]);
	let count = $state<number>(20);
	let loading = $state(false);
	let errorMsg = $state('');

	function toggleDomain(id: number) {
		selectedDomains = selectedDomains.includes(id)
			? selectedDomains.filter((d) => d !== id)
			: [...selectedDomains, id];
	}

	function toggleDifficulty(d: Difficulty) {
		selectedDifficulties = selectedDifficulties.includes(d)
			? selectedDifficulties.filter((x) => x !== d)
			: [...selectedDifficulties, d];
	}

	async function start() {
		errorMsg = '';
		if (selectedDomains.length === 0 || selectedDifficulties.length === 0) {
			errorMsg = 'Pick at least one domain and one difficulty.';
			return;
		}
		loading = true;
		try {
			const res = await fetch('/api/practice/start', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					domainIds: selectedDomains,
					difficulties: selectedDifficulties,
					count
				})
			});
			if (!res.ok) throw new Error('Failed to start practice session');
			const body = (await res.json()) as { config: PracticeConfig; questions: QuestionFull[] };
			startPracticeSession(data.certification.code, body.config, body.questions);
			await goto(resolve('/practice/session'));
		} catch {
			errorMsg = 'Something went wrong starting the session. Please try again.';
		} finally {
			loading = false;
		}
	}
</script>

<svelte:head>
	<title>Practice — {data.certification.name}</title>
</svelte:head>

<h1>Practice Mode</h1>
<p class="lead">
	Choose what to practice. You'll see whether each answer is correct — and why — immediately after
	you answer.
</p>

<div class="config">
	<section>
		<h2>Domains</h2>
		<div class="chips">
			{#each data.domains as domain (domain.id)}
				{@const checked = selectedDomains.includes(domain.id)}
				<button type="button" class="chip" class:checked onclick={() => toggleDomain(domain.id)}>
					{domain.name}
					<span class="weight">{domain.weightPercentage}%</span>
				</button>
			{/each}
		</div>
	</section>

	<section>
		<h2>Difficulty</h2>
		<div class="chips">
			{#each DIFFICULTIES as difficulty (difficulty)}
				{@const checked = selectedDifficulties.includes(difficulty)}
				<button
					type="button"
					class="chip"
					class:checked
					onclick={() => toggleDifficulty(difficulty)}
				>
					{difficulty}
				</button>
			{/each}
		</div>
	</section>

	<section>
		<h2>Question count</h2>
		<div class="chips">
			{#each PRACTICE_COUNT_PRESETS as preset (preset)}
				<button
					type="button"
					class="chip"
					class:checked={count === preset}
					onclick={() => (count = preset)}
				>
					{preset}
				</button>
			{/each}
		</div>
	</section>

	{#if errorMsg}
		<p class="error">{errorMsg}</p>
	{/if}

	<button type="button" class="start-btn" onclick={start} disabled={loading}>
		{loading ? 'Starting…' : 'Start Practice'}
	</button>
</div>

<style>
	h1 {
		font-size: 1.4rem;
		margin-bottom: var(--space-2);
	}

	.lead {
		color: var(--text-secondary);
		margin-bottom: var(--space-6);
		max-width: 60ch;
	}

	.config {
		display: flex;
		flex-direction: column;
		gap: var(--space-6);
	}

	h2 {
		font-size: 0.85rem;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--text-muted);
		margin-bottom: var(--space-3);
	}

	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}

	.chip {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-2) var(--space-4);
		border-radius: 999px;
		border: 1px solid var(--border);
		background: var(--surface);
		color: var(--text-secondary);
		font-size: 0.85rem;
		cursor: pointer;
		text-transform: capitalize;
	}

	.chip:hover {
		border-color: var(--accent);
	}

	.chip.checked {
		border-color: var(--accent);
		background: var(--accent-soft);
		color: var(--accent);
	}

	.weight {
		font-size: 0.72rem;
		color: var(--text-muted);
	}

	.chip.checked .weight {
		color: var(--accent);
	}

	.error {
		color: var(--danger);
		font-size: 0.88rem;
	}

	.start-btn {
		align-self: flex-start;
		padding: var(--space-3) var(--space-6);
		border-radius: var(--radius-md);
		border: none;
		background: var(--accent);
		color: var(--accent-contrast);
		font-weight: 600;
		font-size: 0.94rem;
		cursor: pointer;
	}

	.start-btn:hover {
		opacity: 0.92;
	}

	.start-btn:disabled {
		opacity: 0.6;
		cursor: default;
	}
</style>
