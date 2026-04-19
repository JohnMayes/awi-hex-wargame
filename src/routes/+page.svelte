<script lang="ts">
	import { initGameStore } from '$lib/game/state/gameStore.svelte';
	import HexTile from '$lib/game/ui/HexTile.svelte';
	import UnitCounter from '$lib/game/ui/UnitCounter.svelte';
	import { TEST_MAP } from '$lib/game/data/maps';
	import { TEST_UNITS } from '$lib/game/data/scenarios';
	import { ActionType } from '$lib/game/core/types';
	import { getUnitDefinition } from '$lib/game/core/unitDefinitions';

	const store = initGameStore(TEST_UNITS, TEST_MAP);

	const sel = $derived(store.selectedUnit);
	const def = $derived(sel ? getUnitDefinition(sel.type) : null);

	const moveEnabled = $derived.by(() => {
		if (!sel || !def) return false;
		if (def.actionType === ActionType.MOVE_OR_FIRE && sel.firedThisActivation) return false;
		if (sel.movementPointsUsed >= def.movementAllowance && sel.facingStepsUsed >= 2) return false;
		if (def.actionType === ActionType.MOVE_OR_FIRE && store.actionMode === 'fire') return false;
		return true;
	});

	const fireEnabled = $derived.by(() => {
		if (!sel || !def) return false;
		if (def.firingRange === 0) return false;
		if (sel.firedThisActivation) return false;
		if (def.actionType === ActionType.MOVE_OR_FIRE) {
			if (sel.movementPointsUsed > 0 || sel.facingStepsUsed > 0) return false;
			if (store.actionMode === 'move' || store.actionMode === 'rotate') return false;
		}
		return true;
	});

	const rotateEnabled = $derived.by(() => {
		if (!sel || !def || !def.hasFacing) return false;
		if (sel.facingStepsUsed >= 2) return false;
		if (def.actionType === ActionType.MOVE_OR_FIRE) {
			if (sel.firedThisActivation) return false;
			if (store.actionMode === 'fire') return false;
		}
		return true;
	});

	const validKeys = $derived(
		new Set(store.validMoveTargets.map((t) => `${t.coordinates.col},${t.coordinates.row}`))
	);
	const fireTargetIds = $derived(new Set(store.validFireTargets.map((u) => u.id)));

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
				rotateMode={store.actionMode === 'rotate' && unit.selected}
				changeFacing={(facing) => store.changeFacing(facing)}
				onClick={() => {
					if (unit.player === store.activePlayer) {
						store.selectUnit(unit);
					} else if (fireTargetIds.has(unit.id)) {
						store.fireAt(unit.id);
					}
				}}
			/>
		{/each}
	</svg>
	<footer class="action-bar">
		<div class="meta">
			<span class="meta-label">Turn</span>
			<span class="meta-value">{store.turn}</span>
			<span class="meta-divider"></span>
			<span class="meta-label">Player</span>
			<span class="player-chip" data-player={store.activePlayer}
				>{store.activePlayer === 0 ? 'Blue' : 'Red'}</span
			>
		</div>

		<div class="action-zone">
			{#if sel && def}
				<div class="unit-readout">
					<span class="unit-label"
						>{store.activeUnitId === sel.id ? 'Activating' : 'Selected'}</span
					>
					<span class="unit-name">{sel.type.toLowerCase().replace(/_/g, ' ')}</span>
				</div>
				<div class="branches">
					<button class="branch" disabled={!moveEnabled} onclick={() => store.beginAction('move')}
						>Move</button
					>
					{#if def.firingRange > 0}
						<button class="branch" disabled={!fireEnabled} onclick={() => store.beginAction('fire')}
							>Fire</button
						>
					{/if}
					{#if def.hasFacing}
						<button
							class="branch"
							disabled={!rotateEnabled}
							onclick={() => store.beginAction('rotate')}>Rotate</button
						>
					{/if}
				</div>
			{:else}
				<span class="prompt">Click a unit to select</span>
			{/if}
		</div>

		<div class="end-turn-zone">
			<button class="end-turn" onclick={() => store.endPlayerTurn()}>End Turn</button>
		</div>
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
		height: 100vh;
	}

	svg {
		flex: 1;
		display: block;
		background-color: cadetblue;
		min-height: 0; /* required so flex shrinks correctly */
	}

	.action-bar {
		display: grid;
		grid-template-columns: 1fr auto 1fr;
		align-items: center;
		gap: 2rem;
		padding: 0.75rem 1.5rem;
		background: #15181c;
		color: #e8e1d1;
		border-top: 1px solid #3a3530;
		font-size: 0.8125rem;
	}

	/* --- meta (left) --- */
	.meta {
		display: flex;
		align-items: center;
		gap: 0.625rem;
		justify-self: start;
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
	.meta-divider {
		width: 1px;
		height: 0.875rem;
		background: #3a3530;
		margin: 0 0.25rem;
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

	/* --- action zone (center) --- */
	.action-zone {
		display: flex;
		align-items: center;
		gap: 1.25rem;
		justify-self: center;
	}
	.unit-readout {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		line-height: 1.1;
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
	}
	.prompt {
		color: #8a8275;
		font-style: italic;
		font-size: 0.8125rem;
	}

	/* --- branch buttons (ghost outline) --- */
	.branches {
		display: flex;
		gap: 0.375rem;
	}
	.branch {
		appearance: none;
		background: transparent;
		color: #e8e1d1;
		border: 1px solid #3a3530;
		padding: 0.4375rem 0.875rem;
		font: inherit;
		font-size: 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.1em;
		font-weight: 500;
		cursor: pointer;
		border-radius: 2px;
		transition:
			background 80ms ease,
			border-color 80ms ease,
			color 80ms ease;
	}
	.branch:hover:not(:disabled) {
		background: #e8e1d1;
		color: #15181c;
		border-color: #e8e1d1;
	}
	.branch:disabled {
		opacity: 0.3;
		cursor: not-allowed;
	}

	/* --- end turn (right) --- */
	.end-turn-zone {
		justify-self: end;
	}
	.end-turn {
		appearance: none;
		background: #e8e1d1;
		color: #15181c;
		border: 1px solid #e8e1d1;
		padding: 0.4375rem 0.875rem;
		font: inherit;
		font-size: 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.1em;
		font-weight: 600;
		cursor: pointer;
		border-radius: 2px;
		transition:
			background 80ms ease,
			color 80ms ease;
	}
	.end-turn:hover {
		background: transparent;
		color: #e8e1d1;
	}
</style>
