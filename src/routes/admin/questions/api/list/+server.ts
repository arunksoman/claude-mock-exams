import { json, error } from '@sveltejs/kit';
import { dbClient } from '$lib/server/db';
import { getCertificationByCode } from '$lib/server/queries';
import { listQuestionsPage } from '$lib/server/adminQuestions';
import type { Difficulty, QuestionType } from '$lib/types';
import type { RequestHandler } from './$types';

const PAGE_SIZE = 50;

export const GET: RequestHandler = async ({ url }) => {
	const certCode = url.searchParams.get('cert');
	if (!certCode) error(400, 'cert is required');

	const certification = await getCertificationByCode(dbClient, certCode);

	const domainIds = url.searchParams
		.get('domain')
		?.split(',')
		.filter(Boolean)
		.map(Number)
		.filter((n) => Number.isFinite(n));
	const difficulties = url.searchParams.get('difficulty')?.split(',').filter(Boolean) as
		Difficulty[] | undefined;
	const questionType = (url.searchParams.get('type') as QuestionType | null) ?? undefined;
	const search = url.searchParams.get('q') ?? undefined;
	const afterIdParam = url.searchParams.get('afterId');
	const afterId = afterIdParam ? Number(afterIdParam) : undefined;

	const rows = await listQuestionsPage(
		dbClient,
		{
			certificationId: certification.id,
			domainIds: domainIds?.length ? domainIds : undefined,
			difficulties: difficulties?.length ? difficulties : undefined,
			questionType,
			search,
			afterId: afterId && Number.isFinite(afterId) ? afterId : undefined
		},
		PAGE_SIZE
	);

	return json({ rows });
};
