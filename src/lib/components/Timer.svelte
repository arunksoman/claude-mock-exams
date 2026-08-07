<script lang="ts">
	import { Timer as TimerIcon } from '@lucide/svelte';

	interface Props {
		startedAt: number;
		durationMinutes: number;
		ontimeup?: () => void;
	}

	let { startedAt, durationMinutes, ontimeup }: Props = $props();

	let now = $state(Date.now());
	let firedTimeUp = false;

	$effect(() => {
		const interval = setInterval(() => {
			now = Date.now();
		}, 1000);
		return () => clearInterval(interval);
	});

	const remainingSeconds = $derived(
		Math.max(0, Math.round(startedAt + durationMinutes * 60_000 - now) / 1000)
	);

	$effect(() => {
		if (remainingSeconds <= 0 && !firedTimeUp) {
			firedTimeUp = true;
			ontimeup?.();
		}
	});

	const display = $derived.by(() => {
		const total = Math.floor(remainingSeconds);
		const h = Math.floor(total / 3600);
		const m = Math.floor((total % 3600) / 60);
		const s = total % 60;
		const pad = (n: number) => String(n).padStart(2, '0');
		return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
	});

	const low = $derived(remainingSeconds <= 300);
</script>

<div class="timer" class:low>
	<TimerIcon size={16} strokeWidth={1.75} />
	<span>{display}</span>
</div>

<style>
	.timer {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-2) var(--space-3);
		border-radius: var(--radius-sm);
		background: var(--surface);
		border: 1px solid var(--border);
		font-variant-numeric: tabular-nums;
		font-weight: 600;
		font-size: 0.92rem;
	}

	.timer.low {
		border-color: var(--danger);
		color: var(--danger);
	}
</style>
