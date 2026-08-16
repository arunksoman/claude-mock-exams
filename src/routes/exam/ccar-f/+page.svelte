<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { browser } from '$app/environment';
	import { GraduationCap, Clock, ListChecks, ShieldOff } from '@lucide/svelte';
	import { startExam, examState } from '$lib/state/exam.svelte';
	import type { QuestionPublic } from '$lib/types';

	let { data } = $props();

	let loading = $state(false);
	let errorMsg = $state('');

	const hasInProgress = $derived(
		browser && examState.session !== null && examState.session.certCode === data.certification.code
	);

	async function begin() {
		errorMsg = '';
		loading = true;
		try {
			const res = await fetch('/api/exam/start', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ cert: data.certification.code })
			});
			if (!res.ok) throw new Error('Failed to start exam');
			const body = (await res.json()) as {
				attemptId: string;
				startedAt: number;
				durationMinutes: number;
				questions: QuestionPublic[];
			};
			startExam({ ...body, certCode: data.certification.code });
			await goto(resolve('/exam/ccar-f/active'));
		} catch {
			errorMsg = 'Could not start the exam. Please try again.';
		} finally {
			loading = false;
		}
	}

	async function resume() {
		await goto(resolve('/exam/ccar-f/active'));
	}
</script>

<svelte:head>
	<title>Mock Exam — {data.certification.name}</title>
</svelte:head>

<div class="intro">
	<div class="icon"><GraduationCap size={28} strokeWidth={1.75} /></div>
	<h1>Mock Exam</h1>
	<p class="lead">
		A full-length, timed simulation of the {data.certification.name} exam. Answers and reasoning stay
		hidden until you submit — just like the real thing.
	</p>

	<ul class="facts">
		<li>
			<ListChecks size={16} strokeWidth={1.75} />
			{data.certification.examQuestionCount} questions, sampled proportionally to the real exam's domain
			weights
		</li>
		<li>
			<Clock size={16} strokeWidth={1.75} />
			{data.certification.examDurationMinutes} minute time limit, auto-submits at zero
		</li>
		<li>
			<ShieldOff size={16} strokeWidth={1.75} /> No proctoring — an optional distraction-free full screen
			mode is available once you begin
		</li>
	</ul>

	{#if errorMsg}
		<p class="error">{errorMsg}</p>
	{/if}

	{#if hasInProgress}
		<button type="button" class="primary" onclick={resume}>Resume exam in progress</button>
	{:else}
		<button type="button" class="primary" onclick={begin} disabled={loading}>
			{loading ? 'Preparing exam…' : 'Begin Exam'}
		</button>
	{/if}
</div>

<style>
	.intro {
		max-width: 56ch;
	}

	.icon {
		width: 48px;
		height: 48px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: var(--radius-lg);
		background: var(--accent-soft);
		color: var(--accent);
		margin-bottom: var(--space-4);
	}

	h1 {
		font-size: 1.4rem;
		margin-bottom: var(--space-3);
	}

	.lead {
		color: var(--text-secondary);
		margin-bottom: var(--space-5);
	}

	.facts {
		list-style: none;
		padding: 0;
		margin: 0 0 var(--space-6) 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}

	.facts li {
		display: flex;
		align-items: flex-start;
		gap: var(--space-3);
		font-size: 0.9rem;
		color: var(--text-secondary);
	}

	.facts :global(svg) {
		flex-shrink: 0;
		margin-top: 0.15em;
		color: var(--accent);
	}

	.error {
		color: var(--danger);
		font-size: 0.88rem;
		margin-bottom: var(--space-4);
	}

	.primary {
		padding: var(--space-3) var(--space-6);
		border-radius: var(--radius-md);
		border: none;
		background: var(--accent);
		color: var(--accent-contrast);
		font-weight: 600;
		font-size: 0.94rem;
		cursor: pointer;
	}

	.primary:hover {
		opacity: 0.92;
	}

	.primary:disabled {
		opacity: 0.6;
		cursor: default;
	}
</style>
