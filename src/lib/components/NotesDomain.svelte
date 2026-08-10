<script lang="ts">
	import { mount, unmount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import { Maximize2, Minus, Plus, RotateCcw, X } from '@lucide/svelte';
	import { themeState } from '$lib/state/theme.svelte';
	import type { NotesSection } from '$lib/server/notesContent';

	interface Props {
		section: NotesSection;
	}

	let { section }: Props = $props();

	let root: HTMLElement | undefined = $state();
	let mermaidRunToken = 0;

	// Expand-button icons are mounted imperatively into DOM nodes mermaid itself creates (outside
	// Svelte's template), so they need manual teardown — tracked per mermaid <pre> so a re-render
	// (theme toggle, page nav) unmounts the old icon before the node's innerHTML is replaced.
	const iconInstances = new Map<HTMLElement, Record<string, unknown>>();

	let modalSvg = $state<string | null>(null);
	let zoomLevel = $state(1);

	function openDiagram(svg: string) {
		// Mermaid's inline SVG is sized for the small in-page box: width="100%", no height
		// attribute at all, plus an inline `style="max-width:...px"` — all relative to that box's
		// size, not the modal's. Re-derive absolute pixel dimensions from the viewBox (via a real
		// parsed element, not regex) so the diagram has a real intrinsic size to zoom from.
		const wrapper = document.createElement('div');
		wrapper.innerHTML = svg;
		const svgEl = wrapper.querySelector('svg');
		const viewBox = svgEl?.getAttribute('viewBox')?.split(/\s+/).map(Number);
		if (svgEl && viewBox?.length === 4) {
			svgEl.setAttribute('width', String(viewBox[2]));
			svgEl.setAttribute('height', String(viewBox[3]));
			svgEl.style.maxWidth = '';
		}
		modalSvg = svgEl ? wrapper.innerHTML : svg;
		zoomLevel = 1;
	}

	function closeDiagram() {
		modalSvg = null;
	}

	function zoomIn() {
		zoomLevel = Math.min(3, Math.round((zoomLevel + 0.25) * 100) / 100);
	}

	function zoomOut() {
		zoomLevel = Math.max(0.5, Math.round((zoomLevel - 0.25) * 100) / 100);
	}

	function zoomReset() {
		zoomLevel = 1;
	}

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

			const existingIcon = iconInstances.get(node);
			if (existingIcon) {
				unmount(existingIcon);
				iconInstances.delete(node);
			}

			try {
				const { svg } = await mermaid.render(`mmd-${Date.now()}-${i++}`, src);
				if (runId !== mermaidRunToken) return;
				node.innerHTML = svg;

				const btn = document.createElement('button');
				btn.type = 'button';
				btn.className = 'mmd-expand';
				btn.setAttribute('aria-label', 'View diagram full size');
				btn.addEventListener('click', () => openDiagram(svg));
				const icon = mount(Maximize2, { target: btn, props: { size: 15, strokeWidth: 1.75 } });
				iconInstances.set(node, icon);
				node.appendChild(btn);
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

	$effect(() => {
		if (!browser) return;
		document.body.style.overflow = modalSvg ? 'hidden' : '';
	});

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') closeDiagram();
	}

	onDestroy(() => {
		for (const icon of iconInstances.values()) unmount(icon);
		iconInstances.clear();
	});
</script>

<svelte:window onkeydown={modalSvg ? onKeydown : undefined} />

<article class="domain" bind:this={root}>
	<div class="domain-head">
		<h1>{section.title}</h1>
		{#if section.weight}<span class="weight-badge">{section.weight}% of exam</span>{/if}
	</div>

	<!-- eslint-disable-next-line svelte/no-at-html-tags -- notes content is static, repo-authored markdown rendered server-side via $lib/server/notesMarkdown.ts, never user input -->
	<div class="markdown notes-body">{@html section.html}</div>
</article>

{#if modalSvg}
	<div class="mmd-modal-backdrop" onclick={closeDiagram} role="presentation">
		<!-- svelte-ignore a11y_click_events_have_key_events -- this click handler only stops the
		     backdrop's close-on-click from bubbling; Escape (handled above) and the close button
		     are the real keyboard-accessible ways to dismiss the dialog -->
		<div
			class="mmd-modal"
			role="dialog"
			aria-modal="true"
			aria-label="Diagram, full view"
			tabindex="-1"
			onclick={(e) => e.stopPropagation()}
		>
			<div class="mmd-modal-toolbar">
				<button type="button" onclick={zoomOut} aria-label="Zoom out">
					<Minus size={16} strokeWidth={1.75} />
				</button>
				<span class="mmd-zoom-level">{Math.round(zoomLevel * 100)}%</span>
				<button type="button" onclick={zoomIn} aria-label="Zoom in">
					<Plus size={16} strokeWidth={1.75} />
				</button>
				<button type="button" onclick={zoomReset} aria-label="Reset zoom">
					<RotateCcw size={15} strokeWidth={1.75} />
				</button>
				<button type="button" class="mmd-modal-close" onclick={closeDiagram} aria-label="Close">
					<X size={18} strokeWidth={1.75} />
				</button>
			</div>
			<div class="mmd-modal-scroll">
				<!-- eslint-disable-next-line svelte/no-at-html-tags -- modalSvg is mermaid's own rendered SVG output, not user input -->
				<div class="mmd-modal-svg" style="transform: scale({zoomLevel})">{@html modalSvg}</div>
			</div>
		</div>
	</div>
{/if}

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

	.mmd-modal-backdrop {
		position: fixed;
		inset: 0;
		background: rgb(0 0 0 / 55%);
		z-index: 100;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: var(--space-5);
	}

	.mmd-modal {
		width: min(1100px, 100%);
		height: min(85vh, 800px);
		background: var(--bg);
		border-radius: var(--radius-lg);
		border: 1px solid var(--border);
		box-shadow: var(--shadow-md);
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.mmd-modal-toolbar {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-2) var(--space-3);
		border-bottom: 1px solid var(--border);
		flex-shrink: 0;
	}

	.mmd-modal-toolbar button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		border-radius: var(--radius-sm);
		border: 1px solid var(--border);
		background: var(--surface);
		color: var(--text-secondary);
		cursor: pointer;
		flex-shrink: 0;
	}

	.mmd-modal-toolbar button:hover {
		color: var(--text);
		border-color: var(--accent);
	}

	.mmd-modal-close {
		margin-left: auto;
	}

	.mmd-zoom-level {
		font-size: 0.82rem;
		color: var(--text-muted);
		min-width: 42px;
		text-align: center;
	}

	.mmd-modal-scroll {
		flex: 1;
		overflow: auto;
		padding: var(--space-6);
		display: flex;
		align-items: flex-start;
		justify-content: center;
	}

	.mmd-modal-svg {
		transform-origin: top center;
		transition: transform 0.15s ease;
	}

	.mmd-modal-svg :global(svg) {
		display: block;
		width: auto !important;
		max-width: none !important;
		height: auto !important;
	}
</style>
