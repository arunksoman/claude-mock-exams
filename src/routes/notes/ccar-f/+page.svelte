<script lang="ts">
	import NotesDomain from '$lib/components/NotesDomain.svelte';
	import NotesPager from '$lib/components/NotesPager.svelte';

	let { data } = $props();
</script>

<svelte:head>
	<title>Study Notes — CCAR-F</title>
	<meta
		name="description"
		content="Points-to-ponder study notes covering every CCAR-F exam domain: agentic architecture & orchestration, Claude Code configuration, prompt engineering & structured output, tool design & MCP integration, and context management & reliability."
	/>
</svelte:head>

<p class="lead">
	Condensed, bullet-first notes covering the essence of every domain on the exam blueprint — written
	for a fast pass through material you don't have time to read in full from the docs. Terms with a
	dotted underline (<!-- svelte-ignore a11y_no_noninteractive_tabindex -- dfn is deliberately focusable so tap/keyboard users can reveal the tooltip, same as hover -->
	<dfn
		class="term"
		tabindex="0"
		data-def="Example definition — tap or hover any dotted term like this.">example</dfn
	>) show a definition on hover or tap. Use the sidebar to jump to any domain, or read
	<strong>Next →</strong> straight through in blueprint order.
</p>

<NotesDomain section={data.section} />
<NotesPager cert="ccar-f" code={data.section.code} />

<style>
	.lead {
		color: var(--text-secondary);
		margin-bottom: var(--space-6);
		max-width: 68ch;
	}
</style>
