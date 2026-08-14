import { json, error } from '@sveltejs/kit';
import { dbClient } from '$lib/server/db';
import { getCertificationByCode, getDomains } from '$lib/server/queries';
import { parseAndValidateJsonl } from '$lib/server/adminImport';
import type { RequestHandler } from './$types';

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export const POST: RequestHandler = async ({ request }) => {
	const form = await request.formData();
	const file = form.get('file');
	const certCode = form.get('cert');

	if (!(file instanceof File) || file.size === 0) {
		return json({ error: 'Choose a .jsonl file first.' }, { status: 400 });
	}
	if (file.size > MAX_UPLOAD_BYTES) {
		return json({ error: 'File is too large (max 10MB).' }, { status: 400 });
	}
	if (typeof certCode !== 'string') {
		error(400, 'cert is required');
	}

	const certification = await getCertificationByCode(dbClient, certCode);
	const domains = await getDomains(dbClient, certification.id);
	const domainCodes = new Set(domains.map((d) => d.code));

	const text = await file.text();
	const { validated, errors } = parseAndValidateJsonl(text, domainCodes);

	return json({
		errors,
		count: validated.length,
		preview: validated.map(({ line, item }) => ({
			line,
			domainCode: item.domainCode,
			externalKey: item.externalKey,
			questionType: item.questionType,
			difficulty: item.difficulty,
			selectCount: item.selectCount,
			stem: item.stem,
			choiceCount: item.choices.length
		}))
	});
};
