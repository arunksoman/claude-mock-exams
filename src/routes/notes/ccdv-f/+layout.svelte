<script lang="ts">
	import 'katex/dist/katex.css';
	import { onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { PanelLeftOpen, PanelLeftClose, ChevronDown, ChevronUp } from '@lucide/svelte';
	import FullscreenToggle from '$lib/components/FullscreenToggle.svelte';
	import { DOMAINS } from '$lib/notes/domains';
	import type { HeadingEntry } from '$lib/server/notesMarkdown';

	let { children } = $props();

	let sidebarOpen = $state(false);
	let subTocOpen = $state(true);
	let pageEl = $state<HTMLElement | null>(null);
	let readingSlug = $state('');

	function hrefFor(code: string) {
		return code === 'overview'
			? resolve('/notes/ccdv-f')
			: resolve('/notes/ccdv-f/[code]', { code });
	}

	function isActive(code: string): boolean {
		const path = page.url.pathname;
		if (code === 'overview') return path === '/notes/ccdv-f' || path === '/notes/ccdv-f/';
		return path === `/notes/ccdv-f/${code}` || path.startsWith(`/notes/ccdv-f/${code}/`);
	}

	function closeSidebar() {
		sidebarOpen = false;
	}

	// The active page's own load already computed its headings (see notes/+page.server.ts and
	// notes/[code]/+page.server.ts) — reuse that via page.data instead of recomputing here.
	let activeHeadings = $derived(
		(page.data as { section?: { headings: HeadingEntry[] } }).section?.headings ?? []
	);

	// Lock background scroll while the mobile drawer is open. Only ever true on mobile — the
	// toggle button that sets it is display:none (removed from the a11y tree, not just hidden)
	// at the desktop breakpoint, so this never fires there.
	$effect(() => {
		if (!browser) return;
		document.body.style.overflow = sidebarOpen ? 'hidden' : '';
	});

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') closeSidebar();
	}

	// Scrollspy: highlight whichever heading the user is currently reading in the sub-toc. Reads
	// straight from the rendered DOM (headings from NotesDomain's {@html} content are descendants
	// of this layout) rather than needing a shared store between the two components.
	let headingObserver: IntersectionObserver | null = null;

	function setupScrollSpy() {
		if (!browser) return;
		headingObserver?.disconnect();
		readingSlug = '';

		const headings = document.querySelectorAll<HTMLElement>(
			'.notes-body h2[id], .notes-body h3[id]'
		);
		if (headings.length === 0) return;

		headingObserver = new IntersectionObserver(
			(entries) => {
				const visible = entries.filter((e) => e.isIntersecting);
				if (visible.length === 0) return;
				visible.sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
				readingSlug = visible[0].target.id;
			},
			// Treats a heading as "current" once it crosses just below the sticky toolbar, until
			// the next heading takes over — not simply whichever heading is anywhere on screen.
			{ rootMargin: '-90px 0px -70% 0px', threshold: 0 }
		);
		for (const h of headings) headingObserver.observe(h);
	}

	$effect(() => {
		// activeHeadings changes on navigation to a different domain page — re-scan for the new
		// page's headings once its content has rendered.
		void activeHeadings;
		if (browser) setupScrollSpy();
	});

	onDestroy(() => headingObserver?.disconnect());
</script>

<svelte:window onkeydown={sidebarOpen ? onKeydown : undefined} />

<!-- FullscreenToggle's target must be an ancestor of everything that should stay visible/usable
     in fullscreen (toolbar, sidebar, content) — the Fullscreen API only renders the target
     element and its descendants, hiding the rest of the page (including the app header) for
     the same distraction-free effect the mock exam uses. -->
