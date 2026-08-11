import { Marked, type Tokens, type TokenizerAndRendererExtension } from 'marked';
import katex from 'katex';
import hljs from 'highlight.js';

/**
 * Renders study-notes markdown. Unlike $lib/server/markdown.ts (question bank
 * content, sanitized because it flows through the admin upload path), notes
 * content is static and repo-authored only — sanitize-html isn't run here
 * because KaTeX/mermaid/YouTube-embed output would fight its allowlist for no
 * safety benefit (nothing here is ever user-submitted).
 */

function escapeHtml(s: string): string {
	return s
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

function cellAlign(align: 'center' | 'left' | 'right' | null): string {
	return align ? ` style="text-align:${align}"` : '';
}

const YOUTUBE_ID_RE = /^[a-zA-Z0-9_-]{6,20}$/;

export interface HeadingEntry {
	depth: number;
	text: string;
	slug: string;
}

/** Reset per file so anchor ids stay stable and collision-free within one document. */
function makeSlugger() {
	const seen = new Map<string, number>();
	return (text: string): string => {
		const base =
			text
				.toLowerCase()
				.replace(/[`*_~]/g, '')
				.replace(/[^a-z0-9\s-]/g, '')
				.trim()
				.replace(/\s+/g, '-') || 'section';
		const n = seen.get(base) ?? 0;
		seen.set(base, n + 1);
		return n === 0 ? base : `${base}-${n}`;
	};
}

const blockMath: TokenizerAndRendererExtension = {
	name: 'blockMath',
	level: 'block',
	start(src) {
		return src.match(/\$\$/)?.index;
	},
	tokenizer(src) {
		const match = /^\$\$\n?([\s\S]+?)\n?\$\$(?:\n|$)/.exec(src);
		if (match) {
			return { type: 'blockMath', raw: match[0], text: match[1].trim() };
		}
	},
	renderer(token) {
		const rendered = katex.renderToString(token.text, {
			throwOnError: false,
			displayMode: true,
			output: 'html'
		});
		return `<div class="katex-block">${rendered}</div>\n`;
	}
};

const inlineMath: TokenizerAndRendererExtension = {
	name: 'inlineMath',
	level: 'inline',
	start(src) {
		return src.match(/\$[^\s$]/)?.index;
	},
	tokenizer(src) {
		const match = /^\$([^$\n]+?)\$/.exec(src);
		if (match) {
			return { type: 'inlineMath', raw: match[0], text: match[1].trim() };
		}
	},
	renderer(token) {
		return katex.renderToString(token.text, { throwOnError: false, output: 'html' });
	}
};

const youtubeEmbed: TokenizerAndRendererExtension = {
	name: 'youtubeEmbed',
	level: 'block',
	start(src) {
		return src.match(/\{\{youtube:/)?.index;
	},
	tokenizer(src) {
		const match = /^\{\{youtube:([a-zA-Z0-9_-]{6,20})\|([^{}\n]+)\}\}\n?/.exec(src);
		if (match && YOUTUBE_ID_RE.test(match[1])) {
			return { type: 'youtubeEmbed', raw: match[0], id: match[1], title: match[2].trim() };
		}
	},
	renderer(token) {
		const t = token as unknown as { id: string; title: string };
		const title = escapeHtml(t.title);
		return `<figure class="yt-embed"><div class="yt-frame"><iframe
			src="https://www.youtube-nocookie.com/embed/${t.id}"
			title="${title}"
			loading="lazy"
			referrerpolicy="strict-origin-when-cross-origin"
			allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
			allowfullscreen
		></iframe></div><figcaption>${title}</figcaption></figure>\n`;
	}
};

const glossaryTerm: TokenizerAndRendererExtension = {
	name: 'glossaryTerm',
	level: 'inline',
	start(src) {
		const idx = src.search(/\{\{(?!youtube:)/);
		return idx < 0 ? undefined : idx;
	},
	tokenizer(src) {
		const match = /^\{\{([^|{}]+)\|([^{}]+)\}\}/.exec(src);
		if (match) {
			return { type: 'glossaryTerm', raw: match[0], term: match[1].trim(), def: match[2].trim() };
		}
	},
	renderer(token) {
		const t = token as unknown as { term: string; def: string };
		return `<dfn class="term" tabindex="0" data-def="${escapeHtml(t.def)}">${escapeHtml(t.term)}</dfn>`;
	}
};

export function createNotesMarked() {
	const instance = new Marked({
		extensions: [blockMath, inlineMath, youtubeEmbed, glossaryTerm]
	});

	const slugger = { current: makeSlugger() };

	instance.use({
		renderer: {
			heading({ tokens, depth }: Tokens.Heading) {
				const text = this.parser.parseInline(tokens);
				const plain = tokens.map((t) => ('text' in t ? t.text : '')).join('');
				const slug = slugger.current(plain);
				return `<h${depth} id="${slug}">${text}</h${depth}>\n`;
			},
			code({ text, lang }: Tokens.Code) {
				const language = (lang ?? '').trim().split(/\s+/)[0];
				if (language === 'mermaid') {
					return `<pre class="mermaid" data-src="${escapeHtml(text)}">${escapeHtml(text)}</pre>\n`;
				}
				// hljs.highlightAuto() tries every registered grammar to guess a language — expensive,
				// and pointless for untagged blocks here (mostly directory trees / plain output, not
				// real code to guess at). Treat untagged fences as plaintext instead: faster and it
				// doesn't mis-color file paths as some random language.
				const validLang = language && hljs.getLanguage(language) ? language : 'plaintext';
				const highlighted = hljs.highlight(text, { language: validLang }).value;
				const langClass = validLang !== 'plaintext' ? ` language-${validLang}` : '';
				return `<pre class="hljs-block"><code class="hljs${langClass}">${highlighted}</code></pre>\n`;
			},
			table({ header, rows }: Tokens.Table) {
				const headHtml = header
					.map((cell) => `<th${cellAlign(cell.align)}>${this.parser.parseInline(cell.tokens)}</th>`)
					.join('');
				const bodyHtml = rows
					.map(
						(row) =>
							`<tr>${row
								.map((cell) => `<td${cellAlign(cell.align)}>${this.parser.parseInline(cell.tokens)}</td>`)
								.join('')}</tr>`
					)
					.join('');
				return `<div class="table-scroll"><table><thead><tr>${headHtml}</tr></thead><tbody>${bodyHtml}</tbody></table></div>\n`;
			},
			link({ href, title, tokens }: Tokens.Link) {
				const text = this.parser.parseInline(tokens);
				const external = /^https?:\/\//.test(href);
				const titleAttr = title ? ` title="${escapeHtml(title)}"` : '';
				const externalAttrs = external ? ' target="_blank" rel="noopener noreferrer"' : '';
				return `<a href="${escapeHtml(href)}"${titleAttr}${externalAttrs}>${text}</a>`;
			}
		}
	});

	return { instance, resetSlugs: () => (slugger.current = makeSlugger()) };
}

const { instance: notesMarked, resetSlugs } = createNotesMarked();

/** Extracts h2/h3 headings (in document order, matching the renderer's slugs) for a sidebar TOC. */
export function extractHeadings(markdown: string): HeadingEntry[] {
	const slugger = makeSlugger();
	const headings: HeadingEntry[] = [];
	const lines = markdown.split('\n');
	let inFence = false;
	for (const line of lines) {
		if (/^```/.test(line)) {
			inFence = !inFence;
			continue;
		}
		if (inFence) continue;
		const match = /^(#{2,3})\s+(.+?)\s*$/.exec(line);
		if (match) {
			const depth = match[1].length;
			const text = match[2].replace(/[`*_]/g, '');
			headings.push({ depth, text, slug: slugger(text) });
		}
	}
	return headings;
}

export function renderNotesMarkdown(markdown: string): string {
	resetSlugs();
	return notesMarked.parse(markdown, { async: false }) as string;
}
