import type { Client } from '@libsql/client';
import type {
	Certification,
	ChoiceFull,
	Difficulty,
	Domain,
	QuestionFull,
	QuestionType
} from '$lib/types';
import { renderMarkdownInline } from './markdown';

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

export async function getPublishedQuestionsWithChoices(
	client: Client,
	certificationId: number
): Promise<QuestionFull[]> {
	const [questionRows, choiceRows] = await Promise.all([
		client.execute({
			sql: `SELECT id, domain_id, question_type, difficulty, stem, select_count, explanation
			      FROM questions WHERE certification_id = ? AND status = 'published'`,
			args: [certificationId]
		}),
		client.execute({
			sql: `SELECT c.id, c.question_id, c.label, c.is_correct, c.reasoning, c.sort_order
			      FROM choices c
			      JOIN questions q ON q.id = c.question_id
			      WHERE q.certification_id = ? AND q.status = 'published'
			      ORDER BY c.question_id, c.sort_order`,
			args: [certificationId]
		})
	]);

	const choicesByQuestion = new Map<number, ChoiceFull[]>();
	for (const row of choiceRows.rows) {
		const questionId = row.question_id as number;
		const choice: ChoiceFull = {
			id: row.id as number,
			labelHtml: renderMarkdownInline(row.label as string),
			isCorrect: Boolean(row.is_correct as number),
			reasoningHtml: renderMarkdownInline(row.reasoning as string),
			sortOrder: row.sort_order as number
		};
		const list = choicesByQuestion.get(questionId);
		if (list) list.push(choice);
		else choicesByQuestion.set(questionId, [choice]);
	}

	return questionRows.rows.map((row) => {
		const id = row.id as number;
		const explanation = row.explanation as string | null;
		return {
			id,
			domainId: row.domain_id as number,
			questionType: row.question_type as QuestionType,
			difficulty: row.difficulty as Difficulty,
			stemHtml: renderMarkdownInline(row.stem as string),
			selectCount: row.select_count as number,
			explanationHtml: explanation ? renderMarkdownInline(explanation) : null,
			choices: choicesByQuestion.get(id) ?? []
		};
	});
}
