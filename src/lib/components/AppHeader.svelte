<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { Menu, Trash2, X } from '@lucide/svelte';
	import ThemeToggle from './ThemeToggle.svelte';
	import ConfirmDialog from './ConfirmDialog.svelte';
	import { resetAllAppState } from '$lib/state/index.svelte';

	let menuOpen = $state(false);
	let confirmOpen = $state(false);

	const links = [
		{ href: resolve('/'), label: 'Home' },
		{ href: resolve('/practice'), label: 'Practice' },
		{ href: resolve('/exam'), label: 'Mock Exam' },
		{ href: resolve('/history'), label: 'History' },
		{ href: resolve('/notes'), label: 'Study Notes' }
	];

	function isActive(href: string): boolean {
		if (href === '/') return page.url.pathname === '/';
		return page.url.pathname.startsWith(href);
	}

	function requestClear() {
		menuOpen = false;
		confirmOpen = true;
	}

	function confirmClear() {
		resetAllAppState();
		confirmOpen = false;
		goto(resolve('/'));
	}
</script>

<header>
	<div class="inner">
		<a class="brand" href={resolve('/')}>CCDV-F Practice</a>

		<nav class="desktop-nav">
			{#each links as link (link.href)}
				<a href={link.href} class:active={isActive(link.href)}>{link.label}</a>
			{/each}
		</nav>

		<div class="controls">
			<ThemeToggle />
			<div class="menu-wrap">
				<button
					type="button"
					class="toggle"
					aria-label="Menu"
					aria-expanded={menuOpen}
					onclick={() => (menuOpen = !menuOpen)}
				>
					{#if menuOpen}
						<X size={18} strokeWidth={1.75} />
					{:else}
						<Menu size={18} strokeWidth={1.75} />
					{/if}
				</button>
				{#if menuOpen}
					<div class="dropdown" role="menu">
						<nav class="mobile-nav">
							{#each links as link (link.href)}
								<a
									href={link.href}
									class:active={isActive(link.href)}
									role="menuitem"
									onclick={() => (menuOpen = false)}
								>
									{link.label}
								</a>
							{/each}
							<div class="divider"></div>
						</nav>
						<button type="button" role="menuitem" onclick={requestClear}>
							<Trash2 size={16} strokeWidth={1.75} />
							Clear my data
						</button>
					</div>
				{/if}
			</div>
		</div>
	</div>
</header>

<ConfirmDialog
	bind:open={confirmOpen}
	title="Clear all local data?"
	message="This removes your theme preference, any in-progress practice/exam session, and your full attempt history from this browser. This can't be undone."
	confirmLabel="Clear data"
	danger
	onconfirm={confirmClear}
	oncancel={() => (confirmOpen = false)}
/>

<style>
	header {
		border-bottom: 1px solid var(--border);
		background: var(--bg);
		position: sticky;
		top: 0;
		z-index: 10;
	}

	.inner {
		max-width: 960px;
		margin: 0 auto;
		padding: var(--space-3) var(--space-5);
		display: flex;
		align-items: center;
		gap: var(--space-6);
	}

	.brand {
		font-weight: 600;
		color: var(--text);
		text-decoration: none;
		font-size: 0.98rem;
		white-space: nowrap;
	}

	.desktop-nav {
		display: flex;
		gap: var(--space-5);
		flex: 1;
	}

	nav a {
		color: var(--text-secondary);
		text-decoration: none;
		font-size: 0.92rem;
		padding: var(--space-1) 0;
		border-bottom: 2px solid transparent;
	}

	nav a:hover {
		color: var(--text);
	}

	nav a.active {
		color: var(--text);
		border-bottom-color: var(--accent);
	}

	.controls {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		margin-left: auto;
	}

	.menu-wrap {
		position: relative;
	}

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

	.dropdown {
		position: absolute;
		right: 0;
		top: calc(100% + var(--space-2));
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		box-shadow: var(--shadow-md);
		min-width: 190px;
		padding: var(--space-1);
	}

	.mobile-nav {
		display: none;
		flex-direction: column;
	}

	.mobile-nav a {
		display: block;
		padding: var(--space-2) var(--space-3);
		border-radius: var(--radius-sm);
		border-bottom: none;
		font-size: 0.88rem;
	}

	.mobile-nav a:hover {
		background: var(--surface-hover);
	}

	.mobile-nav a.active {
		color: var(--accent);
	}

	.divider {
		height: 1px;
		background: var(--border);
		margin: var(--space-1) var(--space-2);
	}

	.dropdown button {
		width: 100%;
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-2) var(--space-3);
		background: none;
		border: none;
		border-radius: var(--radius-sm);
		color: var(--text);
		font-size: 0.88rem;
		cursor: pointer;
		text-align: left;
	}

	.dropdown button:hover {
		background: var(--surface-hover);
	}

	@media (max-width: 640px) {
		.inner {
			padding: var(--space-3) var(--space-4);
			gap: var(--space-3);
		}

		.desktop-nav {
			display: none;
		}

		.brand {
			font-size: 0.88rem;
		}

		.mobile-nav {
			display: flex;
		}
	}
</style>
