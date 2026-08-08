import { json, error } from '@sveltejs/kit';
import { dbClient, getCertMeta } from '$lib/server/db';
import { getQuestionsByIds } from '$lib/server/queries';
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

	const { certification, domains } = await getCertMeta();

	// Fetches only the exact question ids being graded (the ~53 the client says it was
	// shown), never the whole bank. Server re-derives correctness from its own DB for each
	// one — it never trusts what the client claims was correct.
	const questions = await getQuestionsByIds(dbClient, certification.id, questionIds);
	const questionById = new Map(questions.map((q) => [q.id, q]));

	const graded = questionIds
		.map((id) => questionById.get(id))
		.filter((q): q is NonNullable<typeof q> => q !== undefined)
		.map((q) => buildGradedQuestion(q, answers[String(q.id)] ?? []));

	const domainBreakdown = buildDomainBreakdown(graded, domains);
	const overall = buildOverallScore(graded, certification);

	const attempt: ExamAttempt = {
		id: body.attemptId,
		kind: 'exam',
		startedAt: typeof body.startedAt === 'number' ? body.startedAt : Date.now(),
		completedAt: Date.now(),
		durationMinutes:
			typeof body.durationMinutes === 'number'
				? body.durationMinutes
				: certification.examDurationMinutes,
		questions: graded,
		domainBreakdown,
		overall
	};

	return json(attempt);
};
