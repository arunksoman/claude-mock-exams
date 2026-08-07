import { getQuestionBank } from '$lib/server/db';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async () => {
	const bank = await getQuestionBank();
	return {
		certification: bank.certification,
		domains: bank.domains
	};
};
