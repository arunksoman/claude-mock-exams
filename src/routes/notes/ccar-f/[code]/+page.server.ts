import { error } from '@sveltejs/kit';
import { getNotesSection } from '$lib/server/notesContent';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	if (params.code === 'overview') error(404, 'Not found');
	const section = getNotesSection('ccar-f', params.code);
	if (!section) error(404, 'Notes section not found');
	return { section };
};
