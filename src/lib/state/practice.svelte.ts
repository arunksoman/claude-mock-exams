import { browser } from '$app/environment';
import { STORAGE_KEYS } from '$lib/constants';
import { readJSON, remove, writeJSON } from '$lib/storage/localStorage';
import { buildGradedQuestion } from '$lib/scoring';
import type { PracticeConfig, PracticeInProgress, QuestionFull, PracticeAttempt } from '$lib/types';
import { addAttempt } from './history.svelte';

export const practiceState = $state<{ session: PracticeInProgress | null }>({ session: null });

function persist(): void {
	if (practiceState.session) writeJSON(STORAGE_KEYS.practiceInProgress, practiceState.session);
	else remove(STORAGE_KEYS.practiceInProgress);
}

export function initPracticeSession(): void {
	if (!browser) return;
	// Prepare the restored session on a plain local first, then assign it in one shot — reading
	// `practiceState.session` back out here (to patch it in place) would make this call's own
	// $effect depend on `practiceState.session`, and since it also *writes* that field, every
	// future re-run would reassign it to a fresh readJSON() object and immediately retrigger
	// itself: an infinite effect loop.
	const restored = readJSON<PracticeInProgress>(STORAGE_KEYS.practiceInProgress);
	// Sessions saved before the strike-off feature existed won't have this field.
	if (restored && !restored.struck) restored.struck = {};
	practiceState.session = restored;
}

export function startPracticeSession(config: PracticeConfig, questions: QuestionFull[]): void {
	practiceState.session = {
		id: crypto.randomUUID(),
		config,
		questions,
		answers: {},
		revealed: {},
		struck: {},
		currentIndex: 0,
		startedAt: Date.now()
	};
	persist();
}

export function answerPracticeQuestion(
	questionId: number,
	selectedIds: number[],
	revealed = true
): void {
	const session = practiceState.session;
	if (!session) return;
	session.answers[questionId] = selectedIds;
	if (revealed) session.revealed[questionId] = true;
	persist();
}

/** Toggles a choice as struck-off (eliminated) for the given question — a candidate's own note-taking aid, never sent to the server or scored. */
export function togglePracticeStrike(questionId: number, choiceId: number): void {
	const session = practiceState.session;
	if (!session) return;
	const current = session.struck[questionId] ?? [];
	session.struck[questionId] = current.includes(choiceId)
		? current.filter((id) => id !== choiceId)
		: [...current, choiceId];
	persist();
}

export function gotoPracticeIndex(index: number): void {
	const session = practiceState.session;
	if (!session) return;
	session.currentIndex = Math.max(0, Math.min(index, session.questions.length - 1));
	persist();
}

export function abandonPracticeSession(): void {
	practiceState.session = null;
	persist();
}

/** Builds the graded attempt for history and clears the resumable in-progress session. */
export function finishPracticeSession(): PracticeAttempt | null {
	const session = practiceState.session;
	if (!session) return null;

	const graded = session.questions.map((q) => buildGradedQuestion(q, session.answers[q.id] ?? []));
	const attempt: PracticeAttempt = {
		id: session.id,
		kind: 'practice',
		config: session.config,
		questions: graded,
		startedAt: session.startedAt,
		completedAt: Date.now(),
		correctCount: graded.filter((q) => q.correct).length,
		totalQuestions: graded.length
	};

	addAttempt(attempt);
	practiceState.session = null;
	persist();
	return attempt;
}
