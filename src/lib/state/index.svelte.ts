import { clearAllAppData } from '$lib/storage/localStorage';
import { initTheme, resetTheme } from './theme.svelte';
import { initPracticeSession, abandonPracticeSession } from './practice.svelte';
import { initExam, abandonExam } from './exam.svelte';
import { initHistory, resetHistory } from './history.svelte';

export function initAllAppState(): void {
	initTheme();
	initPracticeSession();
	initExam();
	initHistory();
}

/** Wipes every piece of app state this app has stored in the browser and resets it in memory. */
export function resetAllAppState(): void {
	abandonPracticeSession();
	abandonExam();
	resetHistory();
	clearAllAppData();
	resetTheme();
}
