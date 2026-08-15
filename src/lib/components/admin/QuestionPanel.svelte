<script lang="ts">
	import { X, Pencil, Trash2, Plus, CircleCheck, CircleX } from '@lucide/svelte';
	import ConfirmDialog from '../ConfirmDialog.svelte';
	import type { Domain } from '$lib/types';
	import type { QuestionDetail, QuestionDraft } from '$lib/server/adminQuestions';

	interface Props {
		open: boolean;
		/** null = create-new-question mode. */
		questionId: number | null;
		certCode: string;
		domains: Domain[];
		onclose: () => void;
		onsaved: (id: number) => void;
		ondeleted: (id: number) => void;
	}

	let { open, questionId, certCode, domains, onclose, onsaved, ondeleted }: Props = $props();

	type DraftChoice = { text: string; correct: boolean; reasoning: string };
	type Draft = {
		domain: string;
		topic: string;
		external_key: string;
		type: 'single_choice' | 'multiple_response' | 'true_false';
		difficulty: 'easy' | 'medium' | 'intermediate' | 'difficult';
		stem: string;
		explanation: string;
		reference: string;
		tags: string;
		choices: DraftChoice[];
	};

	function blankDraft(): Draft {
		return {
			domain: domains[0]?.code ?? '',
			topic: '',
			external_key: '',
			type: 'single_choice',
			difficulty: 'medium',
			stem: '',
			explanation: '',
			reference: '',
			tags: '',
			choices: [
				{ text: '', correct: true, reasoning: '' },
				{ text: '', correct: false, reasoning: '' }
			]
		};
	}

	function draftFromDetail(d: QuestionDetail): Draft {
		return {
			domain: d.domainCode,
			topic: d.topic ?? '',
			external_key: d.externalKey ?? '',
			type: d.questionType,
			difficulty: d.difficulty,
			stem: d.stem,
			explanation: d.explanation ?? '',
			reference: d.reference ?? '',
			tags: d.tags.join(', '),
			choices: d.choices.map((c) => ({ text: c.text, correct: c.correct, reasoning: c.reasoning }))
		};
	}

	let mode = $state<'view' | 'edit'>('view');
	let detail = $state<QuestionDetail | null>(null);
	let draft = $state<Draft>(blankDraft());
	let loading = $state(false);
	let saving = $state(false);
	let saveError = $state('');
	let confirmDeleteOpen = $state(false);

	const isCreate = $derived(questionId === null);

	async function load(id: number) {
		loading = true;
		saveError = '';
		try {
			const res = await fetch(`/admin/questions/api/${id}`);
			if (!res.ok) throw new Error('Failed to load question');
			detail = (await res.json()) as QuestionDetail;
			draft = draftFromDetail(detail);
			mode = 'view';
		} catch {
			saveError = 'Could not load this question.';
		} finally {
			loading = false;
		}
	}

	$effect(() => {
		if (!open) return;
		if (questionId === null) {
			detail = null;
			draft = blankDraft();
			mode = 'edit';
		} else {
			load(questionId);
		}
	});

	function addChoice() {
		draft.choices = [...draft.choices, { text: '', correct: false, reasoning: '' }];
	}

	function removeChoice(index: number) {
		draft.choices = draft.choices.filter((_, i) => i !== index);
	}

	function toggleCorrect(index: number) {
		if (draft.type === 'single_choice' || draft.type === 'true_false') {
			draft.choices = draft.choices.map((c, i) => ({ ...c, correct: i === index }));
		} else {
			draft.choices[index].correct = !draft.choices[index].correct;
		}
	}

	function buildPayload(): QuestionDraft {
		const correctCount = draft.choices.filter((c) => c.correct).length;
		return {
			domain: draft.domain,
			topic: draft.topic.trim() || undefined,
			external_key: draft.external_key.trim() || undefined,
			type: draft.type,
			difficulty: draft.difficulty,
			select: correctCount,
			stem: draft.stem,
			explanation: draft.explanation.trim() || undefined,
			reference: draft.reference.trim() || undefined,
			tags: draft.tags
				.split(',')
				.map((t) => t.trim())
				.filter(Boolean),
			choices: draft.choices.map((c) => ({
				text: c.text,
				correct: c.correct,
				reasoning: c.reasoning
			}))
		};
	}

	async function save() {
		saving = true;
		saveError = '';
		try {
			const payload = { certCode, draft: buildPayload() };
			const res = await fetch(
				isCreate ? '/admin/questions/api' : `/admin/questions/api/${questionId}`,
				{
					method: isCreate ? 'POST' : 'PATCH',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify(payload)
				}
			);
			const body = await res.json();
			if (!res.ok) {
				saveError = body.error ?? 'Save failed.';
				return;
			}
			onsaved(body.questionId as number);
		} catch {
			saveError = 'Could not save — check your connection and try again.';
		} finally {
			saving = false;
		}
	}

	async function performDelete() {
		if (questionId === null) return;
		confirmDeleteOpen = false;
		await fetch(`/admin/questions/api/${questionId}`, { method: 'DELETE' });
		ondeleted(questionId);
	}
