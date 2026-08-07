import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';

const ALLOWED_TAGS = [
	'p',
	'br',
	'strong',
	'em',
	'code',
	'pre',
	'ul',
	'ol',
	'li',
	'blockquote',
	'a',
	'h1',
	'h2',
	'h3'
];

/**
 * Renders trusted, own-database markdown to sanitized HTML. Always run server-side —
 * callers must never forward raw markdown to the client and render it there.
 */
export function renderMarkdown(text: string, opts: { inline?: boolean } = {}): string {
	const raw = opts.inline
		? marked.parseInline(text, { async: false })
		: marked.parse(text, { async: false });
	return sanitizeHtml(raw as string, {
		allowedTags: ALLOWED_TAGS,
		allowedAttributes: { a: ['href'] },
		allowedSchemes: ['https', 'http']
	});
}

export function renderMarkdownInline(text: string): string {
	return renderMarkdown(text, { inline: true });
}
