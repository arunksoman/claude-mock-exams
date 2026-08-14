import { redirect } from '@sveltejs/kit';
import { dbClient, getCertMeta } from '$lib/server/db';
import { ADMIN_SESSION_COOKIE } from '$lib/server/adminAuth';
import type { Actions, PageServerLoad } from './$types';

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
	logout: async ({ cookies }) => {
		cookies.delete(ADMIN_SESSION_COOKIE, { path: '/admin' });
		redirect(303, '/admin/login');
	}
};
