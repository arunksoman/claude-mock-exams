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
	practiceState.session = readJSON<PracticeInProgress>(STORAGE_KEYS.practiceInProgress);
}

export function startPracticeSession(config: PracticeConfig, questions: QuestionFull[]): void {
	practiceState.session = {
		id: crypto.randomUUID(),
		config,
		questions,
		answers: {},
		revealed: {},
		currentIndex: 0,
		startedAt: Date.now()
	};
	persist();
}

export function answerPracticeQuestion(questionId: number, selectedIds: number[]): void {
	const session = practiceState.session;
	if (!session) return;
	session.answers[questionId] = selectedIds;
	session.revealed[questionId] = true;
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
