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
	examState.session = readJSON<ExamInProgress>(STORAGE_KEYS.examInProgress);
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

/** Stores the graded result from /api/exam/submit into history and clears the resumable session. */
export function completeExam(attempt: ExamAttempt): void {
	addAttempt(attempt);
	examState.session = null;
	persist();
}

export function abandonExam(): void {
	examState.session = null;
	persist();
}
