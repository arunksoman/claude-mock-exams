import { extractHeadings, renderNotesMarkdown, type HeadingEntry } from './notesMarkdown';
import { DOMAIN_ORDER, titleFor, weightFor } from '$lib/notes/domains';

export interface NotesSection {
	code: string;
	title: string;
	weight?: number;
	html: string;
	headings: HeadingEntry[];
}

const modules = import.meta.glob('$lib/notes/content/*.md', {
	query: '?raw',
	import: 'default',
	eager: true
}) as Record<string, string>;

const rawByCode = new Map<string, string>();
for (const [path, raw] of Object.entries(modules)) {
	const match = /([^/\\]+)\.md$/.exec(path);
	if (match) rawByCode.set(match[1], raw);
}

/** Renders one domain's markdown on demand — each notes page loads only its own section, not the whole bank. */
export function getNotesSection(code: string): NotesSection | undefined {
	if (!DOMAIN_ORDER.includes(code)) return undefined;
	const raw = rawByCode.get(code);
	if (!raw) return undefined;
	return {
		code,
		title: titleFor(code),
		weight: weightFor(code),
		html: renderNotesMarkdown(raw),
		headings: extractHeadings(raw)
	};
}
