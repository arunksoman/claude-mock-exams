import { browser } from '$app/environment';
import { STORAGE_KEYS } from '$lib/constants';
import { readJSON, writeJSON } from '$lib/storage/localStorage';

export type ThemePreference = 'light' | 'dark' | 'system';

export const themeState = $state<{ pref: ThemePreference }>({ pref: 'system' });

let mediaQuery: MediaQueryList | null = null;

function resolve(pref: ThemePreference): 'light' | 'dark' {
	if (pref !== 'system') return pref;
	return browser && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function apply(pref: ThemePreference): void {
	if (!browser) return;
	document.documentElement.dataset.theme = resolve(pref);
}

export function setTheme(pref: ThemePreference): void {
	themeState.pref = pref;
	writeJSON(STORAGE_KEYS.theme, pref);
	apply(pref);
}

export function initTheme(): void {
	if (!browser) return;
	const stored = readJSON<ThemePreference>(STORAGE_KEYS.theme);
	themeState.pref = stored ?? 'system';
	apply(themeState.pref);

	if (!mediaQuery) {
		mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
		mediaQuery.addEventListener('change', () => {
			if (themeState.pref === 'system') apply('system');
		});
	}
}

export function resetTheme(): void {
	setTheme('system');
}
