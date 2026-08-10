<script lang="ts">
	import { browser } from '$app/environment';
	import { themeState } from '$lib/state/theme.svelte';
	import type { NotesSection } from '$lib/server/notesContent';

	interface Props {
		section: NotesSection;
	}

	let { section }: Props = $props();

	let root: HTMLElement | undefined = $state();
	let mermaidRunToken = 0;

	async function runMermaid() {
		if (!browser || !root) return;
		const runId = ++mermaidRunToken;
		const nodes = root.querySelectorAll<HTMLElement>('pre.mermaid[data-src]');
		if (nodes.length === 0) return;

		const { default: mermaid } = await import('mermaid');
		if (runId !== mermaidRunToken) return;

		const dataTheme = document.documentElement.dataset.theme;
		const dark = dataTheme
			? dataTheme === 'dark'
			: window.matchMedia('(prefers-color-scheme: dark)').matches;

		mermaid.initialize({
			startOnLoad: false,
			// Content here is 100% repo-authored (never user input), so 'loose' is safe — some
			// diagrams (e.g. edge labels) render via foreignObject regardless of htmlLabels below,
			// and 'strict' breaks that sizing.
			securityLevel: 'loose',
			theme: dark ? 'dark' : 'default',
			// Two settings that fix node text getting visibly clipped mid-word:
			// (1) htmlLabels:false — mermaid's foreignObject-based node labels were measuring at
			//     width/height 0 in this setup, clipping all node text. Plain SVG <text> labels
			//     size correctly.
			// (2) no fontFamily override — mermaid measures label width using its *own* default
			//     font before drawing; overriding to the app's font (e.g. 'inherit') makes the
			//     rendered text wider than what was measured, so it gets clipped by the node's
			//     computed bounding box. Leaving mermaid's default font keeps measure == render.
			flowchart: { htmlLabels: false, useMaxWidth: true },
			sequence: { useMaxWidth: true },
			pie: { useMaxWidth: true }
		});

		let i = 0;
		for (const node of nodes) {
			const src = node.dataset.src ?? '';
			if (!src) continue;
			try {
				const { svg } = await mermaid.render(`mmd-${Date.now()}-${i++}`, src);
				if (runId !== mermaidRunToken) return;
				node.innerHTML = svg;
			} catch {
				node.textContent = src;
			}
		}
	}

	$effect(() => {
		// section and themeState.pref are read for their reactive dependency: re-render on
		// navigation to a new domain page and on theme toggle.
		void section;
		void themeState.pref;
		if (browser) runMermaid();
	});
</script>

<article class="domain" bind:this={root}>
	<div class="domain-head">
		<h1>{section.title}</h1>
		{#if section.weight}<span class="weight-badge">{section.weight}% of exam</span>{/if}
	</div>

	<!-- eslint-disable-next-line svelte/no-at-html-tags -- notes content is static, repo-authored markdown rendered server-side via $lib/server/notesMarkdown.ts, never user input -->
	<div class="markdown notes-body">{@html section.html}</div>
</article>

<style>
	.domain-head {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		justify-content: space-between;
		gap: var(--space-2);
		border-bottom: 2px solid var(--border);
		padding-bottom: var(--space-3);
		margin-bottom: var(--space-4);
	}

	.domain-head h1 {
		font-size: 1.35rem;
	}

	.weight-badge {
		font-size: 0.78rem;
		color: var(--text-muted);
		background: var(--surface-hover);
		border-radius: var(--radius-sm);
		padding: 0.2em 0.6em;
		white-space: nowrap;
	}

</style>
