import { getCertMeta } from '$lib/server/db';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const { certification, domains } = await getCertMeta('CCAR-F');
	return { certification, domains };
};
