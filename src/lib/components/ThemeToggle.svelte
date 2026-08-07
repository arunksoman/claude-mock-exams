<script lang="ts">
	import { Sun, Moon, Monitor } from '@lucide/svelte';
	import { themeState, setTheme, type ThemePreference } from '$lib/state/theme.svelte';

	const order: ThemePreference[] = ['light', 'dark', 'system'];
	const icons = { light: Sun, dark: Moon, system: Monitor };
	const labels = { light: 'Light theme', dark: 'Dark theme', system: 'Match system theme' };

	function cycle() {
		const next = order[(order.indexOf(themeState.pref) + 1) % order.length];
		setTheme(next);
	}

	let Icon = $derived(icons[themeState.pref]);
</script>

<button
	type="button"
	class="toggle"
	onclick={cycle}
	aria-label={labels[themeState.pref]}
	title={labels[themeState.pref]}
>
	<Icon size={18} strokeWidth={1.75} />
</button>

<style>
	.toggle {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 36px;
		height: 36px;
		border-radius: var(--radius-sm);
		border: 1px solid var(--border);
		background: var(--surface);
		color: var(--text-secondary);
		cursor: pointer;
	}

	.toggle:hover {
		background: var(--surface-hover);
		color: var(--text);
	}
</style>
