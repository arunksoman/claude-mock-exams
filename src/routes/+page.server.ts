import { getCertMeta } from '$lib/server/db';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const [ccdvf, ccarf] = await Promise.all([getCertMeta('CCDV-F'), getCertMeta('CCAR-F')]);
	return { ccdvf: ccdvf.certification, ccarf: ccarf.certification };
};
