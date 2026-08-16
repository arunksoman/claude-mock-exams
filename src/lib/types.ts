export type QuestionType = 'single_choice' | 'multiple_response' | 'true_false';
export type Difficulty = 'easy' | 'medium' | 'intermediate' | 'difficult';

export interface Certification {
	id: number;
	code: string;
	name: string;
	examQuestionCount: number;
	examDurationMinutes: number;
	passingScore: number;
	maxScore: number;
}

export interface Domain {
	id: number;
	code: string;
	name: string;
	weightPercentage: number;
	sortOrder: number;
}

/** Choice shape shown once correctness/reasoning may be revealed (practice mode, or a graded exam). */
export interface ChoiceFull {
	id: number;
	labelHtml: string;
	isCorrect: boolean;
	reasoningHtml: string;
	sortOrder: number;
}

/**
 * Choice shape sent to the client during an in-progress mock exam — structurally has no
 * answer key. Deliberately omits sortOrder too: source data lists the correct choice at
 * sort_order 0, so exposing that field (even with array order shuffled) would still leak
 * the answer statistically.
 */
export interface ChoicePublic {
	id: number;
	labelHtml: string;
}

interface QuestionBase {
	id: number;
	domainId: number;
	questionType: QuestionType;
	selectCount: number;
	stemHtml: string;
}

export interface QuestionFull extends QuestionBase {
	difficulty: Difficulty;
	explanationHtml: string | null;
	choices: ChoiceFull[];
}

/** What the exam-start endpoint returns — no is_correct/reasoning anywhere in this shape. */
export interface QuestionPublic extends QuestionBase {
	choices: ChoicePublic[];
}

export interface GradedChoice extends ChoiceFull {
	selected: boolean;
}

export interface GradedQuestion extends QuestionBase {
	explanationHtml: string | null;
	choices: GradedChoice[];
	correct: boolean;
}

export interface DomainBreakdown {
	domainId: number;
	domainName: string;
	weightPercentage: number;
	correct: number;
	total: number;
	pct: number;
}

export interface OverallScore {
	correctCount: number;
	totalQuestions: number;
	pct: number;
	scaledScore: number;
	passingScore: number;
	maxScore: number;
	passed: boolean;
}

export interface PracticeConfig {
	domainIds: number[];
	difficulties: Difficulty[];
	count: number;
}

export interface PracticeAttempt {
	id: string;
	kind: 'practice';
	certCode: string;
	config: PracticeConfig;
	questions: GradedQuestion[];
	startedAt: number;
	completedAt: number;
	correctCount: number;
	totalQuestions: number;
}

export interface ExamAttempt {
	id: string;
	kind: 'exam';
	certCode: string;
	startedAt: number;
	completedAt: number;
	durationMinutes: number;
	questions: GradedQuestion[];
	domainBreakdown: DomainBreakdown[];
	overall: OverallScore;
}

export type Attempt = PracticeAttempt | ExamAttempt;

/** localStorage shape for a practice session that can be resumed. */
export interface PracticeInProgress {
	id: string;
	certCode: string;
	config: PracticeConfig;
	questions: QuestionFull[];
	answers: Record<number, number[]>;
	revealed: Record<number, boolean>;
	/** Choice ids the candidate struck off as eliminated distractors, per question id — a note-taking aid, not part of scoring. */
	struck: Record<number, number[]>;
	currentIndex: number;
	startedAt: number;
}

/** localStorage shape for an in-progress exam — questions here are QuestionPublic, never QuestionFull. */
export interface ExamInProgress {
	attemptId: string;
	certCode: string;
	startedAt: number;
	durationMinutes: number;
	questions: QuestionPublic[];
	answers: Record<number, number[]>;
	flagged: number[];
	/** Choice ids the candidate struck off as eliminated distractors, per question id — a note-taking aid, not part of scoring. */
	struck: Record<number, number[]>;
	currentIndex: number;
}
