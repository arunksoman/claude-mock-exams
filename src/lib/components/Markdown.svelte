<script lang="ts">
	interface Props {
		html: string;
		tag?: 'span' | 'div';
	}

	let { html, tag = 'span' }: Props = $props();
</script>

{#if tag === 'div'}
	<!-- eslint-disable-next-line svelte/no-at-html-tags -- html is always pre-rendered server-side via $lib/server/markdown.ts (marked + sanitize-html allowlist), never raw user input -->
	<div class="markdown">{@html html}</div>
{:else}
	<!-- eslint-disable-next-line svelte/no-at-html-tags -- see above -->
	<span class="markdown">{@html html}</span>
{/if}
