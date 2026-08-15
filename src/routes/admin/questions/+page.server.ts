import { redirect } from '@sveltejs/kit';
import { dbClient } from '$lib/server/db';
import { getDomains } from '$lib/server/queries';
import { listCertifications, listQuestionsPage } from '$lib/server/adminQuestions';
import { ADMIN_SESSION_COOKIE } from '$lib/server/adminAuth';
import type { Actions, PageServerLoad } from './$types';

const PAGE_SIZE = 50;

export const load: PageServerLoad = async ({ url }) => {
	const certifications = await listCertifications(dbClient);
	const certParam = url.searchParams.get('cert');
	const activeCert = certifications.find((c) => c.code === certParam) ?? certifications[0] ?? null;

	const domains = activeCert ? await getDomains(dbClient, activeCert.id) : [];
	const rows = activeCert
		? await listQuestionsPage(dbClient, { certificationId: activeCert.id }, PAGE_SIZE)
		: [];

	return { certifications, activeCert, domains, rows, pageSize: PAGE_SIZE };
};

export const actions: Actions = {
	logout: async ({ cookies }) => {
		cookies.delete(ADMIN_SESSION_COOKIE, { path: '/admin' });
		redirect(303, '/admin/login');
	}
};
