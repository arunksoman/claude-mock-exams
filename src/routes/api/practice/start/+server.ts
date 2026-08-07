import { json } from '@sveltejs/kit';
import { getQuestionBank } from '$lib/server/db';
import { shuffle, shuffleQuestionChoices } from '$lib/shuffle';
import { DIFFICULTIES } from '$lib/constants';
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

	const bank = await getQuestionBank();

	let pool = bank.questions;
	if (domainIds.length > 0) pool = pool.filter((q) => domainIds.includes(q.domainId));
	if (difficulties.length > 0) pool = pool.filter((q) => difficulties.includes(q.difficulty));

	const shuffled = shuffle(pool);
	const requestedCount = body.count === 'all' ? shuffled.length : Number(body.count);
	const count = Math.max(
		1,
		Math.min(Number.isFinite(requestedCount) ? requestedCount : 20, shuffled.length)
	);
	// Source data lists the correct choice first (sort_order 0) — shuffle per-question so
	// answer position isn't a giveaway and repeat practice doesn't always show the same order.
	const questions = shuffled.slice(0, count).map(shuffleQuestionChoices);

	const config: PracticeConfig = { domainIds, difficulties, count: questions.length };

	return json({ config, questions });
};
