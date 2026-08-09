<script lang="ts">
	import { enhance } from '$app/forms';
	import { asset } from '$app/paths';
	import { Upload, LogOut, CircleCheck, CircleAlert, FileDown } from '@lucide/svelte';

	let { data, form } = $props();

	let uploading = $state(false);
	let fileName = $state('');

	function onFileChange(e: Event) {
		const input = e.currentTarget as HTMLInputElement;
		fileName = input.files?.[0]?.name ?? '';
	}
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

<section class="upload-section">
	<h2>Upload questions</h2>
	<p class="hint">
		Upload a <code>.jsonl</code> file — one question object per line, same shape as
		<code>data/ccdv-f/*.jsonl</code>. Questions with a matching <code>external_key</code> are updated
		in place (choices replaced); questions without one are always inserted as new. If any line fails validation,
		nothing is written.
	</p>
	<a class="sample-link" href={asset('/sample-questions.jsonl')} download>
		<FileDown size={14} strokeWidth={1.75} />
		Download sample .jsonl (single_choice + multiple_response examples)
	</a>

	<form
		method="POST"
		action="?/upload"
		enctype="multipart/form-data"
		use:enhance={() => {
			uploading = true;
			return async ({ update }) => {
				await update();
				uploading = false;
			};
		}}
	>
		<label class="file-picker">
			<input type="file" name="file" accept=".jsonl,.txt" required onchange={onFileChange} />
			<span>{fileName || 'Choose a .jsonl file…'}</span>
		</label>

		<button type="submit" class="primary" disabled={uploading}>
			<Upload size={16} strokeWidth={1.75} />
			{uploading ? 'Uploading…' : 'Upload & Import'}
		</button>
	</form>

	{#if form?.uploadError}
		<p class="error">{form.uploadError}</p>
	{/if}

	{#if form?.uploadResult}
		{@const result = form.uploadResult}
		{#if result.errors.length > 0}
			<div class="result result-error">
				<div class="result-header">
					<CircleAlert size={18} strokeWidth={1.75} />
					<span>{result.errors.length} error(s) — nothing was written</span>
				</div>
				<ul class="error-list">
					{#each result.errors as err (err.line)}
						<li>line {err.line}: {err.message}</li>
					{/each}
				</ul>
			</div>
		{:else}
			<div class="result result-success">
				<div class="result-header">
					<CircleCheck size={18} strokeWidth={1.75} />
					<span>Import complete</span>
				</div>
				<p>
					{result.created} question(s) created, {result.updated} updated, {result.choicesWritten} choice
					rows written.
				</p>
			</div>
		{/if}
	{/if}
</section>

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

	.upload-section h2 {
		font-size: 0.85rem;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--text-muted);
		margin-bottom: var(--space-3);
	}

	.hint {
		font-size: 0.86rem;
		color: var(--text-secondary);
		max-width: 62ch;
		margin-bottom: var(--space-4);
	}

	.hint code {
		background: var(--surface-hover);
		border-radius: 4px;
		padding: 0.1em 0.35em;
		font-size: 0.92em;
	}

	.sample-link {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		font-size: 0.84rem;
		color: var(--accent);
		text-decoration: none;
		margin-bottom: var(--space-5);
	}

	.sample-link:hover {
		text-decoration: underline;
	}

	form {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-3);
		align-items: center;
	}

	.file-picker {
		display: flex;
		align-items: center;
		padding: var(--space-2) var(--space-4);
		border-radius: var(--radius-md);
		border: 1px dashed var(--border);
		background: var(--surface);
		color: var(--text-secondary);
		font-size: 0.88rem;
		cursor: pointer;
	}

	.file-picker input {
		position: absolute;
		width: 1px;
		height: 1px;
		opacity: 0;
		overflow: hidden;
	}

	.primary {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-2) var(--space-5);
		border-radius: var(--radius-md);
		border: none;
		background: var(--accent);
		color: var(--accent-contrast);
		font-weight: 600;
		font-size: 0.9rem;
		cursor: pointer;
	}

	.primary:disabled {
		opacity: 0.6;
		cursor: default;
	}

	.error {
		color: var(--danger);
		font-size: 0.88rem;
		margin-top: var(--space-3);
	}

	.result {
		margin-top: var(--space-5);
		padding: var(--space-4);
		border-radius: var(--radius-md);
		border: 1px solid var(--border);
	}

	.result-success {
		border-color: var(--success);
		background: var(--success-soft);
	}

	.result-error {
		border-color: var(--danger);
		background: var(--danger-soft);
	}

	.result-header {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		font-weight: 600;
		font-size: 0.92rem;
	}

	.result-success .result-header {
		color: var(--success);
	}

	.result-error .result-header {
		color: var(--danger);
	}

	.result p {
		margin-top: var(--space-2);
		font-size: 0.88rem;
		color: var(--text-secondary);
	}

	.error-list {
		margin-top: var(--space-3);
		max-height: 240px;
		overflow-y: auto;
		font-size: 0.82rem;
		color: var(--text-secondary);
		padding-left: 1.2em;
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}
</style>
