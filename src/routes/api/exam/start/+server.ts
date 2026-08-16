import { json } from '@sveltejs/kit';
import { dbClient, getCertMeta } from '$lib/server/db';
import { sampleExamQuestions } from '$lib/server/examSampler';
import { shuffle } from '$lib/shuffle';
import { DEFAULT_CERT_CODE } from '$lib/constants';
import type { QuestionPublic } from '$lib/types';
import type { RequestHandler } from './$types';

interface RequestBody {
	cert?: unknown;
}

export const POST: RequestHandler = async ({ request }) => {
	// Body is optional — CCDV-F's exam-start call may not send one; absent/empty falls back to
	// the default cert, same as before this endpoint accepted a cert param at all.
	const body = (await request.json().catch(() => ({}))) as RequestBody;
	const certCode = typeof body.cert === 'string' ? body.cert : DEFAULT_CERT_CODE;

	const { certification, domains } = await getCertMeta(certCode);
	const sampled = await sampleExamQuestions(dbClient, certification, domains);

	// Field-level allowlist: is_correct/reasoning/sortOrder are never selected into this shape
	// at all, so they're structurally absent from the response — not just hidden by the UI.
	// sortOrder matters here because source data lists the correct choice at sort_order 0, so
	// even with array order shuffled, exposing that field would still leak the answer.
	const questions: QuestionPublic[] = sampled.map((q) => ({
		id: q.id,
		domainId: q.domainId,
		questionType: q.questionType,
		selectCount: q.selectCount,
		stemHtml: q.stemHtml,
		choices: shuffle(q.choices.map((c) => ({ id: c.id, labelHtml: c.labelHtml })))
	}));

	return json({
		attemptId: crypto.randomUUID(),
		startedAt: Date.now(),
		durationMinutes: certification.examDurationMinutes,
		questions
	});
};
