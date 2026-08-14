import { browser } from '$app/environment';
import { STORAGE_KEYS } from '$lib/constants';
import { readJSON, remove, writeJSON } from '$lib/storage/localStorage';
import type { ExamAttempt, ExamInProgress, QuestionPublic } from '$lib/types';
import { addAttempt } from './history.svelte';

export const examState = $state<{ session: ExamInProgress | null }>({ session: null });

function persist(): void {
	if (examState.session) writeJSON(STORAGE_KEYS.examInProgress, examState.session);
	else remove(STORAGE_KEYS.examInProgress);
}

export function initExam(): void {
	if (!browser) return;
	// Prepare the restored session on a plain local first, then assign it in one shot — reading
	// `examState.session` back out here (to patch it in place) would make this call's own
	// $effect depend on `examState.session`, and since it also *writes* that field, every future
	// re-run would reassign it to a fresh readJSON() object and immediately retrigger itself: an
	// infinite effect loop.
	const restored = readJSON<ExamInProgress>(STORAGE_KEYS.examInProgress);
	// Sessions saved before the strike-off feature existed won't have this field.
	if (restored && !restored.struck) restored.struck = {};
	examState.session = restored;
}

export function startExam(payload: {
	attemptId: string;
	startedAt: number;
	durationMinutes: number;
	questions: QuestionPublic[];
}): void {
	examState.session = {
		attemptId: payload.attemptId,
		startedAt: payload.startedAt,
		durationMinutes: payload.durationMinutes,
		questions: payload.questions,
		answers: {},
		flagged: [],
		struck: {},
		currentIndex: 0
	};
	persist();
}

export function answerExamQuestion(questionId: number, selectedIds: number[]): void {
	const session = examState.session;
	if (!session) return;
	session.answers[questionId] = selectedIds;
	persist();
}

/** Toggles a choice as struck-off (eliminated) for the given question — a candidate's own note-taking aid, never sent to the server or scored. */
export function toggleExamStrike(questionId: number, choiceId: number): void {
	const session = examState.session;
	if (!session) return;
	const current = session.struck[questionId] ?? [];
	session.struck[questionId] = current.includes(choiceId)
		? current.filter((id) => id !== choiceId)
		: [...current, choiceId];
	persist();
}

export function toggleExamFlag(questionId: number): void {
	const session = examState.session;
	if (!session) return;
	const idx = session.flagged.indexOf(questionId);
	if (idx === -1) session.flagged.push(questionId);
	else session.flagged.splice(idx, 1);
	persist();
}

export function gotoExamIndex(index: number): void {
	const session = examState.session;
	if (!session) return;
	session.currentIndex = Math.max(0, Math.min(index, session.questions.length - 1));
	persist();
}

/**
 * Stores the graded result from /api/exam/submit into history. Deliberately does NOT clear
 * `examState.session` here — the active exam page's own guard effect (`if (!examState.session)
 * goto('/exam')`) reacts to that field, and nulling it while still on that page races the
 * caller's explicit navigation to the results page, occasionally winning and bouncing the user
 * back to the exam intro instead of showing results. Call `clearExamSession()` only after
 * navigating away.
 */
export function completeExam(attempt: ExamAttempt): void {
	addAttempt(attempt);
}

/** Clears the resumable exam session — call only once the app has already navigated away from the active-exam page. */
export function clearExamSession(): void {
	examState.session = null;
	persist();
}

export function abandonExam(): void {
	examState.session = null;
	persist();
}
