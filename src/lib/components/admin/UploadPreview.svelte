<script lang="ts">
	import { Upload, CircleCheck, CircleAlert } from '@lucide/svelte';

	interface PreviewRow {
		line: number;
		domainCode: string;
		externalKey: string | null;
		questionType: string;
		difficulty: string;
		selectCount: number;
		stem: string;
		choiceCount: number;
	}

	interface PreviewResult {
		errors: { line: number; message: string }[];
		count: number;
		preview: PreviewRow[];
	}

	interface CommitResult {
		created: number;
		updated: number;
		choicesWritten: number;
		errors: { line: number; message: string }[];
	}

	interface Props {
		certCode: string;
		oncommitted: () => void;
	}

	let { certCode, oncommitted }: Props = $props();

	let file = $state<File | null>(null);
	let fileName = $state('');
	let previewing = $state(false);
	let committing = $state(false);
	let previewResult = $state<PreviewResult | null>(null);
	let commitResult = $state<CommitResult | null>(null);
	let networkError = $state('');

	function onFileChange(e: Event) {
		const input = e.currentTarget as HTMLInputElement;
		file = input.files?.[0] ?? null;
		fileName = file?.name ?? '';
		previewResult = null;
		commitResult = null;
		networkError = '';
	}

	async function preview() {
		if (!file) return;
		previewing = true;
		networkError = '';
		commitResult = null;
		try {
			const form = new FormData();
			form.set('file', file);
			form.set('cert', certCode);
			const res = await fetch('/admin/questions/api/preview-upload', {
				method: 'POST',
				body: form
			});
			const body = await res.json();
			if (!res.ok) {
				networkError = body.error ?? 'Preview failed.';
				return;
			}
			previewResult = body as PreviewResult;
		} catch {
			networkError = 'Could not reach the server. Please try again.';
		} finally {
			previewing = false;
		}
	}

	async function commit() {
		if (!file) return;
		committing = true;
		networkError = '';
		try {
			const form = new FormData();
			form.set('file', file);
			form.set('cert', certCode);
			const res = await fetch('/admin/questions/api/commit-upload', {
				method: 'POST',
				body: form
			});
			const body = (await res.json()) as CommitResult;
			commitResult = body;
			if (body.errors.length === 0) {
				previewResult = null;
				oncommitted();
			}
		} catch {
			networkError = 'Could not reach the server. Please try again.';
		} finally {
			committing = false;
		}
	}
</script>

<div class="upload">
	<label class="file-picker">
		<input type="file" accept=".jsonl,.txt" onchange={onFileChange} />
		<span>{fileName || 'Choose a .jsonl file…'}</span>
	</label>

	<button type="button" class="primary" onclick={preview} disabled={!file || previewing}>
		<Upload size={16} strokeWidth={1.75} />
		{previewing ? 'Reading…' : 'Preview'}
	</button>

	{#if networkError}
		<p class="error">{networkError}</p>
	{/if}

	{#if previewResult}
		{#if previewResult.errors.length > 0}
			<div class="result result-error">
				<div class="result-header">
					<CircleAlert size={18} strokeWidth={1.75} />
					<span>{previewResult.errors.length} error(s) — nothing was written</span>
				</div>
				<ul class="error-list">
					{#each previewResult.errors as err (err.line)}
						<li>line {err.line}: {err.message}</li>
					{/each}
				</ul>
			</div>
		{:else}
			<div class="result result-review">
				<div class="result-header">
					<span>{previewResult.count} question(s) ready to commit — review before writing</span>
				</div>
				<ul class="preview-list">
					{#each previewResult.preview as row (row.line)}
						<li>
							<span class="badge">{row.domainCode}</span>
							<span class="badge">{row.questionType}</span>
							<span class="badge">{row.difficulty}</span>
							<span class="stem">{row.stem}</span>
						</li>
					{/each}
				</ul>
				<button type="button" class="primary" onclick={commit} disabled={committing}>
					{committing ? 'Committing…' : `Commit ${previewResult.count} question(s)`}
				</button>
			</div>
		{/if}
	{/if}

	{#if commitResult}
		{#if commitResult.errors.length > 0}
			<div class="result result-error">
				<div class="result-header">
					<CircleAlert size={18} strokeWidth={1.75} />
					<span
						>File changed since preview — {commitResult.errors.length} error(s), nothing written</span
					>
				</div>
			</div>
		{:else}
			<div class="result result-success">
				<div class="result-header">
					<CircleCheck size={18} strokeWidth={1.75} />
					<span>Committed</span>
				</div>
				<p>
					{commitResult.created} created, {commitResult.updated} updated, {commitResult.choicesWritten}
					choice rows written.
				</p>
			</div>
		{/if}
	{/if}
</div>

<style>
	.upload {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-3);
		align-items: flex-start;
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
		width: 100%;
	}

	.result {
		width: 100%;
		margin-top: var(--space-2);
		padding: var(--space-4);
		border-radius: var(--radius-md);
		border: 1px solid var(--border);
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}

	.result-success {
		border-color: var(--success);
		background: var(--success-soft);
	}

	.result-error {
		border-color: var(--danger);
		background: var(--danger-soft);
	}

	.result-review {
		background: var(--surface);
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
		font-size: 0.88rem;
		color: var(--text-secondary);
	}

	.error-list {
		max-height: 240px;
		overflow-y: auto;
		font-size: 0.82rem;
		color: var(--text-secondary);
		padding-left: 1.2em;
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}

	.preview-list {
		max-height: 280px;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		list-style: none;
		padding: 0;
	}

	.preview-list li {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		font-size: 0.82rem;
		padding: var(--space-2);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
	}

	.preview-list .stem {
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		color: var(--text-secondary);
	}

	.badge {
		flex-shrink: 0;
		font-size: 0.7rem;
		padding: var(--space-1) var(--space-2);
		border-radius: var(--radius-sm);
		background: var(--surface-hover);
		color: var(--text-secondary);
	}
</style>
