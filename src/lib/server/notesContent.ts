import { extractHeadings, renderNotesMarkdown, type HeadingEntry } from './notesMarkdown';
import { DOMAIN_ORDER, titleFor, weightFor } from '$lib/notes/domains';

export interface NotesSection {
	code: string;
	title: string;
	weight?: number;
	html: string;
	headings: HeadingEntry[];
}

const modules = import.meta.glob('$lib/notes/content/ccdv-f/*.md', {
	query: '?raw',
	import: 'default',
	eager: true
}) as Record<string, string>;

const rawByCode = new Map<string, string>();
for (const [path, raw] of Object.entries(modules)) {
	const match = /([^/\\]+)\.md$/.exec(path);
	if (match) rawByCode.set(match[1], raw);
}

// The raw .md text never changes at runtime (it's baked into the server bundle at build time),
// but rendering it — marked + KaTeX + highlight.js, all synchronous — is real CPU work that was
// previously repeated on every single request to the same page. Cache the rendered result per
// code so a warm serverless instance only pays that cost once, not on every hit. Same pattern as
// getCertMeta() in $lib/server/db.ts.
const sectionCache = new Map<string, NotesSection>();

/** Renders (and caches) one domain's markdown on demand — each notes page loads only its own section, not the whole bank. */
export function getNotesSection(code: string): NotesSection | undefined {
	if (!DOMAIN_ORDER.includes(code)) return undefined;

	const cached = sectionCache.get(code);
	if (cached) return cached;

	const raw = rawByCode.get(code);
	if (!raw) return undefined;

	const section: NotesSection = {
		code,
		title: titleFor(code),
		weight: weightFor(code),
		html: renderNotesMarkdown(raw),
		headings: extractHeadings(raw)
	};
	sectionCache.set(code, section);
	return section;
}
