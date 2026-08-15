<script lang="ts">
	import { untrack } from 'svelte';
	import { get } from 'svelte/store';
	import { createVirtualizer } from '@tanstack/svelte-virtual';
	import { createQuestionsTable } from './useQuestionsTable.svelte';
	import type { QuestionListRow } from '$lib/server/adminQuestions';
	import type { Domain } from '$lib/types';

	interface Props {
		rows: QuestionListRow[];
		domains: Domain[];
		loading: boolean;
		loadingMore: boolean;
		hasMore: boolean;
		selectedId: number | null;
		onloadmore: () => void;
		onselect: (row: QuestionListRow) => void;
	}

	let { rows, domains, loading, loadingMore, hasMore, selectedId, onloadmore, onselect }: Props =
		$props();

	const domainName = (id: number): string => domains.find((d) => d.id === id)?.name ?? `#${id}`;

	const tableApi = createQuestionsTable(() => rows);
	const headerGroup = $derived(tableApi.table.getHeaderGroups()[0]);

	let scrollEl = $state<HTMLDivElement | null>(null);
	const ROW_HEIGHT = 52;

	// Initial value only — the $effect below keeps this in sync via setOptions() as `rows`
	// changes (svelte-virtual's own store-based state, not a rune, so it needs an explicit push).
	const virtualizer = createVirtualizer<HTMLDivElement, HTMLDivElement>({
		count: untrack(() => rows.length),
		getScrollElement: () => scrollEl,
		estimateSize: () => ROW_HEIGHT,
		overscan: 12
	});

	// Stable, untracked instance for *pushing* options — svelte-virtual's setOptions() always
	// force-emits a fresh store value (even when the visible range doesn't change), so calling
	// it via the auto-subscribed `$virtualizer` would make this effect depend on its own
	// output and re-fire itself forever (froze the tab). Reading `$virtualizer` in the template
	// below is fine — that's meant to re-render on every emission, it just never re-triggers
	// this effect since this effect never reads the store.
	const virtualizerInstance = get(virtualizer);

	$effect(() => {
		virtualizerInstance.setOptions({ count: rows.length, getScrollElement: () => scrollEl });
	});

	function onscroll() {
		if (!scrollEl || loadingMore || !hasMore) return;
		const remaining = scrollEl.scrollHeight - scrollEl.scrollTop - scrollEl.clientHeight;
		if (remaining < ROW_HEIGHT * 8) onloadmore();
	}
</script>

<div class="table-wrap">
	<div class="header-row">
		{#each headerGroup.headers as header (header.id)}
			<span class="col col-{header.column.id}">{header.column.columnDef.header as string}</span>
		{/each}
	</div>

	<div class="scroll" bind:this={scrollEl} {onscroll}>
		{#if rows.length === 0 && !loading}
			<div class="empty">No questions match the current filters.</div>
		{:else}
			<div class="virtual-inner" style:height="{$virtualizer.getTotalSize()}px">
				{#each $virtualizer.getVirtualItems() as vi (rows[vi.index]?.id ?? vi.key)}
					{@const row = rows[vi.index]}
					{#if row}
						<button
							type="button"
							class="row"
							class:selected={row.id === selectedId}
							style:transform="translateY({vi.start}px)"
							style:height="{vi.size}px"
							onclick={() => onselect(row)}
						>
							<span class="col col-externalKey">{row.externalKey ?? '—'}</span>
							<span class="col col-domain">{domainName(row.domainId)}</span>
							<span class="col col-type">{row.questionType}</span>
							<span class="col col-difficulty">{row.difficulty}</span>
							<span class="col col-select">{row.selectCount}</span>
							<span class="col col-stem" title={row.stem}>{row.stem}</span>
							<span class="col col-choices">{row.choiceCount}</span>
							<span class="col col-status">{row.status}</span>
						</button>
					{/if}
				{/each}
			</div>
		{/if}
		{#if loadingMore}
			<div class="loading-more">Loading more…</div>
		{/if}
	</div>
</div>

<style>
	.table-wrap {
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		background: var(--surface);
		overflow: hidden;
	}

	.header-row,
	.row {
		display: grid;
		grid-template-columns: 1fr 1.4fr 1fr 0.9fr 0.6fr 3fr 0.7fr 0.8fr;
		gap: var(--space-3);
		align-items: center;
		padding: 0 var(--space-4);
	}

	.header-row {
		height: 40px;
		background: var(--surface-hover);
		border-bottom: 1px solid var(--border);
		font-size: 0.72rem;
		text-transform: uppercase;
		letter-spacing: 0.03em;
		color: var(--text-muted);
	}

	.scroll {
		max-height: 60vh;
		overflow-y: auto;
		position: relative;
	}

	.virtual-inner {
		position: relative;
		width: 100%;
	}

	.row {
		position: absolute;
		top: 0;
		left: 0;
		width: 100%;
		border: none;
		border-bottom: 1px solid var(--border);
		background: var(--surface);
		font-size: 0.85rem;
		color: var(--text);
		text-align: left;
		cursor: pointer;
	}

	.row:hover {
		background: var(--surface-hover);
	}

	.row.selected {
		background: var(--accent-soft);
	}

	.col {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.col-stem {
		color: var(--text-secondary);
	}

	.col-difficulty,
	.col-type {
		text-transform: capitalize;
	}

	.empty,
	.loading-more {
		padding: var(--space-6);
		text-align: center;
		color: var(--text-muted);
		font-size: 0.88rem;
	}
</style>
