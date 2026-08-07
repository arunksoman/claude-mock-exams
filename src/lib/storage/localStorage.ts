import { browser } from '$app/environment';
import { STORAGE_KEYS } from '$lib/constants';

export function readJSON<T>(key: string): T | null {
	if (!browser) return null;
	try {
		const raw = localStorage.getItem(key);
		return raw ? (JSON.parse(raw) as T) : null;
	} catch {
		return null;
	}
}

export function writeJSON(key: string, value: unknown): void {
	if (!browser) return;
	localStorage.setItem(key, JSON.stringify(value));
}

export function remove(key: string): void {
	if (!browser) return;
	localStorage.removeItem(key);
}

const ALL_KEYS = Object.values(STORAGE_KEYS);

/** Wipes exactly this app's keys — never a blanket localStorage.clear(), which could nuke unrelated site data. */
export function clearAllAppData(): void {
	if (!browser) return;
	for (const key of ALL_KEYS) localStorage.removeItem(key);
}
