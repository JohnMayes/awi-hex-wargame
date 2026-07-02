<script lang="ts">
	import { SCENARIOS } from '$lib/game/data/scenarios';
	import type { Scenario } from '$lib/game/core/scenario';

	// ponytail: palette hex literals are shared with GameScreen.svelte (see note there).
	let { onPlay }: { onPlay: (scenario: Scenario) => void } = $props();

	const scenarios = Object.values(SCENARIOS);

	let screen = $state<'home' | 'list' | 'detail'>('home');
	// Track the id, not the object: assigning a scenario into $state would deep-proxy
	// it, and that proxy is un-cloneable — GameStore.fromScenario's structuredClone
	// would throw. A $derived lookup hands `onPlay` the raw module constant.
	let selectedId = $state<string | null>(null);
	const selected = $derived(selectedId ? SCENARIOS[selectedId] : null);

	const playerName = (p: number) => (p === 0 ? 'Blue' : 'Red');

	// Victory conditions grouped by side, empty sides dropped — each condition
	// already carries a human-readable `description`, so no live store is needed.
	const objectives = $derived.by(() => {
		const s = selected;
		if (!s) return [];
		return [0, 1]
			.map((player) => ({
				player,
				conditions: s.victoryConditions.filter((c) => c.player === player)
			}))
			.filter((g) => g.conditions.length > 0);
	});

	function pick(scenario: Scenario) {
		selectedId = scenario.id;
		screen = 'detail';
	}
</script>

<main class="menu">
	{#if screen === 'home'}
		<div class="home">
			<h1 class="title">AWI Hex &amp; Counter</h1>
			<p class="subtitle">Horse &amp; Musket wargame</p>
			<button class="primary" onclick={() => (screen = 'list')}>New Game</button>
		</div>
	{:else if screen === 'list'}
		<div class="panel">
			<header class="panel-head">
				<button class="back" onclick={() => (screen = 'home')}>‹ Back</button>
				<h2 class="panel-title">Choose a scenario</h2>
			</header>
			<ul class="cards">
				{#each scenarios as scenario (scenario.id)}
					<li>
						<button class="card" onclick={() => pick(scenario)}>
							<span class="card-name">{scenario.name}</span>
							<span class="card-desc">{scenario.description}</span>
						</button>
					</li>
				{/each}
			</ul>
		</div>
	{:else if selected}
		<div class="panel">
			<header class="panel-head">
				<button class="back" onclick={() => (screen = 'list')}>‹ Back</button>
				<h2 class="panel-title">{selected.name}</h2>
			</header>
			<div class="detail">
				<p class="detail-desc">{selected.description}</p>
				{#if selected.turnLimit !== null}
					<p class="detail-meta">Turn limit: {selected.turnLimit} turns</p>
				{/if}
				<h3 class="detail-heading">Victory conditions</h3>
				{#each objectives as group (group.player)}
					<div class="obj-group">
						<span class="obj-side" data-player={group.player}>{playerName(group.player)}</span>
						<ul class="obj-list">
							{#each group.conditions as c (c.id)}
								<li class="obj-desc">{c.description}</li>
							{/each}
						</ul>
					</div>
				{/each}
			</div>
			<button class="primary play" onclick={() => selected && onPlay(selected)}>Play</button>
		</div>
	{/if}
</main>

<style>
	.menu {
		position: fixed;
		inset: 0;
		display: flex;
		flex-direction: column;
		background: #15181c;
		color: #e8e1d1;
		font-family: 'IBM Plex Sans', system-ui, sans-serif;
		padding: calc(1.25rem + env(safe-area-inset-top)) 1.25rem
			calc(1.25rem + env(safe-area-inset-bottom));
		box-sizing: border-box;
		overflow-y: auto;
		touch-action: manipulation;
		-webkit-user-select: none;
		user-select: none;
	}

	/* --- home --- */
	.home {
		margin: auto;
		text-align: center;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.5rem;
		max-width: 24rem;
		width: 100%;
	}
	.title {
		margin: 0;
		font-size: 1.75rem;
		font-weight: 600;
		letter-spacing: 0.02em;
		color: #e8e1d1;
	}
	.subtitle {
		margin: 0 0 1.5rem;
		font-size: 0.8125rem;
		text-transform: uppercase;
		letter-spacing: 0.14em;
		color: #8a8275;
	}

	/* --- shared primary button (New Game / Play) --- */
	.primary {
		appearance: none;
		background: #c9a227;
		color: #15181c;
		border: none;
		border-radius: 3px;
		padding: 0 1.5rem;
		font: inherit;
		font-size: 0.9375rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.1em;
		cursor: pointer;
		min-height: 52px;
		width: 100%;
		max-width: 20rem;
		transition: background 80ms ease;
	}
	.primary:hover {
		background: #e0b93a;
	}

	/* --- list / detail panel --- */
	.panel {
		margin: 0 auto;
		width: 100%;
		max-width: 32rem;
		display: flex;
		flex-direction: column;
		flex: 1;
		min-height: 0;
	}
	.panel-head {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		margin-bottom: 1.25rem;
	}
	.panel-title {
		margin: 0;
		font-size: 1.125rem;
		font-weight: 600;
	}
	.back {
		appearance: none;
		background: transparent;
		border: none;
		color: #8a8275;
		font: inherit;
		font-size: 0.8125rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		cursor: pointer;
		min-height: 44px;
		padding: 0.25rem 0.5rem 0.25rem 0;
	}
	.back:hover {
		color: #e8e1d1;
	}

	/* --- scenario cards --- */
	.cards {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}
	.card {
		appearance: none;
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.375rem;
		width: 100%;
		text-align: left;
		background: #1d2126;
		border: 1px solid #3a3530;
		border-radius: 4px;
		padding: 1rem;
		color: inherit;
		font: inherit;
		cursor: pointer;
		transition:
			border-color 80ms ease,
			background 80ms ease;
	}
	.card:hover {
		border-color: #c9a227;
		background: #22262c;
	}
	.card-name {
		font-size: 1rem;
		font-weight: 600;
		color: #e8e1d1;
	}
	.card-desc {
		font-size: 0.8125rem;
		line-height: 1.4;
		color: #b8b0a0;
	}

	/* --- detail --- */
	.detail {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
	}
	.detail-desc {
		margin: 0 0 0.75rem;
		font-size: 0.9375rem;
		line-height: 1.5;
		color: #b8b0a0;
	}
	.detail-meta {
		margin: 0 0 1.25rem;
		font-size: 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: #8a8275;
		font-variant-numeric: tabular-nums;
	}
	.detail-heading {
		margin: 0 0 0.75rem;
		font-size: 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.12em;
		font-weight: 600;
		color: #8a8275;
	}
	.obj-group {
		margin-bottom: 1rem;
	}
	.obj-side {
		display: inline-block;
		margin-bottom: 0.375rem;
		font-size: 0.6875rem;
		text-transform: uppercase;
		letter-spacing: 0.1em;
		font-weight: 600;
	}
	.obj-side[data-player='0'] {
		color: #5a8fe6;
	}
	.obj-side[data-player='1'] {
		color: #e06a6a;
	}
	.obj-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
	}
	.obj-desc {
		font-size: 0.875rem;
		line-height: 1.4;
		color: #e8e1d1;
		padding-left: 0.875rem;
		position: relative;
	}
	.obj-desc::before {
		content: '·';
		position: absolute;
		left: 0.25rem;
		color: #8a8275;
	}
	.play {
		margin: 1.25rem auto 0;
	}
</style>
