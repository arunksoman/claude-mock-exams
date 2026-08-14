<script lang="ts">
	import { resolve } from '$app/paths';
	import { LogOut, ListChecks } from '@lucide/svelte';

	let { data } = $props();
</script>

<svelte:head>
	<title>Admin — {data.certification.name}</title>
</svelte:head>

<div class="header">
	<div>
		<h1>Admin</h1>
		<p class="lead">{data.certification.name}</p>
	</div>
	<form method="POST" action="?/logout">
		<button type="submit" class="logout-btn">
			<LogOut size={15} strokeWidth={1.75} /> Log out
		</button>
	</form>
</div>

<section class="stats">
	<div class="stat">
		<span class="stat-value">{data.totalQuestions}</span>
		<span class="stat-label">published questions</span>
	</div>
	<div class="domain-table">
		{#each data.domainCounts as d (d.domain)}
			<div class="domain-row">
				<span class="name">{d.domain}</span>
				<span class="count">{d.count}</span>
			</div>
		{/each}
	</div>
</section>

<a class="manage-card" href={resolve('/admin/questions')}>
	<div class="icon"><ListChecks size={22} strokeWidth={1.75} /></div>
	<div>
		<h2>Manage Questions</h2>
		<p>
			Browse, search, edit, and delete individual questions and choices, or bulk-upload a reviewed <code
				>.jsonl</code
			> batch.
		</p>
	</div>
</a>

<style>
	.header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		margin-bottom: var(--space-6);
	}

	h1 {
		font-size: 1.4rem;
		margin-bottom: var(--space-1);
	}

	.lead {
		color: var(--text-secondary);
		font-size: 0.9rem;
	}

	.logout-btn {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-2) var(--space-3);
		border-radius: var(--radius-sm);
		border: 1px solid var(--border);
		background: var(--surface);
		color: var(--text-secondary);
		font-size: 0.85rem;
		cursor: pointer;
	}

	.logout-btn:hover {
		background: var(--surface-hover);
		color: var(--text);
	}

	.stats {
		padding: var(--space-5);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		background: var(--surface);
		margin-bottom: var(--space-6);
	}

	.stat-value {
		font-size: 1.5rem;
		font-weight: 700;
	}

	.stat-label {
		margin-left: var(--space-2);
		color: var(--text-muted);
		font-size: 0.85rem;
	}

	.domain-table {
		margin-top: var(--space-4);
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}

	.domain-row {
		display: flex;
		justify-content: space-between;
		padding: var(--space-1) 0;
		font-size: 0.86rem;
		border-top: 1px solid var(--border);
		padding-top: var(--space-2);
		margin-top: var(--space-1);
	}

	.domain-row .name {
		color: var(--text-secondary);
	}

	.domain-row .count {
		font-weight: 600;
	}

	.manage-card {
		display: flex;
		align-items: flex-start;
		gap: var(--space-4);
		padding: var(--space-5);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		background: var(--surface);
		text-decoration: none;
		color: var(--text);
		transition:
			border-color 0.15s ease,
			box-shadow 0.15s ease;
	}

	.manage-card:hover {
		border-color: var(--accent);
		box-shadow: var(--shadow-sm);
	}

	.manage-card .icon {
		flex-shrink: 0;
		width: 40px;
		height: 40px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: var(--radius-md);
		background: var(--accent-soft);
		color: var(--accent);
	}

	.manage-card h2 {
		font-size: 1.05rem;
		margin-bottom: var(--space-2);
	}

	.manage-card p {
		font-size: 0.88rem;
		color: var(--text-secondary);
	}

	.manage-card code {
		background: var(--surface-hover);
		border-radius: 4px;
		padding: 0.1em 0.35em;
		font-size: 0.92em;
	}
</style>
