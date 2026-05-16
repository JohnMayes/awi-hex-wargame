<script lang="ts">
	import { initGameStore } from '$lib/game/state/gameStore.svelte';
	import HexTile from '$lib/game/ui/HexTile.svelte';
	import UnitCounter from '$lib/game/ui/UnitCounter.svelte';
	import { TEST_MAP } from '$lib/game/data/maps';
	import { TEST_LEADERS, TEST_UNITS } from '$lib/game/data/scenarios';
	import { ActionType } from '$lib/game/core/types';
	import { getUnitDefinition } from '$lib/game/core/unitDefinitions';

	const store = initGameStore(TEST_UNITS, TEST_MAP, TEST_LEADERS);
	$inspect(store.log);

	const sel = $derived(store.selectedUnit);
	const def = $derived(sel ? getUnitDefinition(sel.type) : null);

	const moveEnabled = $derived.by(() => {
		if (!sel || !def) return false;
		if (def.actionType === ActionType.MOVE_OR_FIRE && sel.firedThisActivation) return false;
		if (sel.movementPointsUsed >= def.movementAllowance) return false;
		if (def.actionType === ActionType.MOVE_OR_FIRE && store.actionMode === 'fire') return false;
		return true;
	});

	const fireEnabled = $derived.by(() => {
		if (!sel || !def) return false;
		if (def.firingRange === 0) return false;
		if (sel.firedThisActivation) return false;
		if (def.actionType === ActionType.MOVE_OR_FIRE) {
			if (sel.movementPointsUsed > 0) return false;
			if (store.actionMode === 'move') return false;
		}
		return true;
	});

	const validKeys = $derived(
		new Set(store.validMoveTargets.map((t) => `${t.coordinates.col},${t.coordinates.row}`))
	);
	const fireTargetIds = $derived(new Set(store.validFireTargets.map((u) => u.id)));
	const chargeTargetIds = $derived(new Set(store.validChargeTargets.map((u) => u.id)));

	const allPoints = [...store.grid!].flatMap((hex) => hex.corners);

	const xs = allPoints.map((p) => p.x);
	const ys = allPoints.map((p) => p.y);

	const minX = Math.min(...xs);
	const maxX = Math.max(...xs);
	const minY = Math.min(...ys);
	const maxY = Math.max(...ys);

	const width = maxX - minX;
	const height = maxY - minY;

	const padding = 2;
</script>

<div class="container">
	<header class="top-bar">
		<div class="meta">
			<span class="meta-label">Turn</span>
			<span class="meta-value">{store.turn}</span>
			<span class="player-chip" data-player={store.activePlayer}
				>{store.activePlayer === 0 ? 'Blue' : 'Red'}</span
			>
		</div>
		<button class="end-turn" onclick={() => store.endPlayerTurn()}>End Turn</button>
	</header>

	<svg
		viewBox={`${minX - padding} ${minY - padding} ${width + padding * 2} ${height + padding * 2}`}
		preserveAspectRatio="xMidYMid meet"
	>
		{#each store.grid as Hex, i (`${Hex.q},${Hex.r}`)}
			<HexTile
				cell={Hex}
				highlighted={validKeys.has(`${Hex.col},${Hex.row}`)}
				onClick={() => store.moveUnit({ col: Hex.col, row: Hex.row })}
			/>
		{/each}
		{#each store.units as unit, i (unit.id)}
			{@const pos = store.takesCordsReturnsPos(unit.coordinates)}
			<UnitCounter
				{unit}
				pos={pos!}
				fireTarget={fireTargetIds.has(unit.id)}
				chargeTarget={chargeTargetIds.has(unit.id)}
				onClick={() => {
					if (unit.player === store.activePlayer) {
						store.selectUnit(unit);
					} else if (fireTargetIds.has(unit.id)) {
						store.fireAt(unit.id);
					} else if (chargeTargetIds.has(unit.id)) {
						store.chargeAt(unit.id);
					}
				}}
			/>
		{/each}
	</svg>

	<footer class="bottom-bar">
		{#if sel && def}
			<div class="unit-readout">
				<span class="unit-label">{store.activeUnitId === sel.id ? 'Activating' : 'Selected'}</span>
				<span class="unit-name">{sel.type.toLowerCase().replace(/_/g, ' ')}</span>
			</div>
			<div class="actions">
				<button class="action" disabled={!moveEnabled} onclick={() => store.beginAction('move')}
					>Move</button
				>
				{#if def.firingRange > 0}
					<button class="action" disabled={!fireEnabled} onclick={() => store.beginAction('fire')}
						>Fire</button
					>
				{/if}
			</div>
		{:else}
			<span class="prompt">Tap a unit to select</span>
		{/if}
	</footer>
</div>

<style>
	:global(body) {
		margin: 0;
		font-family: 'IBM Plex Sans', system-ui, sans-serif;
	}

	.container {
		display: flex;
		flex-direction: column;
		width: 100vw;
		height: 100vh; /* fallback for older browsers */
		height: 100dvh; /* preferred: avoids iOS Safari URL-bar layout thrash */
	}

	svg {
		flex: 1;
		display: block;
		background-color: cadetblue;
		min-height: 0; /* required so flex shrinks correctly */
		touch-action: manipulation; /* drop the 300ms iOS tap delay */
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
	.end-turn:hover {
		background: transparent;
		color: #e8e1d1;
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
</style>
