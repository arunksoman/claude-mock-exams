import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

/** The dashboard/stats screen was dropped — questions management is what admins actually
 *  want on login, so /admin just forwards straight there. */
export const load: PageServerLoad = async () => {
	redirect(307, '/admin/questions');
};
