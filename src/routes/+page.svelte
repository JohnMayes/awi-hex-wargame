<script lang="ts">
	import { initGameStore } from '$lib/game/state/gameStore.svelte';
	import LittleBoard from '$lib/game/render/LittleBoard.svelte';
	import { PITCHED_BATTLE } from '$lib/game/data/scenarios';
	import { fade } from 'svelte/transition';

	const store = initGameStore(PITCHED_BATTLE);
	$inspect(store.log);

	// Pointer-events discipline for the LJS chrome overlay: stop chrome presses from
	// bubbling to `document`, where LittleJS's input listeners would otherwise record
	// them as a board click. The engine listens for `mousedown`/`touchstart` (never
	// `pointerdown`); the button's own `onclick` is a separate event and still fires.
	// An attachment (not inline handlers) keeps the static container free of a11y warnings.
	function swallowPointer(node: HTMLElement) {
		const stop = (e: Event) => e.stopPropagation();
		node.addEventListener('mousedown', stop);
		node.addEventListener('touchstart', stop);
		return () => {
			node.removeEventListener('mousedown', stop);
			node.removeEventListener('touchstart', stop);
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

	// Transient notice toast — auto-dismiss a couple seconds after it appears.
	let noticeTimer: ReturnType<typeof setTimeout> | undefined;
	$effect(() => {
		if (!store.notice) return;
		clearTimeout(noticeTimer);
		noticeTimer = setTimeout(() => {
			store.notice = null;
		}, 2500);
		return () => clearTimeout(noticeTimer);
	});
</script>

{#snippet topBar()}
	<header class="top-bar">
		<div class="meta">
			<span class="meta-label">Turn</span>
			<span class="meta-value">{store.turn} / {store.turnLimit ?? '∞'}</span>
			<span class="player-chip" data-player={store.activePlayer}
				>{store.activePlayer === 0 ? 'Blue' : 'Red'}</span
			>
			<span class="meta-label">Acted</span>
			<span class="meta-value">{actedUnits} / {totalUnits}</span>
		</div>
		<button class="end-turn" onclick={() => store.endPlayerTurn()} disabled={store.isGameOver}
			>End Turn</button
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
			</div>

			{#if pending}
				<div class="pending">
					{#if pending.kind === 'move'}
						<span class="pending-label">Move here · cost {pending.cost}</span>
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
	{#if store.notice}
		{#key store.notice.id}
			<div class="notice" transition:fade>{store.notice.text}</div>
		{/key}
	{/if}
</div>

<style>
	:global(body) {
		margin: 0;
		font-family: 'IBM Plex Sans', system-ui, sans-serif;
	}

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
		background: #e8e1d1;
		color: #15181c;
		border: 1px solid #e8e1d1;
		padding: 0.5rem 0.875rem;
		font: inherit;
		font-size: 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.1em;
		font-weight: 600;
		cursor: pointer;
		border-radius: 2px;
		min-height: 44px;
		transition:
			background 80ms ease,
			color 80ms ease;
	}
	.end-turn:hover:not(:disabled) {
		background: transparent;
		color: #e8e1d1;
	}
	.end-turn:disabled {
		opacity: 0.3;
		cursor: not-allowed;
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

	/* --- transient notice toast (fades in/out over the board) --- */
	.notice {
		position: absolute;
		left: 50%;
		bottom: calc(96px + env(safe-area-inset-bottom));
		transform: translateX(-50%);
		max-width: min(90vw, 28rem);
		padding: 0.625rem 1rem;
		background: #15181c;
		color: #e8e1d1;
		border: 1px solid #c9a227;
		border-radius: 3px;
		font-size: 0.8125rem;
		text-align: center;
		letter-spacing: 0.04em;
		box-shadow: 0 4px 16px rgba(0, 0, 0, 0.45);
		pointer-events: none;
	}
</style>
