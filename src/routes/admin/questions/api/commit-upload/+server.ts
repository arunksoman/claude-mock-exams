import { json, error } from '@sveltejs/kit';
import { dbClient } from '$lib/server/db';
import { getCertificationByCode, getDomains } from '$lib/server/queries';
import { parseAndValidateJsonl, writeValidatedQuestions } from '$lib/server/adminImport';
import type { RequestHandler } from './$types';

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/** Re-parses and re-validates the same file from scratch — never trusts a client-supplied
 *  "this batch was already validated" claim. The client just re-submits the same file it
 *  used for preview-upload once the admin confirms the review. */
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
	const domainIdByCode = new Map(domains.map((d) => [d.code, d.id]));

	const text = await file.text();
	const { validated, errors } = parseAndValidateJsonl(text, new Set(domainIdByCode.keys()));
	if (errors.length > 0) {
		return json({ created: 0, updated: 0, choicesWritten: 0, errors });
	}

	const result = await writeValidatedQuestions(
		dbClient,
		certification.id,
		domainIdByCode,
		validated
	);
	return json(result);
};
