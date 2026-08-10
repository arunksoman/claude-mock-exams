<script lang="ts">
	import 'katex/dist/katex.css';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { ChevronDown } from '@lucide/svelte';
	import { DOMAINS } from '$lib/notes/domains';
	import type { HeadingEntry } from '$lib/server/notesMarkdown';

	let { children } = $props();

	let sidebarOpen = $state(false);

	function hrefFor(code: string) {
		return code === 'overview' ? resolve('/notes') : resolve('/notes/[code]', { code });
	}

	function isActive(code: string): boolean {
		const path = page.url.pathname;
		if (code === 'overview') return path === '/notes' || path === '/notes/';
		return path === `/notes/${code}` || path.startsWith(`/notes/${code}/`);
	}

	// The active page's own load already computed its headings (see notes/+page.server.ts and
	// notes/[code]/+page.server.ts) — reuse that via page.data instead of recomputing here.
	let activeHeadings = $derived(
		(page.data as { section?: { headings: HeadingEntry[] } }).section?.headings ?? []
	);
</script>

<div class="notes-shell">
	<aside class="sidebar">
		<button
			type="button"
			class="sidebar-toggle"
			aria-expanded={sidebarOpen}
			aria-controls="notes-toc"
			onclick={() => (sidebarOpen = !sidebarOpen)}
		>
			<span>Contents</span>
			<ChevronDown size={16} strokeWidth={1.75} class="chevron" />
		</button>
		<nav id="notes-toc" class="toc-scroll" class:open={sidebarOpen} aria-label="Study notes navigation">
			<ul>
				{#each DOMAINS as d (d.code)}
					{@const active = isActive(d.code)}
					<li>
						<a href={hrefFor(d.code)} class:active aria-current={active ? 'page' : undefined}>
							<span class="title">{d.title}</span>
							{#if d.weight}<span class="weight">{d.weight}%</span>{/if}
						</a>
						{#if active && activeHeadings.length > 0}
							<ul class="sub-toc">
								{#each activeHeadings as h (h.slug)}
									<li class:sub={h.depth === 3}><a href="#{h.slug}">{h.text}</a></li>
								{/each}
							</ul>
						{/if}
					</li>
				{/each}
			</ul>
		</nav>
	</aside>

	<div class="notes-content">
		{@render children()}
	</div>
</div>

<style>
	.notes-shell {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: var(--space-5);
		align-items: start;
	}

	/* Grid/flex items default to a content-based min-width (min-width: auto), which lets wide
	   content (long code lines, mermaid diagrams) blow out the column — and with it the whole
	   page — into a horizontal scroll instead of scrolling inside its own box. min-width: 0
	   lets this column shrink to the track size so overflow is contained where it belongs. */
	.notes-content {
		min-width: 0;
	}

	.sidebar-toggle {
		width: 100%;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: space-between;
		font-weight: 600;
		font-size: 0.9rem;
		padding: var(--space-3) var(--space-4);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		background: var(--surface);
		color: var(--text);
	}

	.sidebar-toggle :global(.chevron) {
		color: var(--text-muted);
		transition: transform 0.15s ease;
	}

	.sidebar-toggle[aria-expanded='true'] :global(.chevron) {
		transform: rotate(180deg);
	}

	.toc-scroll {
		display: none;
		margin-top: var(--space-2);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		background: var(--surface);
		padding: var(--space-3);
	}

	.toc-scroll.open {
		display: block;
	}

	.toc-scroll > ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.toc-scroll a {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2);
		padding: var(--space-2) var(--space-3);
		border-radius: var(--radius-sm);
		text-decoration: none;
		color: var(--text-secondary);
		font-size: 0.86rem;
	}

	.toc-scroll a:hover {
		background: var(--surface-hover);
		color: var(--text);
	}

	.toc-scroll a.active {
		background: var(--accent-soft);
		color: var(--accent);
		font-weight: 600;
	}

	.toc-scroll .weight {
		font-size: 0.7rem;
		color: var(--text-muted);
		flex-shrink: 0;
	}

	.toc-scroll a.active .weight {
		color: var(--accent);
	}

	.sub-toc {
		list-style: none;
		margin: 2px 0 var(--space-2);
		padding: 0;
		border-left: 2px solid var(--border);
	}

	.sub-toc a {
		font-size: 0.8rem;
		padding: var(--space-1) var(--space-3);
		color: var(--text-muted);
	}

	.sub-toc li.sub a {
		padding-left: var(--space-5);
	}

	.sub-toc a:hover {
		color: var(--accent);
	}

	@media (min-width: 900px) {
		.notes-shell {
			grid-template-columns: 260px minmax(0, 1fr);
			gap: var(--space-8);
		}

		.sidebar-toggle {
			display: none;
		}

		.sidebar {
			position: sticky;
			top: 76px;
			align-self: start;
			max-height: calc(100vh - 96px);
			overflow-y: auto;
		}

		/* Always visible on desktop, independent of the mobile open/closed state. */
		.toc-scroll {
			display: block;
			margin-top: 0;
			border: none;
			background: none;
			padding: 0;
		}
	}
</style>
