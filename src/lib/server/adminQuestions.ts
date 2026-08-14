import type { Client, Row } from '@libsql/client';
import type { Difficulty, QuestionType } from '$lib/types';
import { validateQuestion, type RawQuestion } from './questionValidation';
import { writeOneQuestion } from './adminImport';

export interface AdminCertification {
	id: number;
	code: string;
	name: string;
}

export interface QuestionListRow {
	id: number;
	externalKey: string | null;
	domainId: number;
	questionType: QuestionType;
	difficulty: Difficulty;
	selectCount: number;
	stem: string;
	status: string;
	updatedAt: string;
	choiceCount: number;
}

export interface QuestionChoiceDetail {
	id: number;
	text: string;
	correct: boolean;
	reasoning: string;
	sortOrder: number;
}

export interface QuestionDetail {
	id: number;
	domainId: number;
	domainCode: string;
	topic: string | null;
	externalKey: string | null;
	questionType: QuestionType;
	difficulty: Difficulty;
	selectCount: number;
	stem: string;
	explanation: string | null;
	reference: string | null;
	status: string;
	tags: string[];
	choices: QuestionChoiceDetail[];
}

/** Draft shape posted by the admin create/edit form — same fields validateQuestion() expects. */
export type QuestionDraft = RawQuestion;

function placeholders(n: number): string {
	return Array(n).fill('?').join(', ');
}

export async function listCertifications(client: Client): Promise<AdminCertification[]> {
	const rs = await client.execute('SELECT id, code, name FROM certifications ORDER BY code');
	return rs.rows.map((row) => ({
		id: row.id as number,
		code: row.code as string,
		name: row.name as string
	}));
}

export interface QuestionListFilter {
	certificationId: number;
	domainIds?: number[];
	difficulties?: Difficulty[];
	questionType?: QuestionType;
	search?: string;
	/** Keyset cursor — only rows with id greater than this are returned. */
	afterId?: number;
}

/** Paginated, bounded-column question listing — never the full bank, never full choices. */
export async function listQuestionsPage(
	client: Client,
	filter: QuestionListFilter,
	limit: number
): Promise<QuestionListRow[]> {
	const conditions = ['q.certification_id = ?'];
	const args: (string | number)[] = [filter.certificationId];

	if (filter.domainIds?.length) {
		conditions.push(`q.domain_id IN (${placeholders(filter.domainIds.length)})`);
		args.push(...filter.domainIds);
	}
	if (filter.difficulties?.length) {
		conditions.push(`q.difficulty IN (${placeholders(filter.difficulties.length)})`);
		args.push(...filter.difficulties);
	}
	if (filter.questionType) {
		conditions.push('q.question_type = ?');
		args.push(filter.questionType);
	}
	if (filter.search?.trim()) {
		conditions.push('(q.stem LIKE ? OR q.external_key LIKE ?)');
		const like = `%${filter.search.trim()}%`;
		args.push(like, like);
	}
	if (filter.afterId) {
		conditions.push('q.id > ?');
		args.push(filter.afterId);
	}

	args.push(limit);

	const rs = await client.execute({
		sql: `SELECT q.id, q.external_key, q.domain_id, q.question_type, q.difficulty, q.select_count,
		             q.stem, q.status, q.updated_at,
		             (SELECT COUNT(*) FROM choices c WHERE c.question_id = q.id) AS choice_count
		      FROM questions q
		      WHERE ${conditions.join(' AND ')}
		      ORDER BY q.id
		      LIMIT ?`,
		args
	});

	return rs.rows.map((row: Row) => ({
		id: row.id as number,
		externalKey: row.external_key as string | null,
		domainId: row.domain_id as number,
		questionType: row.question_type as QuestionType,
		difficulty: row.difficulty as Difficulty,
		selectCount: row.select_count as number,
		stem: row.stem as string,
		status: row.status as string,
		updatedAt: row.updated_at as string,
		choiceCount: row.choice_count as number
	}));
}

/** Full detail for one question (raw text, not rendered HTML — this is the editor, not the
 *  exam-delivery surface) — used by the side panel and the edit form. */
export async function getQuestionDetail(
	client: Client,
	id: number
): Promise<QuestionDetail | null> {
	const rs = await client.execute({
		sql: `SELECT q.id, q.domain_id, d.code AS domain_code, t.name AS topic_name, q.external_key,
		             q.question_type, q.difficulty, q.select_count, q.stem, q.explanation, q.reference,
		             q.status
		      FROM questions q
		      JOIN domains d ON d.id = q.domain_id
		      LEFT JOIN topics t ON t.id = q.topic_id
		      WHERE q.id = ?`,
		args: [id]
	});
	const row = rs.rows[0];
	if (!row) return null;

	const choicesRs = await client.execute({
		sql: `SELECT id, label, is_correct, reasoning, sort_order
		      FROM choices WHERE question_id = ? ORDER BY sort_order`,
		args: [id]
	});
	const tagsRs = await client.execute({
		sql: `SELECT tg.name FROM tags tg
		      JOIN question_tags qt ON qt.tag_id = tg.id
		      WHERE qt.question_id = ?`,
		args: [id]
	});

	return {
		id: row.id as number,
		domainId: row.domain_id as number,
		domainCode: row.domain_code as string,
		topic: (row.topic_name as string | null) ?? null,
		externalKey: row.external_key as string | null,
		questionType: row.question_type as QuestionType,
		difficulty: row.difficulty as Difficulty,
		selectCount: row.select_count as number,
		stem: row.stem as string,
		explanation: row.explanation as string | null,
		reference: row.reference as string | null,
		status: row.status as string,
		tags: tagsRs.rows.map((r) => r.name as string),
		choices: choicesRs.rows.map((r) => ({
			id: r.id as number,
			text: r.label as string,
			correct: Boolean(r.is_correct as number),
			reasoning: r.reasoning as string,
			sortOrder: r.sort_order as number
		}))
	};
}

/** Validates a draft against the given cert's domains, then inserts (existingId omitted) or
 *  updates in place (existingId given) in its own transaction. Returns the question id, or a
 *  validation error string. */
export async function saveQuestion(
	client: Client,
	certificationId: number,
	domainIdByCode: Map<string, number>,
	draft: QuestionDraft,
	existingId: number | null
): Promise<{ questionId: number } | { error: string }> {
	const result = validateQuestion(draft, new Set(domainIdByCode.keys()));
	if (typeof result === 'string') return { error: result };

	const tx = await client.transaction('write');
	try {
		const { questionId } = await writeOneQuestion(
			tx,
			certificationId,
			domainIdByCode,
			result,
			existingId
		);
		await tx.commit();
		return { questionId };
	} catch (e) {
		await tx.rollback();
		throw e;
	} finally {
		tx.close();
	}
}

export async function deleteQuestion(client: Client, id: number): Promise<void> {
	// choices / question_tags cascade via ON DELETE CASCADE (schema.sql)
	await client.execute({ sql: 'DELETE FROM questions WHERE id = ?', args: [id] });
}
