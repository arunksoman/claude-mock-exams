import type { Client, Transaction } from '@libsql/client';
import { validateQuestion, type ValidatedQuestion } from './questionValidation';

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

/**
 * Writes one validated question (insert or, if `existingId` is given, update-in-place) plus its
 * topic/choices/tags, inside an already-open transaction. Shared by the bulk JSONL import/commit
 * path and single-question admin CRUD, so there is exactly one place that knows how a question
 * is written to the DB.
 */
export async function writeOneQuestion(
	tx: Transaction,
	certificationId: number,
	domainIdByCode: Map<string, number>,
	item: ValidatedQuestion,
	existingId: number | null
): Promise<{ questionId: number; created: boolean }> {
	const domainId = domainIdByCode.get(item.domainCode)!;
	const topicId = item.topic ? await getOrCreateTopic(tx, domainId, item.topic) : null;

	let questionId: number;
	let created: boolean;

	if (existingId !== null) {
		questionId = existingId;
		await tx.execute({
			sql: `UPDATE questions
			      SET domain_id = ?, topic_id = ?, external_key = ?, question_type = ?, difficulty = ?,
			          stem = ?, select_count = ?, explanation = ?, reference = ?, updated_at = datetime('now')
			      WHERE id = ?`,
			args: [
				domainId,
				topicId,
				item.externalKey,
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
		await tx.execute({
			sql: 'DELETE FROM question_tags WHERE question_id = ?',
			args: [questionId]
		});
		created = false;
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
		created = true;
	}

	for (let order = 0; order < item.choices.length; order++) {
		const choice = item.choices[order];
		await tx.execute({
			sql: `INSERT INTO choices (question_id, label, is_correct, reasoning, sort_order)
			      VALUES (?, ?, ?, ?, ?)`,
			args: [questionId, choice.text, choice.correct ? 1 : 0, choice.reasoning, order]
		});
	}

	for (const tagName of item.tags) {
		const tagId = await getOrCreateTag(tx, tagName);
		await tx.execute({
			sql: 'INSERT OR IGNORE INTO question_tags (question_id, tag_id) VALUES (?, ?)',
			args: [questionId, tagId]
		});
	}

	return { questionId, created };
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

/** Parses newline-delimited JSON (one question object per line) and validates every line
 *  up front using the same rules as scripts/import.py — no DB access. Used both by the
 *  one-shot import path and the admin "preview upload" step (parse+validate, review, then
 *  commit separately). */
export function parseAndValidateJsonl(
	text: string,
	domainCodes: Set<string>
): { validated: { line: number; item: ValidatedQuestion }[]; errors: ImportLineError[] } {
	const lines = text
		.split('\n')
		.map((l) => l.trim())
		.filter((l) => l.length > 0);

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
		const result = validateQuestion(raw as Parameters<typeof validateQuestion>[0], domainCodes);
		if (typeof result === 'string') errors.push({ line: lineNo, message: result });
		else validated.push({ line: lineNo, item: result });
	});

	return { validated, errors };
}

/**
 * Writes an already-validated batch in a single transaction — all-or-nothing. Questions are
 * upserted by `external_key` when present (existing question's fields and choices are replaced
 * in place); questions without an external_key are always inserted as new, matching
 * scripts/import.py's behavior. Shared by the one-shot JSONL import and the admin "commit
 * upload" step (preview first, then commit the reviewed batch).
 */
export async function writeValidatedQuestions(
	client: Client,
	certificationId: number,
	domainIdByCode: Map<string, number>,
	validated: { line: number; item: ValidatedQuestion }[]
): Promise<ImportResult> {
	let created = 0;
	let updated = 0;
	let choicesWritten = 0;

	const tx = await client.transaction('write');
	try {
		for (const { item } of validated) {
			const existing = item.externalKey
				? await tx.execute({
						sql: 'SELECT id FROM questions WHERE external_key = ?',
						args: [item.externalKey]
					})
				: null;
			const existingId = existing?.rows[0] ? (existing.rows[0].id as number) : null;

			const result = await writeOneQuestion(tx, certificationId, domainIdByCode, item, existingId);
			if (result.created) created++;
			else updated++;
			choicesWritten += item.choices.length;
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

/**
 * Imports/updates questions from newline-delimited JSON in one shot: parse, validate every
 * line, and — only if every line is valid — write the whole batch in a single transaction. If
 * any line fails, nothing is written at all.
 */
export async function importQuestionsJsonl(
	client: Client,
	certificationId: number,
	domainIdByCode: Map<string, number>,
	text: string
): Promise<ImportResult> {
	const { validated, errors } = parseAndValidateJsonl(text, new Set(domainIdByCode.keys()));
	if (errors.length > 0) {
		return { created: 0, updated: 0, choicesWritten: 0, errors };
	}
	return writeValidatedQuestions(client, certificationId, domainIdByCode, validated);
}
