import type { Client, Row } from '@libsql/client';
import type {
	Certification,
	ChoiceFull,
	Difficulty,
	Domain,
	QuestionFull,
	QuestionType
} from '$lib/types';
import { renderMarkdownInline } from './markdown';

function placeholders(n: number): string {
	return Array(n).fill('?').join(', ');
}

export async function getCertificationByCode(client: Client, code: string): Promise<Certification> {
	const rs = await client.execute({
		sql: `SELECT id, code, name, exam_question_count, exam_duration_minutes, passing_score, max_score
		      FROM certifications WHERE code = ?`,
		args: [code]
	});
	const row = rs.rows[0];
	if (!row) throw new Error(`Certification not found: ${code}`);
	return {
		id: row.id as number,
		code: row.code as string,
		name: row.name as string,
		examQuestionCount: row.exam_question_count as number,
		examDurationMinutes: row.exam_duration_minutes as number,
		passingScore: row.passing_score as number,
		maxScore: row.max_score as number
	};
}

export async function getDomains(client: Client, certificationId: number): Promise<Domain[]> {
	const rs = await client.execute({
		sql: `SELECT id, code, name, weight_percentage, sort_order
		      FROM domains WHERE certification_id = ? ORDER BY sort_order`,
		args: [certificationId]
	});
	return rs.rows.map((row) => ({
		id: row.id as number,
		code: row.code as string,
		name: row.name as string,
		weightPercentage: row.weight_percentage as number,
		sortOrder: row.sort_order as number
	}));
}

/** Per-domain published-question counts by difficulty — used by examSampler.ts to weight its
 *  difficulty sub-allocation by what's actually in the bank, rather than a fixed constant. */
export async function getDomainDifficultyCounts(
	client: Client,
	certificationId: number
): Promise<Map<number, Map<Difficulty, number>>> {
	const rs = await client.execute({
		sql: `SELECT domain_id, difficulty, COUNT(*) as n
		      FROM questions
		      WHERE certification_id = ? AND status = 'published'
		      GROUP BY domain_id, difficulty`,
		args: [certificationId]
	});
	const result = new Map<number, Map<Difficulty, number>>();
	for (const row of rs.rows) {
		const domainId = row.domain_id as number;
		const difficulty = row.difficulty as Difficulty;
		const inner = result.get(domainId) ?? new Map<Difficulty, number>();
		inner.set(difficulty, row.n as number);
		result.set(domainId, inner);
	}
	return result;
}

export function mapQuestionRow(row: Row): Omit<QuestionFull, 'choices'> {
	const explanation = row.explanation as string | null;
	return {
		id: row.id as number,
		domainId: row.domain_id as number,
		questionType: row.question_type as QuestionType,
		difficulty: row.difficulty as Difficulty,
		stemHtml: renderMarkdownInline(row.stem as string),
		selectCount: row.select_count as number,
		explanationHtml: explanation ? renderMarkdownInline(explanation) : null
	};
}

function mapChoiceRow(row: Row): ChoiceFull {
	return {
		id: row.id as number,
		labelHtml: renderMarkdownInline(row.label as string),
		isCorrect: Boolean(row.is_correct as number),
		reasoningHtml: renderMarkdownInline(row.reasoning as string),
		sortOrder: row.sort_order as number
	};
}

/** Fetches choices for exactly the given question ids — never the whole `choices` table. */
export async function getChoicesForQuestionIds(
	client: Client,
	questionIds: number[]
): Promise<Map<number, ChoiceFull[]>> {
	const map = new Map<number, ChoiceFull[]>();
	if (questionIds.length === 0) return map;

	const rs = await client.execute({
		sql: `SELECT id, question_id, label, is_correct, reasoning, sort_order
		      FROM choices
		      WHERE question_id IN (${placeholders(questionIds.length)})
		      ORDER BY question_id, sort_order`,
		args: questionIds
	});
	for (const row of rs.rows) {
		const questionId = row.question_id as number;
		const choice = mapChoiceRow(row);
		const list = map.get(questionId);
		if (list) list.push(choice);
		else map.set(questionId, [choice]);
	}
	return map;
}

export interface SampleFilter {
	certificationId: number;
	domainIds?: number[];
	difficulties?: Difficulty[];
	/** Question ids to exclude — used for backfill draws so they don't repeat prior picks. */
	excludeIds?: number[];
}

/** Builds the `ORDER BY RANDOM() LIMIT n` statement for one sampling draw, without executing
 *  it — exported so examSampler.ts can batch several of these into a single round trip. */
export function buildSampleStatement(
	filter: SampleFilter,
	limit: number
): { sql: string; args: (string | number)[] } {
	const conditions = ['certification_id = ?', "status = 'published'"];
	const args: (string | number)[] = [filter.certificationId];

	if (filter.domainIds?.length) {
		conditions.push(`domain_id IN (${placeholders(filter.domainIds.length)})`);
		args.push(...filter.domainIds);
	}
	if (filter.difficulties?.length) {
		conditions.push(`difficulty IN (${placeholders(filter.difficulties.length)})`);
		args.push(...filter.difficulties);
	}
	if (filter.excludeIds?.length) {
		conditions.push(`id NOT IN (${placeholders(filter.excludeIds.length)})`);
		args.push(...filter.excludeIds);
	}

	args.push(limit);

	return {
		sql: `SELECT id, domain_id, question_type, difficulty, stem, select_count, explanation
		      FROM questions
		      WHERE ${conditions.join(' AND ')}
		      ORDER BY RANDOM()
		      LIMIT ?`,
		args
	};
}

/** Randomly samples up to `limit` questions (with their choices) matching `filter`, entirely
 *  in SQL — never loads more of the `questions`/`choices` tables than what's returned. */
export async function sampleQuestions(
	client: Client,
	filter: SampleFilter,
	limit: number
): Promise<QuestionFull[]> {
	if (limit <= 0) return [];
	const rs = await client.execute(buildSampleStatement(filter, limit));
	const rows = rs.rows.map(mapQuestionRow);
	if (rows.length === 0) return [];

	const choicesByQuestion = await getChoicesForQuestionIds(
		client,
		rows.map((r) => r.id)
	);
	return rows.map((r) => ({ ...r, choices: choicesByQuestion.get(r.id) ?? [] }));
}

/** Fetches exactly the given question ids (with choices) — used to re-derive correctness for
 *  an exam submission without touching any question the client wasn't actually shown. */
export async function getQuestionsByIds(
	client: Client,
	certificationId: number,
	questionIds: number[]
): Promise<QuestionFull[]> {
	if (questionIds.length === 0) return [];

	const rs = await client.execute({
		sql: `SELECT id, domain_id, question_type, difficulty, stem, select_count, explanation
		      FROM questions
		      WHERE certification_id = ? AND id IN (${placeholders(questionIds.length)})`,
		args: [certificationId, ...questionIds]
	});
	const rows = rs.rows.map(mapQuestionRow);
	if (rows.length === 0) return [];

	const choicesByQuestion = await getChoicesForQuestionIds(client, questionIds);
	return rows.map((r) => ({ ...r, choices: choicesByQuestion.get(r.id) ?? [] }));
}
