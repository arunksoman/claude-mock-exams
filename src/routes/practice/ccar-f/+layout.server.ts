import { getCertMeta } from '$lib/server/db';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async () => {
	const { certification, domains } = await getCertMeta('CCAR-F');
	return { certification, domains };
};
