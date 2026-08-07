import { json, error } from '@sveltejs/kit';
import { getQuestionBank } from '$lib/server/db';
import { buildDomainBreakdown, buildGradedQuestion, buildOverallScore } from '$lib/scoring';
import type { ExamAttempt } from '$lib/types';
import type { RequestHandler } from './$types';

interface RequestBody {
	attemptId?: unknown;
	startedAt?: unknown;
	durationMinutes?: unknown;
	questionIds?: unknown;
	answers?: unknown;
}

export const POST: RequestHandler = async ({ request }) => {
	const body = (await request.json()) as RequestBody;

	if (typeof body.attemptId !== 'string' || !Array.isArray(body.questionIds)) {
		throw error(400, 'Malformed exam submission');
	}

	const questionIds = body.questionIds.filter((id): id is number => typeof id === 'number');
	const answers = (body.answers ?? {}) as Record<string, number[]>;

	const bank = await getQuestionBank();
	const questionById = new Map(bank.questions.map((q) => [q.id, q]));

	// Server re-derives correctness from its own DB for every question id the client claims
	// it was shown — it never trusts what the client says was correct.
	const graded = questionIds
		.map((id) => questionById.get(id))
		.filter((q): q is NonNullable<typeof q> => q !== undefined)
		.map((q) => buildGradedQuestion(q, answers[String(q.id)] ?? []));

	const domainBreakdown = buildDomainBreakdown(graded, bank.domains);
	const overall = buildOverallScore(graded, bank.certification);

	const attempt: ExamAttempt = {
		id: body.attemptId,
		kind: 'exam',
		startedAt: typeof body.startedAt === 'number' ? body.startedAt : Date.now(),
		completedAt: Date.now(),
		durationMinutes:
			typeof body.durationMinutes === 'number'
				? body.durationMinutes
				: bank.certification.examDurationMinutes,
		questions: graded,
		domainBreakdown,
		overall
	};

	return json(attempt);
};
