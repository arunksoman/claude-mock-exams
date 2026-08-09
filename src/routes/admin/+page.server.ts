import { fail, redirect } from '@sveltejs/kit';
import { dbClient, getCertMeta } from '$lib/server/db';
import { importQuestionsJsonl } from '$lib/server/adminImport';
import { ADMIN_SESSION_COOKIE } from '$lib/server/adminAuth';
import type { Actions, PageServerLoad } from './$types';

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10MB — generous for a text JSONL file, cheap DoS guard

export const load: PageServerLoad = async () => {
	const { certification, domains } = await getCertMeta();

	const rs = await dbClient.execute({
		sql: `SELECT d.name AS domain, COUNT(*) AS n
		      FROM questions q
		      JOIN domains d ON d.id = q.domain_id
		      WHERE q.certification_id = ? AND q.status = 'published'
		      GROUP BY d.id
		      ORDER BY d.sort_order`,
		args: [certification.id]
	});
	const domainCounts = rs.rows.map((row) => ({
		domain: row.domain as string,
		count: row.n as number
	}));
	const totalQuestions = domainCounts.reduce((sum, d) => sum + d.count, 0);

	return { certification, domains, domainCounts, totalQuestions };
};

export const actions: Actions = {
	upload: async ({ request }) => {
		const form = await request.formData();
		const file = form.get('file');

		if (!(file instanceof File) || file.size === 0) {
			return fail(400, { uploadError: 'Choose a .jsonl file first.' });
		}
		if (file.size > MAX_UPLOAD_BYTES) {
			return fail(400, { uploadError: 'File is too large (max 10MB).' });
		}

		const text = await file.text();
		const { certification, domains } = await getCertMeta();
		const domainIdByCode = new Map(domains.map((d) => [d.code, d.id]));

		const result = await importQuestionsJsonl(dbClient, certification.id, domainIdByCode, text);
		return { uploadResult: result };
	},

	logout: async ({ cookies }) => {
		cookies.delete(ADMIN_SESSION_COOKIE, { path: '/admin' });
		redirect(303, '/admin/login');
	}
};
