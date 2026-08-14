<script lang="ts">
	import { untrack } from 'svelte';
	import { SvelteURLSearchParams } from 'svelte/reactivity';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { Plus } from '@lucide/svelte';
	import { DIFFICULTIES } from '$lib/constants';
	import type { Difficulty } from '$lib/types';
	import type { QuestionListRow } from '$lib/server/adminQuestions';
	import QuestionsTable from '$lib/components/admin/QuestionsTable.svelte';
	import QuestionPanel from '$lib/components/admin/QuestionPanel.svelte';
	import UploadPreview from '$lib/components/admin/UploadPreview.svelte';

	let { data } = $props();

	let rows = $state<QuestionListRow[]>(untrack(() => data.rows));
	let hasMore = $state(untrack(() => data.rows.length === data.pageSize));
	let loading = $state(false);
	let loadingMore = $state(false);

	let selectedDomains = $state<number[]>([]);
	let selectedDifficulties = $state<Difficulty[]>([]);
	let search = $state('');
	let searchDebounce: ReturnType<typeof setTimeout> | undefined;

	// Cert switching goes through a full navigation (?cert=) since the domain list itself
	// changes, not just the filtered rows — the server load already resolves that. Re-sync the
	// local row/paging state from the fresh `data` whenever it changes, without reading `rows`
	// back inside this effect (that's the exact loop shape CONTEXT_MAP warns about).
	$effect(() => {
		rows = data.rows;
		hasMore = data.rows.length === data.pageSize;
		selectedDomains = [];
		selectedDifficulties = [];
		search = '';
	});

	let panelOpen = $state(false);
	let selectedQuestionId = $state<number | null>(null);

	function switchCert(code: string) {
		goto(resolve(`/admin/questions?cert=${encodeURIComponent(code)}`));
	}

	async function fetchPage(afterId: number | undefined, replace: boolean) {
		if (!data.activeCert) return;
		if (replace) loading = true;
		else loadingMore = true;

		const params = new SvelteURLSearchParams({ cert: data.activeCert.code });
		if (selectedDomains.length) params.set('domain', selectedDomains.join(','));
		if (selectedDifficulties.length) params.set('difficulty', selectedDifficulties.join(','));
		if (search.trim()) params.set('q', search.trim());
		if (afterId) params.set('afterId', String(afterId));

		try {
			const res = await fetch(`/admin/questions/api/list?${params}`);
			const body = (await res.json()) as { rows: QuestionListRow[] };
			hasMore = body.rows.length === data.pageSize;
			rows = replace ? body.rows : [...rows, ...body.rows];
		} finally {
			loading = false;
			loadingMore = false;
		}
	}

	function refetch() {
		fetchPage(undefined, true);
	}

	function toggleDomain(id: number) {
		selectedDomains = selectedDomains.includes(id)
			? selectedDomains.filter((d) => d !== id)
			: [...selectedDomains, id];
		refetch();
	}

	function toggleDifficulty(d: Difficulty) {
		selectedDifficulties = selectedDifficulties.includes(d)
			? selectedDifficulties.filter((x) => x !== d)
			: [...selectedDifficulties, d];
		refetch();
	}

	function onSearchInput() {
		clearTimeout(searchDebounce);
		searchDebounce = setTimeout(refetch, 300);
	}

	function onLoadMore() {
		if (rows.length === 0) return;
		fetchPage(rows[rows.length - 1].id, false);
	}

	function openCreate() {
		selectedQuestionId = null;
		panelOpen = true;
	}

	function openRow(row: QuestionListRow) {
		selectedQuestionId = row.id;
		panelOpen = true;
	}

	function onSaved() {
		panelOpen = false;
		refetch();
	}

	function onDeleted(id: number) {
		panelOpen = false;
		rows = rows.filter((r) => r.id !== id);
	}
</script>

<svelte:head>
	<title>Manage Questions — Admin</title>
</svelte:head>

<div class="header">
	<h1>Questions</h1>
	<button type="button" class="primary" onclick={openCreate} disabled={!data.activeCert}>
		<Plus size={16} strokeWidth={1.75} /> Add question
	</button>
</div>

{#if data.certifications.length === 0}
	<p class="empty-state">No certifications exist in the database yet.</p>
{:else}
	<div class="filters">
		<div class="cert-tabs">
			{#each data.certifications as cert (cert.id)}
				<button
					type="button"
					class="chip"
					class:checked={cert.code === data.activeCert?.code}
					onclick={() => switchCert(cert.code)}
				>
					{cert.code}
				</button>
			{/each}
		</div>

		<div class="chips">
			{#each data.domains as domain (domain.id)}
				{@const checked = selectedDomains.includes(domain.id)}
				<button type="button" class="chip" class:checked onclick={() => toggleDomain(domain.id)}>
					{domain.name}
				</button>
			{/each}
		</div>

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

		<input
			type="search"
			class="search"
			placeholder="Search stem or external key…"
			bind:value={search}
			oninput={onSearchInput}
		/>
	</div>

	<QuestionsTable
		{rows}
		domains={data.domains}
		{loading}
		{loadingMore}
		{hasMore}
		selectedId={selectedQuestionId}
		onloadmore={onLoadMore}
		onselect={openRow}
	/>

	{#if data.activeCert}
		<section class="upload-section">
			<h2>Bulk upload (.jsonl)</h2>
			<p class="hint">
				Preview validates the whole file first — nothing is written until you review and commit.
			</p>
			<UploadPreview certCode={data.activeCert.code} oncommitted={refetch} />
		</section>
	{/if}
{/if}

{#if data.activeCert}
	<QuestionPanel
		open={panelOpen}
		questionId={selectedQuestionId}
		certCode={data.activeCert.code}
		domains={data.domains}
		onclose={() => (panelOpen = false)}
		onsaved={onSaved}
		ondeleted={onDeleted}
	/>
{/if}

<style>
	.header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: var(--space-5);
	}

	h1 {
		font-size: 1.4rem;
	}

	.primary {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-2) var(--space-4);
		border-radius: var(--radius-md);
		border: none;
		background: var(--accent);
		color: var(--accent-contrast);
		font-weight: 600;
		font-size: 0.88rem;
		cursor: pointer;
	}

	.primary:disabled {
		opacity: 0.6;
		cursor: default;
	}

	.empty-state {
		color: var(--text-muted);
		padding: var(--space-6);
		text-align: center;
	}

	.filters {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		margin-bottom: var(--space-4);
	}

	.cert-tabs,
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}

	.chip {
		padding: var(--space-1) var(--space-3);
		border-radius: 999px;
		border: 1px solid var(--border);
		background: var(--surface);
		color: var(--text-secondary);
		font-size: 0.82rem;
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

	.search {
		max-width: 320px;
		padding: var(--space-2) var(--space-3);
		border-radius: var(--radius-sm);
		border: 1px solid var(--border);
		background: var(--surface);
		color: var(--text);
		font-size: 0.86rem;
	}

	.upload-section {
		margin-top: var(--space-6);
	}

	.upload-section h2 {
		font-size: 0.85rem;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--text-muted);
		margin-bottom: var(--space-2);
	}

	.hint {
		font-size: 0.85rem;
		color: var(--text-secondary);
		margin-bottom: var(--space-4);
	}
</style>
