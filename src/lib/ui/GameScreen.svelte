<script lang="ts">
	import type { GameStore } from '$lib/game/state/gameStore.svelte';
	import type { Player } from '$lib/game/core/types';
	import { heuristicPolicy, stepPolicy } from '$lib/game/sim/playout';
	import LittleBoard from '$lib/game/render/LittleBoard.svelte';

	// ponytail: palette hex literals are duplicated with ScenarioMenu.svelte; promote to
	// CSS tokens if a third screen needs them. Two consumers isn't worth a token system yet.
	let {
		store,
		onExit,
		aiPlayers = []
	}: { store: GameStore; onExit: () => void; aiPlayers?: Player[] } = $props();

	// Pointer-events discipline for the LJS chrome overlay: stop chrome presses AND
	// releases from bubbling to `document`, where LittleJS's input listeners live.
	// Stopping the *down* events keeps chrome taps from registering as board input;
	// stopping the *up* events matters on touch devices, where the engine's
	// `touchend` handler calls `preventDefault()` — which would cancel the
	// synthesized `click` and leave every chrome button/radio/dialog dead to touch.
	// The button's own `onclick`/`onchange` is a separate event and still fires.
	// An attachment (not inline handlers) keeps the static container free of a11y warnings.
	const SWALLOWED = ['mousedown', 'mouseup', 'touchstart', 'touchend'] as const;
	function swallowPointer(node: HTMLElement) {
		const stop = (e: Event) => e.stopPropagation();
		for (const type of SWALLOWED) node.addEventListener(type, stop);
		return () => {
			for (const type of SWALLOWED) node.removeEventListener(type, stop);
		};
	}

	const outcomeText = $derived.by(() => {
		const o = store.victoryOutcome;
		if (!o) return null;
		const who = o.status === 'draw' ? 'Draw' : `${o.winner === 0 ? 'Blue' : 'Red'} wins`;
		return `${who} — ${o.reason.replace(/_/g, ' ')}`;
	});

	const sel = $derived(store.selectedUnit);
	const unitName = (u: { type: string }) => u.type.toLowerCase().replace(/_/g, ' ');
	const playerName = (p: number) => (p === 0 ? 'Blue' : 'Red');
	const selHasLeader = $derived(!!sel && store.leaders.some((l) => l.attachedToUnitId === sel.id));

	// Objectives dialog (victory progress on demand, not always-on HUD).
	let victoryDialog: HTMLDialogElement | undefined = $state();

	// Bottom-bar contextual state, all driven by the store's pendingAction.
	const pending = $derived(store.pendingAction);
	const pendingTarget = $derived(
		pending && pending.kind !== 'move'
			? (store.units.find((u) => u.id === pending.targetId) ?? null)
			: null
	);
	// A target the active unit can both fire AND charge needs the Fire/Charge radio.
	const bothCombat = $derived(
		pending && pending.kind !== 'move'
			? store.validFireTargets.some((u) => u.id === pending.targetId) &&
					store.validChargeTargets.some((u) => u.id === pending.targetId)
			: false
	);

	// Activation status for the active player (top-bar readout).
	const totalUnits = $derived(store.units.filter((u) => u.player === store.activePlayer).length);
	const actedUnits = $derived(
		store.units.filter((u) => u.player === store.activePlayer && u.activated).length
	);
	const unitsLeft = $derived(totalUnits - actedUnits);

	// End-turn safety: with un-activated units left, the first press arms a soft
	// confirm (no blocking modal) and the second press actually ends the turn.
	// `armedFor` records which player-turn was armed, so a turn change auto-disarms
	// it via the derived below (no reset effect needed).
	const turnKey = $derived(`${store.turn}:${store.activePlayer}`);
	let armedFor = $state<string | null>(null);
	const endTurnArmed = $derived(armedFor === turnKey);
	let endTurnTimer: ReturnType<typeof setTimeout> | undefined;
	function handleEndTurn() {
		if (store.isGameOver) return;
		if (unitsLeft > 0 && !endTurnArmed) {
			armedFor = turnKey;
			clearTimeout(endTurnTimer);
			endTurnTimer = setTimeout(() => (armedFor = null), 3000);
			return;
		}
		clearTimeout(endTurnTimer);
		armedFor = null;
		store.endPlayerTurn();
	}

	const AI_STEP_MS = 400; // pacing so the AI's moves are watchable
	let aiThinking = false;

	// Drive any AI-controlled side through the same public store API the human uses
	// (via the shared stepPolicy loop). Reads only isGameOver/activePlayer, so it
	// re-fires only on a turn-ownership change; aiThinking guards re-entry. With both
	// sides AI the loop simply continues across the turn flip and plays the whole game.
	$effect(() => {
		const over = store.isGameOver;
		const player = store.activePlayer;
		if (over || !aiPlayers.includes(player) || aiThinking) return;
		aiThinking = true;
		(async () => {
			while (!store.isGameOver && aiPlayers.includes(store.activePlayer)) {
				stepPolicy(store, heuristicPolicy, Math.random);
				await new Promise((r) => setTimeout(r, AI_STEP_MS));
			}
			aiThinking = false;
		})();
	});
