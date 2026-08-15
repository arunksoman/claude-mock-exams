import { error } from '@sveltejs/kit';
import { getNotesSection } from '$lib/server/notesContent';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const section = getNotesSection('ccar-f', 'overview');
	if (!section) error(404, 'Notes overview not found');
	return { section };
};
