import { json, error } from '@sveltejs/kit';
import { dbClient } from '$lib/server/db';
import { getCertificationByCode, getDomains } from '$lib/server/queries';
import {
	getQuestionDetail,
	saveQuestion,
	deleteQuestion,
	type QuestionDraft
} from '$lib/server/adminQuestions';
import type { RequestHandler } from './$types';

function parseId(param: string | undefined): number {
	const id = Number(param);
	if (!Number.isFinite(id)) error(400, 'bad id');
	return id;
}

export const GET: RequestHandler = async ({ params }) => {
	const id = parseId(params.id);
	const detail = await getQuestionDetail(dbClient, id);
	if (!detail) error(404, 'question not found');
	return json(detail);
};

interface UpdateBody {
	certCode?: unknown;
	draft?: QuestionDraft;
}

export const PATCH: RequestHandler = async ({ params, request }) => {
	const id = parseId(params.id);
	const body = (await request.json()) as UpdateBody;
	if (typeof body.certCode !== 'string' || !body.draft) {
		error(400, 'certCode and draft are required');
	}

	const certification = await getCertificationByCode(dbClient, body.certCode);
	const domains = await getDomains(dbClient, certification.id);
	const domainIdByCode = new Map(domains.map((d) => [d.code, d.id]));

	const result = await saveQuestion(dbClient, certification.id, domainIdByCode, body.draft, id);
	if ('error' in result) return json({ error: result.error }, { status: 400 });
	return json(result);
};

export const DELETE: RequestHandler = async ({ params }) => {
	const id = parseId(params.id);
	await deleteQuestion(dbClient, id);
	return json({ ok: true });
};
