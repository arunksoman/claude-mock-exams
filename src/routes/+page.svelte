<script lang="ts">
	import { GraduationCap } from '@lucide/svelte';
	import { resolve } from '$app/paths';

	let { data } = $props();
</script>

<svelte:head>
	<title>Claude Certification</title>
</svelte:head>

<section class="hero">
	<h1>Claude Certification</h1>
	<p class="lead">Pick a certification track to start practicing.</p>
</section>

<section class="certs">
	<a class="cert-card" href={resolve('/ccdv-f')}>
		<div class="icon"><GraduationCap size={22} strokeWidth={1.75} /></div>
		<h2>{data.ccdvf.name}</h2>
		<p>
			{data.ccdvf.examQuestionCount} questions, {data.ccdvf.examDurationMinutes} minutes. Study notes,
			practice mode, and a full timed mock exam.
		</p>
	</a>

	<a class="cert-card" href={resolve('/ccar-f')}>
		<div class="icon"><GraduationCap size={22} strokeWidth={1.75} /></div>
		<h2>{data.ccarf.name}</h2>
		<p>
			{data.ccarf.examQuestionCount} questions, {data.ccarf.examDurationMinutes} minutes. Study notes,
			practice mode, and a full timed mock exam.
		</p>
	</a>
</section>

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

	.certs {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
		gap: var(--space-4);
	}

	.cert-card {
		position: relative;
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

	a.cert-card:hover {
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

	.cert-card h2 {
		font-size: 1.05rem;
		margin-bottom: var(--space-2);
	}

	.cert-card p {
		font-size: 0.88rem;
		color: var(--text-secondary);
	}
</style>
