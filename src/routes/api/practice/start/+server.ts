import { json } from '@sveltejs/kit';
import { dbClient, getCertMeta } from '$lib/server/db';
import { sampleQuestions } from '$lib/server/queries';
import { shuffleQuestionChoices } from '$lib/shuffle';
import { DIFFICULTIES, PRACTICE_MAX_COUNT } from '$lib/constants';
import type { Difficulty, PracticeConfig } from '$lib/types';
import type { RequestHandler } from './$types';

interface RequestBody {
	domainIds?: unknown;
	difficulties?: unknown;
	count?: unknown;
}

export const POST: RequestHandler = async ({ request }) => {
	const body = (await request.json()) as RequestBody;

	const domainIds = Array.isArray(body.domainIds)
		? body.domainIds.filter((id): id is number => typeof id === 'number')
		: [];
	const difficulties = Array.isArray(body.difficulties)
		? body.difficulties.filter((d): d is Difficulty => DIFFICULTIES.includes(d as Difficulty))
		: [];

	const { certification } = await getCertMeta();

	const requestedCount = Number(body.count);
	// Clamped server-side too — never trust the client's count, even though the UI only
	// offers presets up to PRACTICE_MAX_COUNT.
	const limit = Math.min(
		PRACTICE_MAX_COUNT,
		Math.max(1, Number.isFinite(requestedCount) ? requestedCount : 20)
	);

	// Sampling happens entirely in SQL (ORDER BY RANDOM() LIMIT, filtered by domain/difficulty)
	// — never loads the full question bank into memory, so cost scales with what's requested,
	// not with total bank size.
	const sampled = await sampleQuestions(
		dbClient,
		{ certificationId: certification.id, domainIds, difficulties },
		limit
	);

	// Source data lists the correct choice first (sort_order 0) — shuffle per-question so
	// answer position isn't a giveaway and repeat practice doesn't always show the same order.
	const questions = sampled.map(shuffleQuestionChoices);

	const config: PracticeConfig = { domainIds, difficulties, count: questions.length };

	return json({ config, questions });
};