</script>

{#if open}
	<div class="overlay" role="presentation" onclick={onclose}>
		<div
			class="panel"
			role="dialog"
			aria-modal="true"
			aria-labelledby="question-panel-title"
			tabindex="-1"
			onclick={(e) => e.stopPropagation()}
			onkeydown={(e) => e.key === 'Escape' && onclose()}
		>
			<div class="panel-header">
				<h2 id="question-panel-title">
					{isCreate ? 'New question' : mode === 'edit' ? 'Edit question' : 'Question'}
				</h2>
				<button type="button" class="icon-btn" onclick={onclose} aria-label="Close">
					<X size={18} strokeWidth={1.75} />
				</button>
			</div>

			<div class="panel-body">
				{#if loading}
					<p class="hint">Loading…</p>
				{:else if mode === 'view' && detail}
					{@const domainId = detail.domainId}
					<div class="badges">
						<span class="badge">{domains.find((d) => d.id === domainId)?.name ?? ''}</span>
						<span class="badge">{detail.questionType}</span>
						<span class="badge">{detail.difficulty}</span>
						{#if detail.externalKey}<span class="badge">{detail.externalKey}</span>{/if}
					</div>

					<p class="stem">{detail.stem}</p>

					<div class="choices">
						{#each detail.choices as choice (choice.id)}
							<div class="choice" class:correct={choice.correct}>
								<div class="choice-head">
									{#if choice.correct}
										<CircleCheck size={16} strokeWidth={1.75} />
									{:else}
										<CircleX size={16} strokeWidth={1.75} />
									{/if}
									<span>{choice.text}</span>
								</div>
								<p class="reasoning">{choice.reasoning}</p>
							</div>
						{/each}
					</div>

					{#if detail.explanation}
						<div class="field-block">
							<h3>Explanation</h3>
							<p>{detail.explanation}</p>
						</div>
					{/if}
					{#if detail.reference}
						<div class="field-block">
							<h3>Reference</h3>
							<p>{detail.reference}</p>
						</div>
					{/if}
					{#if detail.tags.length}
						<div class="field-block">
							<h3>Tags</h3>
							<p>{detail.tags.join(', ')}</p>
						</div>
					{/if}

					<div class="actions">
						<button type="button" class="btn-secondary" onclick={() => (mode = 'edit')}>
							<Pencil size={15} strokeWidth={1.75} /> Edit
						</button>
						<button type="button" class="btn-danger" onclick={() => (confirmDeleteOpen = true)}>
							<Trash2 size={15} strokeWidth={1.75} /> Delete
						</button>
					</div>
				{:else}
					<div class="form-grid">
						<label>
							<span>Domain</span>
							<select bind:value={draft.domain}>
								{#each domains as d (d.id)}
									<option value={d.code}>{d.name}</option>
								{/each}
							</select>
						</label>
						<label>
							<span>Type</span>
							<select bind:value={draft.type}>
								<option value="single_choice">single_choice</option>
								<option value="multiple_response">multiple_response</option>
								<option value="true_false">true_false</option>
							</select>
						</label>
						<label>
							<span>Difficulty</span>
							<select bind:value={draft.difficulty}>
								<option value="easy">easy</option>
								<option value="medium">medium</option>
								<option value="intermediate">intermediate</option>
								<option value="difficult">difficult</option>
							</select>
						</label>
						<label>
							<span>External key</span>
							<input type="text" bind:value={draft.external_key} placeholder="ccdvf-ai-0142" />
						</label>
						<label>
							<span>Topic</span>
							<input type="text" bind:value={draft.topic} />
						</label>
						<label>
							<span>Tags (comma-separated)</span>
							<input type="text" bind:value={draft.tags} />
						</label>
					</div>

					<label class="full">
						<span>Stem</span>
						<textarea rows="3" bind:value={draft.stem}></textarea>
					</label>

					<div class="choices-editor">
						<div class="choices-editor-head">
							<span>Choices — check the correct one(s)</span>
							<button type="button" class="btn-secondary sm" onclick={addChoice}>
								<Plus size={14} strokeWidth={1.75} /> Add choice
							</button>
						</div>
						{#each draft.choices as choice, i (i)}
							<div class="choice-edit">
								<input
									type="checkbox"
									checked={choice.correct}
									onchange={() => toggleCorrect(i)}
									aria-label="Correct"
								/>
								<div class="choice-edit-fields">
									<input type="text" bind:value={choice.text} placeholder="Choice text" />
									<textarea rows="2" bind:value={choice.reasoning} placeholder="Reasoning"
									></textarea>
								</div>
								<button
									type="button"
									class="icon-btn"
									onclick={() => removeChoice(i)}
									disabled={draft.choices.length <= 2}
									aria-label="Remove choice"
								>
									<X size={15} strokeWidth={1.75} />
								</button>
							</div>
						{/each}
					</div>

					<label class="full">
						<span>Explanation</span>
						<textarea rows="2" bind:value={draft.explanation}></textarea>
					</label>
					<label class="full">
						<span>Reference</span>
						<input type="text" bind:value={draft.reference} />
					</label>

					{#if saveError}
						<p class="error">{saveError}</p>
					{/if}

					<div class="actions">
						{#if !isCreate}
							<button type="button" class="btn-secondary" onclick={() => (mode = 'view')}>
								Cancel
							</button>
						{/if}
						<button type="button" class="btn-primary" onclick={save} disabled={saving}>
							{saving ? 'Saving…' : isCreate ? 'Create question' : 'Save changes'}
						</button>
					</div>
				{/if}
			</div>
		</div>
	</div>
{/if}

<ConfirmDialog
	bind:open={confirmDeleteOpen}
	title="Delete this question?"
	message="This permanently removes the question and all its choices. This can't be undone."
	confirmLabel="Delete"
	danger
	onconfirm={performDelete}
	oncancel={() => (confirmDeleteOpen = false)}
/>

<style>
	.overlay {
		position: fixed;
		inset: 0;
		background: rgba(20, 18, 14, 0.45);
		display: flex;
		align-items: center;
		justify-content: center;
		padding: var(--space-6);
		z-index: 50;
	}

	.panel {
		width: min(900px, 100%);
		max-height: min(88vh, 1000px);
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-md);
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.panel-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--space-4) var(--space-5);
		border-bottom: 1px solid var(--border);
	}

	.panel-header h2 {
		font-size: 1.05rem;
	}

	.panel-body {
		flex: 1;
		overflow-y: auto;
		padding: var(--space-5);
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}

	.icon-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		flex-shrink: 0;
		border-radius: var(--radius-sm);
		border: 1px solid var(--border);
		background: var(--surface);
		color: var(--text-secondary);
		cursor: pointer;
	}

	/* The icon (a child component's <svg>, not a literal element in this file's template) is
	   itself a flex item of this button since it's the sole child — without an explicit
	   flex-shrink:0 here too, it can collapse to a computed width of 0 (verified via
	   devtools: attribute said width="18", computed box was 0x18) despite having plenty of
	   room, a known flexbox quirk for bare replaced-element flex children. */
	.icon-btn :global(svg) {
		flex-shrink: 0;
	}

	.icon-btn:hover {
		background: var(--surface-hover);
		color: var(--text);
	}

	.icon-btn:disabled {
		opacity: 0.4;
		cursor: default;
	}

	.hint {
		color: var(--text-muted);
		font-size: 0.88rem;
	}

	.badges {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}

	.badge {
		font-size: 0.72rem;
		padding: var(--space-1) var(--space-2);
		border-radius: var(--radius-sm);
		background: var(--surface-hover);
		color: var(--text-secondary);
		text-transform: capitalize;
	}

	.stem {
		font-size: 0.94rem;
		line-height: 1.5;
	}

	.choices {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}

	.choice {
		padding: var(--space-3);
		border-radius: var(--radius-md);
		border: 1px solid var(--border);
		background: var(--surface);
	}

	.choice.correct {
		border-color: var(--success);
		background: var(--success-soft);
	}

	.choice-head {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		font-size: 0.88rem;
		font-weight: 500;
	}

	.choice:not(.correct) .choice-head {
		color: var(--danger);
	}

	.choice.correct .choice-head {
		color: var(--success);
	}

	.reasoning {
		margin-top: var(--space-2);
		font-size: 0.84rem;
		color: var(--text-secondary);
	}

	.field-block h3 {
		font-size: 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.03em;
		color: var(--text-muted);
		margin-bottom: var(--space-1);
	}

	.field-block p {
		font-size: 0.88rem;
		color: var(--text-secondary);
	}

	.actions {
		display: flex;
		justify-content: flex-end;
		gap: var(--space-2);
		padding-top: var(--space-2);
	}

	.form-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: var(--space-3);
	}

	label {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		font-size: 0.82rem;
		color: var(--text-secondary);
	}

	label.full {
		grid-column: 1 / -1;
	}

	input,
	select,
	textarea {
		padding: var(--space-2) var(--space-3);
		border-radius: var(--radius-sm);
		border: 1px solid var(--border);
		background: var(--surface);
		color: var(--text);
		font-size: 0.86rem;
		font-family: inherit;
	}

	textarea {
		resize: vertical;
	}

	.choices-editor {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}

	.choices-editor-head {
		display: flex;
		justify-content: space-between;
		align-items: center;
		font-size: 0.82rem;
		color: var(--text-secondary);
	}

	.choice-edit {
		display: grid;
		grid-template-columns: auto 1fr auto;
		gap: var(--space-2);
		align-items: start;
		padding: var(--space-2);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
	}

	.choice-edit-fields {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	.choice-edit input[type='checkbox'] {
		margin-top: var(--space-2);
	}

	button {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		padding: var(--space-2) var(--space-4);
		border-radius: var(--radius-sm);
		border: 1px solid transparent;
		font-size: 0.85rem;
		font-weight: 600;
		cursor: pointer;
	}

	.btn-secondary {
		background: var(--surface);
		border-color: var(--border);
		color: var(--text);
	}

	.btn-secondary.sm {
		padding: var(--space-1) var(--space-3);
		font-weight: 500;
	}

	.btn-secondary:hover {
		background: var(--surface-hover);
	}

	.btn-primary {
		background: var(--accent);
		color: var(--accent-contrast);
	}

	.btn-primary:disabled {
		opacity: 0.6;
		cursor: default;
	}

	.btn-danger {
		background: var(--danger-soft);
		color: var(--danger);
		border-color: var(--danger);
	}

	.error {
		color: var(--danger);
		font-size: 0.85rem;
	}

	@media (max-width: 640px) {
		.overlay {
			padding: var(--space-2);
		}
		.panel {
			width: 100%;
			max-height: 96vh;
		}
		.form-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
