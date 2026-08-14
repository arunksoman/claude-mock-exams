import { untrack } from 'svelte';
import {
	createTable,
	getCoreRowModel,
	type ColumnDef,
	type Table,
	type TableState
} from '@tanstack/table-core';
import type { QuestionListRow } from '$lib/server/adminQuestions';

export const QUESTION_COLUMNS: ColumnDef<QuestionListRow, unknown>[] = [
	{ id: 'externalKey', header: 'Key', accessorKey: 'externalKey' },
	{ id: 'domain', header: 'Domain', accessorKey: 'domainId' },
	{ id: 'type', header: 'Type', accessorKey: 'questionType' },
	{ id: 'difficulty', header: 'Difficulty', accessorKey: 'difficulty' },
	{ id: 'select', header: 'Select', accessorKey: 'selectCount' },
	{ id: 'stem', header: 'Question', accessorKey: 'stem' },
	{ id: 'choices', header: 'Choices', accessorKey: 'choiceCount' },
	{ id: 'status', header: 'Status', accessorKey: 'status' }
];

/**
 * Thin Svelte 5 runes wrapper around @tanstack/table-core (used only for column defs and
 * header-group rendering here — no sorting/filtering features enabled, since the server
 * already owns filtering and rows are always id-ordered for keyset pagination).
 *
 * A framework adapter (useReactTable etc.) does two things a bare `createTable()` call
 * doesn't: it merges every feature's default state slice (`table.initialState` — e.g.
 * `columnPinning: { left: [], right: [] }`) into the controlled `state` right after
 * construction, and it re-pushes new `data`/`state` via `table.setOptions()` rather than
 * constructing a fresh table each render. Skipping the initialState merge is what actually
 * crashes `getHeaderGroups()` (`Cannot read properties of undefined (reading 'left')`) —
 * this replicates both steps by hand.
 */
export function createQuestionsTable(getRows: () => QuestionListRow[]) {
	// Placeholder until the merge below — every consumer reads `tableState` only after that
	// point, so the empty object never actually escapes as an incomplete TableState.
	let tableState = $state<TableState>({} as TableState);

	const table: Table<QuestionListRow> = createTable<QuestionListRow>({
		columns: QUESTION_COLUMNS,
		data: [],
		state: untrack(() => tableState),
		onStateChange: (updater) => {
			tableState = typeof updater === 'function' ? updater(untrack(() => tableState)) : updater;
		},
		renderFallbackValue: null,
		getCoreRowModel: getCoreRowModel()
	});

	tableState = { ...table.initialState, ...untrack(() => tableState) };
	table.setOptions((prev) => ({ ...prev, state: tableState }));

	$effect(() => {
		table.setOptions((prev) => ({ ...prev, data: getRows(), state: tableState }));
	});

	return {
		get table() {
			return table;
		}
	};
}
