import type { Difficulty, QuestionType } from '$lib/types';

const QUESTION_TYPES = new Set<string>(['single_choice', 'multiple_response', 'true_false']);
const DIFFICULTIES = new Set<string>(['easy', 'medium', 'intermediate', 'difficult']);

export interface RawChoice {
	text?: unknown;
	correct?: unknown;
	reasoning?: unknown;
}

export interface RawQuestion {
	domain?: unknown;
	topic?: unknown;
	external_key?: unknown;
	type?: unknown;
	difficulty?: unknown;
	select?: unknown;
	stem?: unknown;
	explanation?: unknown;
	reference?: unknown;
	tags?: unknown;
	choices?: unknown;
}

export interface ValidatedChoice {
	text: string;
	correct: boolean;
	reasoning: string;
}

export interface ValidatedQuestion {
	domainCode: string;
	topic: string | null;
	externalKey: string | null;
	questionType: QuestionType;
	difficulty: Difficulty;
	selectCount: number;
	stem: string;
	explanation: string | null;
	reference: string | null;
	tags: string[];
	choices: ValidatedChoice[];
}

/** Mirrors scripts/import.py's validation rules exactly, so a question behaves the same way
 *  whether it comes from a JSONL upload, the local import script, or the admin CRUD form.
 *  Returns an error string, or the validated/normalized question on success. */
export function validateQuestion(
	raw: RawQuestion,
	domainCodes: Set<string>
): ValidatedQuestion | string {
	const domain = raw.domain;
	if (typeof domain !== 'string' || !domainCodes.has(domain)) {
		return `unknown domain code '${String(domain)}'`;
	}

	const type = raw.type;
	if (typeof type !== 'string' || !QUESTION_TYPES.has(type)) {
		return `bad question type '${String(type)}'`;
	}

	const difficulty = raw.difficulty;
	if (typeof difficulty !== 'string' || !DIFFICULTIES.has(difficulty)) {
		return `bad difficulty '${String(difficulty)}'`;
	}

	if (typeof raw.stem !== 'string' || raw.stem.trim() === '') {
		return 'missing stem';
	}

	const rawChoices = Array.isArray(raw.choices) ? raw.choices : [];
	if (rawChoices.length < 2) {
		return 'fewer than 2 choices';
	}

	const choices: ValidatedChoice[] = [];
	for (let i = 0; i < rawChoices.length; i++) {
		const choice = rawChoices[i] as RawChoice;
		if (typeof choice.text !== 'string' || choice.text.trim() === '') {
			return `choice ${i + 1}: missing text`;
		}
		if (typeof choice.reasoning !== 'string' || choice.reasoning.trim() === '') {
			return `choice ${i + 1}: missing reasoning`;
		}
		choices.push({
			text: choice.text,
			correct: Boolean(choice.correct),
			reasoning: choice.reasoning
		});
	}

	const correctCount = choices.filter((c) => c.correct).length;
	const selectCount = typeof raw.select === 'number' ? raw.select : 1;

	if (correctCount === 0) return 'no correct choice marked';
	if (correctCount !== selectCount) {
		return `select=${selectCount} but ${correctCount} choices marked correct`;
	}
	if (type === 'single_choice' && selectCount !== 1) return 'single_choice must have select=1';
	if (type === 'multiple_response' && selectCount < 2)
		return 'multiple_response must have select>=2';

	const externalKey =
		typeof raw.external_key === 'string' && raw.external_key.trim() !== ''
			? raw.external_key
			: null;
	const topic = typeof raw.topic === 'string' && raw.topic.trim() !== '' ? raw.topic : null;
	const explanation = typeof raw.explanation === 'string' ? raw.explanation : null;
	const reference = typeof raw.reference === 'string' ? raw.reference : null;
	const tags = Array.isArray(raw.tags)
		? raw.tags.filter((t): t is string => typeof t === 'string')
		: [];

	return {
		domainCode: domain,
		topic,
		externalKey,
		questionType: type as QuestionType,
		difficulty: difficulty as Difficulty,
		selectCount,
		stem: raw.stem,
		explanation,
		reference,
		tags,
		choices
	};
}
