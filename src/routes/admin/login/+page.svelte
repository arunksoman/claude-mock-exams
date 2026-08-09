<script lang="ts">
	import { LockKeyhole } from '@lucide/svelte';
	import type { ActionData } from './$types';

	let { form }: { form: ActionData } = $props();
</script>

<svelte:head>
	<title>Admin Login</title>
</svelte:head>

<div class="wrap">
	<form method="POST" class="card">
		<div class="icon"><LockKeyhole size={22} strokeWidth={1.75} /></div>
		<h1>Admin Login</h1>

		<label>
			Username
			<input type="text" name="username" autocomplete="username" required />
		</label>
		<label>
			Password
			<input type="password" name="password" autocomplete="current-password" required />
		</label>

		{#if form?.error}
			<p class="error">{form.error}</p>
		{/if}

		<button type="submit">Log in</button>
	</form>
</div>

<style>
	.wrap {
		display: flex;
		justify-content: center;
		padding-top: var(--space-8);
	}

	.card {
		width: 100%;
		max-width: 340px;
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		padding: var(--space-6);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		background: var(--surface);
	}

	.icon {
		width: 40px;
		height: 40px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: var(--radius-md);
		background: var(--accent-soft);
		color: var(--accent);
	}

	h1 {
		font-size: 1.15rem;
	}

	label {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		font-size: 0.85rem;
		color: var(--text-secondary);
	}

	input {
		padding: var(--space-2) var(--space-3);
		border-radius: var(--radius-sm);
		border: 1px solid var(--border);
		background: var(--bg);
		color: var(--text);
		font-size: 0.94rem;
	}

	input:focus-visible {
		outline: 2px solid var(--focus-ring);
		outline-offset: 1px;
	}

	.error {
		color: var(--danger);
		font-size: 0.85rem;
	}

	button {
		padding: var(--space-2) var(--space-4);
		border-radius: var(--radius-md);
		border: none;
		background: var(--accent);
		color: var(--accent-contrast);
		font-weight: 600;
		font-size: 0.92rem;
		cursor: pointer;
	}

	button:hover {
		opacity: 0.92;
	}
</style>