<div class="notes-page" bind:this={pageEl}>
	<div class="notes-toolbar">
		<button
			type="button"
			class="sidebar-toggle"
			aria-expanded={sidebarOpen}
			aria-controls="notes-toc"
			aria-label={sidebarOpen ? 'Close contents menu' : 'Open contents menu'}
			onclick={() => (sidebarOpen = !sidebarOpen)}
		>
			{#if sidebarOpen}
				<PanelLeftClose size={19} strokeWidth={1.75} />
			{:else}
				<PanelLeftOpen size={19} strokeWidth={1.75} />
			{/if}
		</button>
		<div class="fs-wrap">
			<FullscreenToggle target={pageEl} />
		</div>
	</div>

	{#if sidebarOpen}
		<button type="button" class="backdrop" aria-label="Close contents menu" onclick={closeSidebar}
		></button>
	{/if}

	<div class="notes-shell">
		<aside class="sidebar" class:open={sidebarOpen}>
			<nav id="notes-toc" class="toc-scroll" aria-label="Study notes navigation">
				<ul>
					{#each DOMAINS as d (d.code)}
						{@const active = isActive(d.code)}
						{@const hasSubToc = active && activeHeadings.length > 0}
						<li>
							<div class="toc-row" class:active>
								<a
									href={hrefFor(d.code)}
									class="toc-link"
									aria-current={active ? 'page' : undefined}
									onclick={closeSidebar}
								>
									<span class="title">{d.title}</span>
									{#if d.weight}<span class="weight">{d.weight}%</span>{/if}
								</a>
								{#if hasSubToc}
									<button
										type="button"
										class="toc-collapse"
										aria-expanded={subTocOpen}
										aria-controls="active-sub-toc"
										aria-label={subTocOpen
											? 'Collapse section headings'
											: 'Expand section headings'}
										onclick={() => (subTocOpen = !subTocOpen)}
									>
										{#if subTocOpen}
											<ChevronUp size={15} strokeWidth={2} />
										{:else}
											<ChevronDown size={15} strokeWidth={2} />
										{/if}
									</button>
								{/if}
							</div>
							{#if hasSubToc && subTocOpen}
								<ul class="sub-toc" id="active-sub-toc">
									{#each activeHeadings as h (h.slug)}
										<li class:sub={h.depth === 3}>
											<a
												href="#{h.slug}"
												class:reading={h.slug === readingSlug}
												onclick={closeSidebar}
											>
												{h.text}
											</a>
										</li>
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
</div>

<style>
	.notes-page:fullscreen {
		/* The Fullscreen API detaches this element from the page layout's <main>, which normally
		   provides the page's padding and background — without this it renders flush against the
		   screen edges (see the same fix on the mock exam's .exam:fullscreen). */
		padding: var(--space-6) var(--space-6) var(--space-8);
		overflow-y: auto;
		background: var(--bg);
	}

	.notes-toolbar {
		position: sticky;
		top: calc(60px + var(--space-2));
		z-index: 60;
		display: flex;
		align-items: flex-start;
		gap: var(--space-2);
		margin-bottom: var(--space-4);
	}

	.notes-page:fullscreen .notes-toolbar {
		top: var(--space-2);
	}

	.fs-wrap {
		margin-left: auto;
	}

	/* Sticky + translucent so it reads as a floating control over the content scrolling beneath
	   it, rather than a full-width bar that pushes the page down. Sits above both the drawer
	   (50) and the backdrop (40) so it keeps working as the close trigger while the drawer is open. */
	.sidebar-toggle {
		flex-shrink: 0;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 40px;
		height: 40px;
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		background: color-mix(in srgb, var(--surface) 70%, transparent);
		backdrop-filter: blur(6px);
		-webkit-backdrop-filter: blur(6px);
		color: var(--text);
		cursor: pointer;
	}

	.sidebar-toggle:hover {
		border-color: var(--accent);
		background: color-mix(in srgb, var(--surface) 88%, transparent);
	}

	.backdrop {
		position: fixed;
		inset: 0;
		border: none;
		padding: 0;
		background: rgb(0 0 0 / 45%);
		z-index: 40;
		cursor: default;
	}

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

	/* Mobile: an off-canvas drawer, not an inline block — jumping to a heading shouldn't require
	   pushing the whole page down and scrolling back up past it. */
	.sidebar {
		position: fixed;
		top: 0;
		left: 0;
		bottom: 0;
		width: min(300px, 85vw);
		background: var(--bg);
		border-right: 1px solid var(--border);
		box-shadow: var(--shadow-md);
		z-index: 50;
		display: flex;
		flex-direction: column;
		transform: translateX(-100%);
		transition: transform 0.2s ease;
	}

	.sidebar.open {
		transform: translateX(0);
	}

	/* The floating toolbar sits at a roughly fixed spot near the top of the viewport (its sticky
	   offset + its own ~40px height) regardless of scroll position, but this drawer is its own
	   fixed-position layer — so its first item needs enough top padding to clear that band rather
	   than tucking underneath it. */
	.toc-scroll {
		flex: 1;
		overflow-y: auto;
		padding: calc(60px + var(--space-2) + 40px + var(--space-3)) var(--space-3) var(--space-3);
	}

	.toc-scroll > ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	/* The link and its collapse button are one visual unit — the active/current-page background
	   goes on this shared row, not the link alone, so the chevron reads as part of the same
	   pill instead of a separate floating control next to it. */
	.toc-row {
		display: flex;
		align-items: stretch;
		border-radius: var(--radius-sm);
	}

	.toc-row.active {
		background: var(--accent-soft);
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

	.toc-link {
		flex: 1;
		min-width: 0;
	}

	.toc-row.active .toc-link {
		color: var(--accent);
		font-weight: 600;
	}

	.toc-row:not(.active) .toc-link:hover {
		background: var(--surface-hover);
		color: var(--text);
	}

	.toc-collapse {
		flex-shrink: 0;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		border: none;
		border-radius: var(--radius-sm);
		background: none;
		color: var(--text-muted);
		cursor: pointer;
	}

	.toc-row.active .toc-collapse {
		color: var(--accent);
	}

	.toc-collapse:hover {
		background: color-mix(in srgb, var(--text) 10%, transparent);
		color: var(--text);
	}

	.toc-scroll .weight {
		font-size: 0.7rem;
		color: var(--text-muted);
		flex-shrink: 0;
	}

	.toc-row.active .weight {
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
		background: var(--surface-hover);
		color: var(--text);
	}

	/* Scrollspy: which heading the user is currently reading — same accent-soft/accent pairing
	   as the active domain pill above, so the two "you are here" signals read as one visual
	   language rather than two different treatments. */
	.sub-toc a.reading {
		background: var(--accent-soft);
		color: var(--accent);
		font-weight: 600;
	}

	@media (min-width: 900px) {
		.sidebar-toggle,
		.backdrop {
			display: none;
		}

		.notes-shell {
			grid-template-columns: 260px minmax(0, 1fr);
			gap: var(--space-8);
		}

		.sidebar {
			position: sticky;
			top: 76px;
			left: auto;
			bottom: auto;
			align-self: start;
			max-height: calc(100vh - 96px);
			overflow-y: auto;
			width: auto;
			background: none;
			border-right: none;
			box-shadow: none;
			transform: none;
			transition: none;
			display: block;
		}

		.toc-scroll {
			overflow-y: visible;
			padding: 0;
		}
	}
</style>
