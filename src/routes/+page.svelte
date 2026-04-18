<script lang="ts">
	import { initGameStore } from '$lib/game/state/gameStore.svelte';
	import HexTile from '$lib/game/ui/HexTile.svelte';
	import UnitCounter from '$lib/game/ui/UnitCounter.svelte';
	import { TEST_MAP } from '$lib/game/data/maps';
	import { TEST_UNITS } from '$lib/game/data/scenarios';
	import { ActivationStep } from '$lib/game/core/types';

	const store = initGameStore(TEST_UNITS, TEST_MAP);

	const canActivate = $derived(
		store.activationStep === ActivationStep.AWAITING_ACTIVATION &&
			store.selectedUnit !== undefined &&
			store.selectedUnit.player === store.activePlayer &&
			!store.selectedUnit.activated
	);
	const canCompleteAction = $derived(store.activationStep === ActivationStep.ACTION);
	const canEndActivation = $derived(store.activationStep === ActivationStep.ACTIVATION_COMPLETE);
	const canEndPlayerTurn = $derived(store.activationStep === ActivationStep.AWAITING_ACTIVATION);

	const validKeys = $derived(
		new Set(store.validMoveTargets.map((t) => `${t.coordinates.col},${t.coordinates.row}`))
	);

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
			<!-- Render counter here -->
			<UnitCounter
				{unit}
				pos={pos!}
				changeFacing={(facing) => store.changeFacing(facing)}
				onClick={() => store.toggleUnit(unit)}
			/>
		{/each}
	</svg>
	<div style="position: absolute; top: 0; left: 0;">
		<p>Active Player: {store.activePlayer}</p>
		<p>Turn Number: {store.turn}</p>
		<p>Activation Step: {store.activationStep}</p>
		<p>Active Unit: {store.activeUnitId ?? '—'}</p>
		<button
			disabled={!canActivate}
			onclick={() => store.selectedUnit && store.activateUnit(store.selectedUnit.id)}
		>
			Activate Selected
		</button>
		<button disabled={!canCompleteAction} onclick={() => store.completeAction()}>
			Complete Action
		</button>
		<button disabled={!canEndActivation} onclick={() => store.endActivation()}>
			End Activation
		</button>
		<button disabled={!canEndPlayerTurn} onclick={() => store.endPlayerTurn()}>
			End Player Turn
		</button>
	</div>
</div>

<style>
	svg {
		width: 100vw;
		height: 100vh;
		display: block;
		background-color: cadetblue;
	}

	rect {
		transition: all 0.1s ease-in;
	}

	.container {
		position: relative;
		display: flex;
		width: 100%;
		height: 98vh;
		align-items: center;
		justify-content: center;
	}
</style>
