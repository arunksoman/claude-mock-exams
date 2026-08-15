<script lang="ts">
	import { resolve } from '$app/paths';
	import { domainsFor } from '$lib/notes/domains';

	interface Props {
		cert: 'ccdv-f' | 'ccar-f';
		code: string;
	}

	let { cert, code }: Props = $props();

	function hrefFor(c: string) {
		return c === 'overview'
			? resolve(cert === 'ccar-f' ? '/notes/ccar-f' : '/notes/ccdv-f')
			: resolve(cert === 'ccar-f' ? '/notes/ccar-f/[code]' : '/notes/ccdv-f/[code]', { code: c });
	}

	let domains = $derived(domainsFor(cert));
	let index = $derived(domains.findIndex((d) => d.code === code));
	let prev = $derived(index > 0 ? domains[index - 1] : undefined);
	let next = $derived(index >= 0 && index < domains.length - 1 ? domains[index + 1] : undefined);
</script>

<nav class="pager" aria-label="Domain navigation">
	{#if prev}
		<a class="pager-link prev" href={hrefFor(prev.code)}>
			<span class="dir">← Previous</span>
			<span class="title">{prev.title}</span>
		</a>
	{:else}
		<span></span>
	{/if}
	{#if next}
		<a class="pager-link next" href={hrefFor(next.code)}>
			<span class="dir">Next →</span>
			<span class="title">{next.title}</span>
		</a>
	{/if}
</nav>

<style>
	.pager {
		display: flex;
		justify-content: space-between;
		gap: var(--space-4);
		margin-top: var(--space-8);
		padding-top: var(--space-5);
		border-top: 1px solid var(--border);
	}

	.pager-link {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: var(--space-3) var(--space-4);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		background: var(--surface);
		text-decoration: none;
		max-width: 45%;
	}

	.pager-link:hover {
		border-color: var(--accent);
	}

	.pager-link.next {
		text-align: right;
		margin-left: auto;
	}

	.dir {
		font-size: 0.72rem;
		color: var(--text-muted);
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	.title {
		font-size: 0.9rem;
		color: var(--text);
		font-weight: 600;
	}

	@media (max-width: 640px) {
		.pager-link {
			max-width: 100%;
		}
	}
</style>