</script>

{#snippet topBar()}
	<header class="top-bar">
		<div class="meta">
			<button class="icon-btn" aria-label="Back to menu" onclick={onExit}>☰</button>
			<button
				class="icon-btn star-btn"
				aria-label="Show objectives"
				onclick={() => victoryDialog?.showModal()}>★</button
			>
			<span class="meta-label">Turn</span>
			<span class="meta-value">{store.turn}</span>
			<span class="player-chip" data-player={store.activePlayer}
				>{store.activePlayer === 0 ? 'Blue' : 'Red'}</span
			>
		</div>
		<button
			class="end-turn"
			data-armed={endTurnArmed}
			onclick={handleEndTurn}
			disabled={store.isGameOver || aiPlayers.includes(store.activePlayer)}
			>{endTurnArmed ? `End turn? (${unitsLeft} left)` : 'End Turn'}</button
		>
	</header>
{/snippet}

{#snippet banner()}
	{#if outcomeText}
		<div class="banner" data-status={store.victoryOutcome?.status}>{outcomeText}</div>
	{/if}
{/snippet}

{#snippet bottomBar()}
	<footer class="bottom-bar">
		{#if !sel}
			<span class="prompt">Tap a unit to select</span>
		{:else}
			<div class="unit-readout">
				<span class="unit-label">{store.activeUnitId === sel.id ? 'Activating' : 'Selected'}</span>
				<span class="unit-name">{unitName(sel)}</span>
				<span class="unit-detail"
					>SP {sel.strengthPoints}/{sel.maxStrengthPoints}{selHasLeader ? ' · ★ leader' : ''}</span
				>
			</div>

			{#if pending}
				<div class="pending">
					{#if pending.kind === 'move'}
						<span class="pending-label">Move · cost {pending.cost}</span>
					{:else if bothCombat}
						<div class="combat-choice" role="radiogroup" aria-label="Combat action">
							<label class="radio">
								<input
									type="radio"
									name="combat"
									value="fire"
									checked={pending.kind === 'fire'}
									onchange={() => store.setPendingCombatKind('fire')}
								/> Fire
							</label>
							<label class="radio">
								<input
									type="radio"
									name="combat"
									value="charge"
									checked={pending.kind === 'charge'}
									onchange={() => store.setPendingCombatKind('charge')}
								/> Charge
							</label>
						</div>
					{:else}
						<span class="pending-label"
							>{pending.kind === 'fire' ? 'Fire' : 'Charge'}{pendingTarget
								? ` · ${unitName(pendingTarget)}`
								: ''}</span
						>
					{/if}
				</div>
				<div class="actions">
					<button class="action" onclick={() => store.cancelAction()}>Cancel</button>
				</div>
			{:else if store.activeUnitId === sel.id}
				<div class="actions">
					<button class="action" onclick={() => store.endActivation()}>End Activation</button>
				</div>
			{:else}
				<span class="command-badge" data-incommand={store.selectedInCommand !== false}>
					{store.selectedInCommand === false ? 'Out of command' : 'In command'}
				</span>
			{/if}
		{/if}
	</footer>
{/snippet}

<LittleBoard {store} />
<!-- DOM chrome overlaid over the body-rooted canvas. The empty middle is
     pointer-events:none so board taps fall through to the engine; the bars
     are pointer-events:auto and stop their presses from reaching `document`. -->
<div class="overlay">
	<div class="chrome-group" {@attach swallowPointer}>
		{@render topBar()}
		{@render banner()}
	</div>
	<div class="chrome-group" {@attach swallowPointer}>
		{@render bottomBar()}
	</div>
</div>

<!-- Objectives dialog: victory progress on demand. Native <dialog> (top-layer,
     focus-trapped, Esc-dismissable) keeps it accessible, unlike a canvas UI.
     swallowPointer stops in-dialog presses from reaching the engine listeners. -->
<dialog class="objectives" bind:this={victoryDialog} {@attach swallowPointer}>
	<h2 class="obj-title">Objectives</h2>
	{#if store.turnLimit !== null}
		<p class="obj-turn">Turn {store.turn} of {store.turnLimit}</p>
	{/if}
	<ul class="obj-list">
		{#each store.victoryStatus as c (c.id)}
			<li class="obj-item" data-player={c.player} data-met={c.met}>
				<div class="obj-row">
					<span class="obj-side" data-player={c.player}>{playerName(c.player)}</span>
					<span class="obj-progress">{c.text}</span>
				</div>
				<span class="obj-desc">{c.description}</span>
				<div class="obj-bar">
					<div class="obj-bar-fill" style="width:{Math.round(c.fraction * 100)}%"></div>
				</div>
			</li>
		{:else}
			<li class="obj-item"><span class="obj-desc">No victory conditions.</span></li>
		{/each}
	</ul>
	<button class="action obj-close" onclick={() => victoryDialog?.close()}>Close</button>
</dialog>

<style>
	/* --- LJS chrome overlay (DOM bars over the body-rooted canvas) --- */
	.overlay {
		position: fixed;
		inset: 0;
		z-index: 1; /* above the canvas (engine.ts pins both canvases to z-index 0) */
		display: flex;
		flex-direction: column;
		justify-content: space-between; /* pin top group to top, bottom group to bottom */
		pointer-events: none; /* empty middle is click-through to the canvas */
	}
	.chrome-group {
		pointer-events: auto; /* bars are interactive */
		touch-action: manipulation; /* drop the 300ms tap delay; no double-tap zoom on the bars */
		-webkit-user-select: none;
		user-select: none; /* taps on bars never start a text selection */
	}

	/* --- top bar (status + end turn) --- */
	.top-bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		padding: 0.625rem 1rem;
		padding-top: calc(0.625rem + env(safe-area-inset-top));
		background: #15181c;
		color: #e8e1d1;
		border-bottom: 1px solid #3a3530;
		font-size: 0.8125rem;
		min-height: 52px;
		box-sizing: border-box;
	}

	.meta {
		display: flex;
		align-items: center;
		gap: 0.625rem;
	}
	.meta-label {
		text-transform: uppercase;
		letter-spacing: 0.14em;
		font-size: 0.6875rem;
		color: #8a8275;
		font-weight: 500;
	}
	.meta-value {
		font-variant-numeric: tabular-nums;
		font-weight: 500;
		color: #e8e1d1;
	}
	.player-chip {
		display: inline-flex;
		align-items: center;
		padding: 0.125rem 0.5rem;
		border-radius: 2px;
		font-size: 0.6875rem;
		text-transform: uppercase;
		letter-spacing: 0.1em;
		font-weight: 600;
	}
	.player-chip[data-player='0'] {
		background: #1a56db;
		color: #fff;
	}
	.player-chip[data-player='1'] {
		background: #e02424;
		color: #fff;
	}

	.end-turn {
		appearance: none;
		background: transparent;
		color: #fff;
		border: none;
		padding: 0.25rem;
		font: inherit;
		font-size: 0.8125rem;
		text-transform: uppercase;
		letter-spacing: 0.1em;
		font-weight: 600;
		text-decoration: underline;
		text-underline-offset: 3px;
		cursor: pointer;
		min-height: 44px;
		transition: color 80ms ease;
	}
	.end-turn:hover:not(:disabled) {
		color: #c9a227;
	}
	.end-turn:disabled {
		opacity: 0.3;
		cursor: not-allowed;
		text-decoration: none;
	}

	/* --- victory banner --- */
	.banner {
		padding: 0.625rem 1rem;
		text-align: center;
		font-size: 0.8125rem;
		text-transform: uppercase;
		letter-spacing: 0.12em;
		font-weight: 600;
		color: #15181c;
		background: #e8e1d1;
	}
	.banner[data-status='won'] {
		background: #c9a227;
	}
	.banner[data-status='draw'] {
		background: #8a8275;
		color: #15181c;
	}

	/* --- bottom bar (selected unit + actions) --- */
	.bottom-bar {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.75rem 1rem;
		padding-bottom: calc(0.75rem + env(safe-area-inset-bottom));
		background: #15181c;
		color: #e8e1d1;
		border-top: 1px solid #3a3530;
		min-height: 64px;
		box-sizing: border-box;
	}

	.unit-readout {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		line-height: 1.1;
		flex: 0 0 auto;
		min-width: 0;
	}
	.unit-label {
		text-transform: uppercase;
		letter-spacing: 0.14em;
		font-size: 0.625rem;
		color: #8a8275;
		font-weight: 500;
	}
	.unit-name {
		font-style: italic;
		font-size: 0.875rem;
		text-transform: capitalize;
		color: #e8e1d1;
		max-width: 14ch;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.actions {
		display: flex;
		gap: 0.5rem;
		flex: 1;
		justify-content: flex-end;
	}
	.action {
		appearance: none;
		background: transparent;
		color: #e8e1d1;
		border: 1px solid #3a3530;
		padding: 0 1rem;
		font: inherit;
		font-size: 0.8125rem;
		text-transform: uppercase;
		letter-spacing: 0.1em;
		font-weight: 500;
		cursor: pointer;
		border-radius: 2px;
		min-height: 48px;
		flex: 1;
		max-width: 7.5rem;
		transition:
			background 80ms ease,
			border-color 80ms ease,
			color 80ms ease;
	}
	.action:hover:not(:disabled) {
		background: #e8e1d1;
		color: #15181c;
		border-color: #e8e1d1;
	}
	.action:disabled {
		opacity: 0.3;
		cursor: not-allowed;
	}

	.prompt {
		color: #8a8275;
		font-style: italic;
		font-size: 0.8125rem;
		/* Match the action-button row height so the bar doesn't reflow
		   between the empty-selection and selected states. */
		display: flex;
		align-items: center;
		min-height: 48px;
	}

	/* --- selected-unit command badge (the activation gamble, pre-commit) --- */
	.command-badge {
		display: inline-flex;
		align-items: center;
		margin-left: auto;
		padding: 0.25rem 0.625rem;
		border-radius: 2px;
		font-size: 0.6875rem;
		text-transform: uppercase;
		letter-spacing: 0.1em;
		font-weight: 600;
		min-height: 48px;
		box-sizing: border-box;
	}
	.command-badge[data-incommand='true'] {
		color: #8fbf6b;
	}
	.command-badge[data-incommand='false'] {
		color: #e0a324;
	}

	/* --- pending (armed) action readout --- */
	.pending {
		display: flex;
		align-items: center;
		margin-left: auto;
		min-width: 0;
	}
	.pending-label {
		font-size: 0.8125rem;
		text-transform: capitalize;
		color: #e8e1d1;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.combat-choice {
		display: flex;
		gap: 0.75rem;
	}
	.radio {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		font-size: 0.8125rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: #e8e1d1;
		cursor: pointer;
	}
	.radio input {
		accent-color: #c9a227;
		width: 1.1rem;
		height: 1.1rem;
	}

	/* end-turn soft-confirm armed state (amber) */
	.end-turn[data-armed='true'] {
		color: #e0a324;
	}

	/* icon buttons (menu / objectives) */
	.icon-btn {
		appearance: none;
		background: transparent;
		border: none;
		color: #c9a227;
		font-size: 1.1rem;
		line-height: 1;
		cursor: pointer;
		padding: 0.25rem;
		min-width: 44px;
		min-height: 44px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		border-radius: 2px;
	}
	.icon-btn:hover {
		color: #e8e1d1;
	}
	/* the ☰ menu button is chrome, not an accent — mute it vs the gold ★ */
	.icon-btn:not(.star-btn) {
		color: #8a8275;
	}

	.unit-detail {
		font-size: 0.625rem;
		color: #8a8275;
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}

	/* --- objectives dialog --- */
	.objectives {
		margin: auto;
		max-width: min(92vw, 26rem);
		width: 26rem;
		padding: 1.25rem;
		background: #15181c;
		color: #e8e1d1;
		border: 1px solid #3a3530;
		border-radius: 4px;
		box-shadow: 0 8px 32px rgba(0, 0, 0, 0.55);
	}
	.objectives::backdrop {
		background: rgba(0, 0, 0, 0.55);
	}
	.obj-title {
		margin: 0 0 0.25rem;
		font-size: 0.875rem;
		text-transform: uppercase;
		letter-spacing: 0.12em;
		font-weight: 600;
	}
	.obj-turn {
		margin: 0 0 0.75rem;
		font-size: 0.75rem;
		color: #8a8275;
		font-variant-numeric: tabular-nums;
	}
	.obj-list {
		list-style: none;
		margin: 0 0 1rem;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}
	.obj-item {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}
	.obj-row {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 0.5rem;
	}
	.obj-side {
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
	.obj-progress {
		font-size: 0.8125rem;
		font-variant-numeric: tabular-nums;
		color: #e8e1d1;
	}
	.obj-item[data-met='true'] .obj-progress {
		color: #8fbf6b;
		font-weight: 600;
	}
	.obj-desc {
		font-size: 0.75rem;
		color: #b8b0a0;
	}
	.obj-bar {
		height: 4px;
		background: #2a2722;
		border-radius: 2px;
		overflow: hidden;
	}
	.obj-bar-fill {
		height: 100%;
		background: #c9a227;
		transition: width 120ms ease;
	}
	.obj-item[data-met='true'] .obj-bar-fill {
		background: #8fbf6b;
	}
	.obj-close {
		width: 100%;
		max-width: none;
	}
</style>
