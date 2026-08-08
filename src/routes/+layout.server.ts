import { getCertMeta } from '$lib/server/db';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async () => {
	const { certification, domains } = await getCertMeta();
	return { certification, domains };
};
