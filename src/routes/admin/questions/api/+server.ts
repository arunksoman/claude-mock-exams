import { json, error } from '@sveltejs/kit';
import { dbClient } from '$lib/server/db';
import { getCertificationByCode, getDomains } from '$lib/server/queries';
import { saveQuestion, type QuestionDraft } from '$lib/server/adminQuestions';
import type { RequestHandler } from './$types';

interface CreateBody {
	certCode?: unknown;
	draft?: QuestionDraft;
}

export const POST: RequestHandler = async ({ request }) => {
	const body = (await request.json()) as CreateBody;
	if (typeof body.certCode !== 'string' || !body.draft) {
		error(400, 'certCode and draft are required');
	}

	const certification = await getCertificationByCode(dbClient, body.certCode);
	const domains = await getDomains(dbClient, certification.id);
	const domainIdByCode = new Map(domains.map((d) => [d.code, d.id]));

	const result = await saveQuestion(dbClient, certification.id, domainIdByCode, body.draft, null);
	if ('error' in result) return json({ error: result.error }, { status: 400 });
	return json(result, { status: 201 });
};
