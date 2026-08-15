<script lang="ts">
	import NotesDomain from '$lib/components/NotesDomain.svelte';
	import NotesPager from '$lib/components/NotesPager.svelte';

	let { data } = $props();
</script>

<svelte:head>
	<title>{data.section.title} — CCAR-F Study Notes</title>
	<meta name="description" content="CCAR-F exam study notes: {data.section.title}." />
</svelte:head>

<NotesDomain section={data.section} />
<NotesPager cert="ccar-f" code={data.section.code} />
