<script lang="ts">
	import { CircleAlert } from '@lucide/svelte';

	interface Props {
		open: boolean;
		title: string;
		message: string;
		confirmLabel?: string;
		cancelLabel?: string;
		danger?: boolean;
		onconfirm: () => void;
		oncancel: () => void;
	}

	let {
		open = $bindable(),
		title,
		message,
		confirmLabel = 'Confirm',
		cancelLabel = 'Cancel',
		danger = false,
		onconfirm,
		oncancel
	}: Props = $props();

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') oncancel();
	}
</script>

{#if open}
	<div class="overlay" role="presentation" onclick={oncancel}>
		<div
			class="dialog"
			role="alertdialog"
			aria-modal="true"
			aria-labelledby="confirm-dialog-title"
			tabindex="-1"
			onclick={(e) => e.stopPropagation()}
			onkeydown={handleKeydown}
		>
			<div class="icon" class:danger>
				<CircleAlert size={20} strokeWidth={1.75} />
			</div>
			<h2 id="confirm-dialog-title">{title}</h2>
			<p>{message}</p>
			<div class="actions">
				<button type="button" class="btn-secondary" onclick={oncancel}>{cancelLabel}</button>
				<button
					type="button"
					class:btn-danger={danger}
					class:btn-primary={!danger}
					onclick={onconfirm}
				>
					{confirmLabel}
				</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.overlay {
		position: fixed;
		inset: 0;
		background: rgba(20, 18, 14, 0.35);
		display: flex;
		align-items: center;
		justify-content: center;
		padding: var(--space-4);
		z-index: 100;
	}

	.dialog {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-md);
		padding: var(--space-5);
		max-width: 380px;
		width: 100%;
	}

	.icon {
		width: 36px;
		height: 36px;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--accent-soft);
		color: var(--accent);
		margin-bottom: var(--space-3);
	}

	.icon.danger {
		background: var(--danger-soft);
		color: var(--danger);
	}

	h2 {
		font-size: 1.05rem;
		margin-bottom: var(--space-2);
	}

	p {
		color: var(--text-secondary);
		font-size: 0.92rem;
	}

	.actions {
		display: flex;
		justify-content: flex-end;
		gap: var(--space-2);
		margin-top: var(--space-5);
	}

	button {
		padding: var(--space-2) var(--space-4);
		border-radius: var(--radius-sm);
		border: 1px solid transparent;
		cursor: pointer;
		font-size: 0.9rem;
		font-weight: 500;
	}

	.btn-secondary {
		background: transparent;
		border-color: var(--border);
		color: var(--text);
	}

	.btn-secondary:hover {
		background: var(--surface-hover);
	}

	.btn-primary {
		background: var(--accent);
		color: var(--accent-contrast);
	}

	.btn-danger {
		background: var(--danger);
		color: white;
	}
</style>
