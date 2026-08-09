import type { Client, Transaction } from '@libsql/client';
import type { Difficulty, QuestionType } from '$lib/types';

const QUESTION_TYPES = new Set<string>(['single_choice', 'multiple_response', 'true_false']);
const DIFFICULTIES = new Set<string>(['easy', 'medium', 'intermediate', 'difficult']);

interface RawChoice {
	text?: unknown;
	correct?: unknown;
	reasoning?: unknown;
}

interface RawQuestion {
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

interface ValidatedChoice {
	text: string;
	correct: boolean;
	reasoning: string;
}

interface ValidatedQuestion {
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

/** Mirrors scripts/import.py's validation rules exactly, so a JSONL file behaves the same
 *  way whether it's imported locally or uploaded here. Returns an error string, or the
 *  validated/normalized question on success. */
function validateQuestion(raw: RawQuestion, domainCodes: Set<string>): ValidatedQuestion | string {
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

async function getOrCreateTopic(tx: Transaction, domainId: number, name: string): Promise<number> {
	const existing = await tx.execute({
		sql: 'SELECT id FROM topics WHERE domain_id = ? AND name = ?',
		args: [domainId, name]
	});
	if (existing.rows[0]) return existing.rows[0].id as number;
	const inserted = await tx.execute({
		sql: 'INSERT INTO topics (domain_id, name) VALUES (?, ?)',
		args: [domainId, name]
	});
	return Number(inserted.lastInsertRowid);
}

async function getOrCreateTag(tx: Transaction, name: string): Promise<number> {
	const existing = await tx.execute({ sql: 'SELECT id FROM tags WHERE name = ?', args: [name] });
	if (existing.rows[0]) return existing.rows[0].id as number;
	const inserted = await tx.execute({ sql: 'INSERT INTO tags (name) VALUES (?)', args: [name] });
	return Number(inserted.lastInsertRowid);
}

export interface ImportLineError {
	line: number;
	message: string;
}

export interface ImportResult {
	created: number;
	updated: number;
	choicesWritten: number;
	errors: ImportLineError[];
}

/**
 * Imports/updates questions from newline-delimited JSON (one question object per line, same
 * shape as data/ccdv-f/*.jsonl). Every line is parsed and validated up front using the same
 * rules as scripts/import.py; if ANY line fails, nothing is written at all — the whole file
 * is rejected with the full list of errors, so a partial/bad upload can never leave the bank
 * half-updated. Questions are upserted by `external_key` when present (the existing
 * question's fields and choices are replaced in place); questions without an external_key
 * are always inserted as new, matching the local import script's behavior. All writes for a
 * successful upload happen in a single transaction.
 */
export async function importQuestionsJsonl(
	client: Client,
	certificationId: number,
	domainIdByCode: Map<string, number>,
	text: string
): Promise<ImportResult> {
	const lines = text
		.split('\n')
		.map((l) => l.trim())
		.filter((l) => l.length > 0);

	const domainCodes = new Set(domainIdByCode.keys());
	const validated: { line: number; item: ValidatedQuestion }[] = [];
	const errors: ImportLineError[] = [];

	lines.forEach((line, i) => {
		const lineNo = i + 1;
		let raw: unknown;
		try {
			raw = JSON.parse(line);
		} catch (e) {
			errors.push({ line: lineNo, message: `invalid JSON: ${(e as Error).message}` });
			return;
		}
		const result = validateQuestion(raw as RawQuestion, domainCodes);
		if (typeof result === 'string') errors.push({ line: lineNo, message: result });
		else validated.push({ line: lineNo, item: result });
	});

	if (errors.length > 0) {
		return { created: 0, updated: 0, choicesWritten: 0, errors };
	}

	let created = 0;
	let updated = 0;
	let choicesWritten = 0;

	const tx = await client.transaction('write');
	try {
		for (const { item } of validated) {
			const domainId = domainIdByCode.get(item.domainCode)!;
			const topicId = item.topic ? await getOrCreateTopic(tx, domainId, item.topic) : null;

			let questionId: number;
			const existing = item.externalKey
				? await tx.execute({
						sql: 'SELECT id FROM questions WHERE external_key = ?',
						args: [item.externalKey]
					})
				: null;

			if (existing?.rows[0]) {
				questionId = existing.rows[0].id as number;
				await tx.execute({
					sql: `UPDATE questions
					      SET domain_id = ?, topic_id = ?, question_type = ?, difficulty = ?, stem = ?,
					          select_count = ?, explanation = ?, reference = ?, updated_at = datetime('now')
					      WHERE id = ?`,
					args: [
						domainId,
						topicId,
						item.questionType,
						item.difficulty,
						item.stem,
						item.selectCount,
						item.explanation,
						item.reference,
						questionId
					]
				});
				await tx.execute({ sql: 'DELETE FROM choices WHERE question_id = ?', args: [questionId] });
				updated++;
			} else {
				const inserted = await tx.execute({
					sql: `INSERT INTO questions
					      (certification_id, domain_id, topic_id, external_key, question_type, difficulty,
					       stem, select_count, explanation, reference)
					      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
					args: [
						certificationId,
						domainId,
						topicId,
						item.externalKey,
						item.questionType,
						item.difficulty,
						item.stem,
						item.selectCount,
						item.explanation,
						item.reference
					]
				});
				questionId = Number(inserted.lastInsertRowid);
				created++;
			}

			for (let order = 0; order < item.choices.length; order++) {
				const choice = item.choices[order];
				await tx.execute({
					sql: `INSERT INTO choices (question_id, label, is_correct, reasoning, sort_order)
					      VALUES (?, ?, ?, ?, ?)`,
					args: [questionId, choice.text, choice.correct ? 1 : 0, choice.reasoning, order]
				});
				choicesWritten++;
			}

			for (const tagName of item.tags) {
				const tagId = await getOrCreateTag(tx, tagName);
				await tx.execute({
					sql: 'INSERT OR IGNORE INTO question_tags (question_id, tag_id) VALUES (?, ?)',
					args: [questionId, tagId]
				});
			}
		}

		await tx.commit();
	} catch (e) {
		await tx.rollback();
		throw e;
	} finally {
		tx.close();
	}

	return { created, updated, choicesWritten, errors: [] };
}
