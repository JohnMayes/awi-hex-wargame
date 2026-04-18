<script lang="ts">
	import { HexFacing, UnitType, type Unit } from '../core/types';

	type Props = {
		unit: Unit;
		pos: { x: number; y: number };
		onClick: () => void;
		changeFacing: (facing: HexFacing) => void;
	};

	let { unit, pos, onClick, changeFacing }: Props = $props();

	const SIZE = 80;
	const HALF = SIZE / 2;

	function rotateLeft(facing: HexFacing) {
		if (facing === HexFacing.N) {
			changeFacing(HexFacing.NW);
		} else {
			const newFacing: HexFacing = facing - 60;
			changeFacing(newFacing);
		}
	}

	function rotateRight(facing: HexFacing) {
		if (facing === HexFacing.NW) {
			changeFacing(HexFacing.N);
		} else {
			const newFacing: HexFacing = facing + 60;
			changeFacing(newFacing);
		}
	}

	// keyboard movement
	function handleKeyDown(e: KeyboardEvent) {
		if (!unit.selected) return;
		switch (e.key) {
			case 'Enter':
				onClick?.();
				break;
			case 'ArrowRight':
				rotateRight(unit.facing);
				break;
			case 'ArrowLeft':
				rotateLeft(unit.facing);
				break;
		}
	}

	let rotation = $state(unit.facing);

	$effect(() => {
		const target = unit.facing;
		const current = ((rotation % 360) + 360) % 360;
		let delta = target - current;
		if (delta > 180) delta -= 360;
		if (delta < -180) delta += 360;
		rotation += delta;
	});
</script>

<svelte:window onkeydown={handleKeyDown} />

<g
	transform="translate({pos.x},{pos.y}) rotate({rotation})"
	style="transition: transform 0.1s ease-in; outline: none"
	onclick={onClick}
	role="button"
	tabindex="0"
	aria-label="{unit.type}, {unit.id}"
	onkeydown={(e) => null}
	class="counter-base"
>
	<rect
		width={SIZE}
		height={SIZE}
		x={-HALF}
		y={-HALF}
		fill={unit.player === 0 ? '#1a56db' : '#e02424'}
		stroke={unit.selected ? 'gold' : 'transparent'}
		stroke-width={2}
		rx={8}
	/>
	{#if unit.type === UnitType.LINE_INFANTRY}
		{@render lineInfantry()}
	{:else if unit.type === UnitType.LIGHT_INFANTRY}
		{@render lightInfantry()}
	{:else if unit.type === UnitType.DRAGOONS}
		{@render dragoons()}
	{:else if unit.type === UnitType.LIGHT_HORSE}
		{@render lightHorse()}
	{:else if unit.type === UnitType.HORSE}
		{@render horse()}
	{:else if unit.type === UnitType.ARTILLERY}
		{@render artillery()}
	{/if}
</g>

{#snippet lineInfantry()}
	<svg
		x={(-HALF * 5) / 6}
		y={(-HALF * 5) / 6}
		width={(SIZE * 5) / 6}
		height={(SIZE * 5) / 6}
		viewBox="0 0 600 400"
		overflow="visible"
	>
		<g stroke="#010203">
			<rect
				x="6"
				y="6"
				width="588"
				height="388"
				rx="0"
				stroke-width="22"
				stroke-linejoin="miter"
				fill="none"
			/>
			<line x1="6" y1="6" x2="594" y2="394" stroke-width="22" stroke-linecap="butt" />
			<line x1="594" y1="6" x2="6" y2="394" stroke-width="22" stroke-linecap="butt" />
		</g>
	</svg>
{/snippet}

{#snippet lightInfantry()}
	<svg x={-HALF} y={-HALF} width={SIZE} height={SIZE} viewBox="0 0 600 400" overflow="visible">
		<g stroke="#010203" fill="none">
			<rect
				x="6"
				y="6"
				width="588"
				height="388"
				stroke-width="22"
				stroke-linejoin="miter"
				stroke-dasharray="60 28"
			/>
			<line x1="6" y1="6" x2="594" y2="394" stroke-width="22" stroke-linecap="butt" />
			<line x1="594" y1="6" x2="6" y2="394" stroke-width="22" stroke-linecap="butt" />
		</g>
	</svg>
{/snippet}

{#snippet dragoons()}
	<svg x={-HALF} y={-HALF} width={SIZE} height={SIZE} viewBox="0 0 600 400" overflow="visible">
		<g stroke="#010203">
			<rect
				x="6"
				y="6"
				width="588"
				height="388"
				fill="none"
				stroke-width="22"
				stroke-linejoin="miter"
			/>
			<line x1="6" y1="394" x2="594" y2="6" stroke-width="22" stroke-linecap="butt" />
			<circle
				cx="300"
				cy="200"
				r="110"
				fill={unit.player === 0 ? '#1a56db' : '#e02424'}
				stroke="none"
			/>
		</g>
	</svg>
{/snippet}

{#snippet lightHorse()}
	<svg x={-HALF} y={-HALF} width={SIZE} height={SIZE} viewBox="0 0 600 400" overflow="visible">
		<g stroke="#010203" fill="none">
			<rect x="6" y="6" width="588" height="388" stroke-width="22" stroke-linejoin="miter" />
			<line x1="6" y1="394" x2="594" y2="6" stroke-width="22" stroke-linecap="butt" />
		</g>
	</svg>
{/snippet}

{#snippet horse()}
	<svg x={-HALF} y={-HALF} width={SIZE} height={SIZE} viewBox="0 0 600 400" overflow="visible">
		<g stroke="#010203" fill="none">
			<rect x="6" y="6" width="588" height="388" stroke-width="22" stroke-linejoin="miter" />
			<line x1="6" y1="394" x2="594" y2="6" stroke-width="22" stroke-linecap="butt" />
			<line x1="6" y1="200" x2="594" y2="200" stroke-width="22" stroke-linecap="butt" />
		</g>
	</svg>
{/snippet}

{#snippet artillery()}
	{@const cx = 300}
	{@const cy = 200}
	{@const r = 110}
	<svg x={-HALF} y={-HALF} width={SIZE} height={SIZE} viewBox="0 0 600 400" overflow="visible">
		<g stroke="#010203">
			<rect
				x="6"
				y="6"
				width="588"
				height="388"
				fill="none"
				stroke-width="22"
				stroke-linejoin="miter"
			/>
			<circle {cx} {cy} {r} fill={unit.player === 0 ? '#1a56db' : '#e02424'} stroke="none" />
		</g>
	</svg>
{/snippet}
