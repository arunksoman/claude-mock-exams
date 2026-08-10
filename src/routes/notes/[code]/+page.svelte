<script lang="ts">
	import NotesDomain from '$lib/components/NotesDomain.svelte';
	import NotesPager from '$lib/components/NotesPager.svelte';

	let { data } = $props();
</script>

<svelte:head>
	<title>{data.section.title} — CCDV-F Study Notes</title>
	<meta name="description" content="CCDV-F exam study notes: {data.section.title}." />
</svelte:head>

<NotesDomain section={data.section} />
<NotesPager code={data.section.code} />
