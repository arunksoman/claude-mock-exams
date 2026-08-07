import { browser } from '$app/environment';
import { MAX_HISTORY_ENTRIES, STORAGE_KEYS } from '$lib/constants';
import { readJSON, writeJSON } from '$lib/storage/localStorage';
import type { Attempt } from '$lib/types';

export const historyState = $state<{ attempts: Attempt[] }>({ attempts: [] });

function persist(): void {
	writeJSON(STORAGE_KEYS.history, historyState.attempts);
}

export function initHistory(): void {
	if (!browser) return;
	historyState.attempts = readJSON<Attempt[]>(STORAGE_KEYS.history) ?? [];
}

export function addAttempt(attempt: Attempt): void {
	historyState.attempts = [attempt, ...historyState.attempts].slice(0, MAX_HISTORY_ENTRIES);
	persist();
}

export function getAttempt(id: string): Attempt | undefined {
	return historyState.attempts.find((a) => a.id === id);
}

export function resetHistory(): void {
	historyState.attempts = [];
	persist();
}
