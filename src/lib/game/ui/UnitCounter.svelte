<script lang="ts">
	import { UnitType, type Unit } from '../core/types';

	type Props = {
		unit: Unit;
		pos: { x: number; y: number };
		onClick: () => void;
		fireTarget?: boolean;
		chargeTarget?: boolean;
	};

	let { unit, pos, onClick, fireTarget = false, chargeTarget = false }: Props = $props();

	const SIZE = 80;
	const HALF = SIZE / 2;

	function handleKeyDown(e: KeyboardEvent) {
		if (!unit.selected) return;
		if (e.key === 'Enter') onClick?.();
	}
</script>

<svelte:window onkeydown={handleKeyDown} />

<g transform="translate({pos.x},{pos.y})">
	{#if fireTarget}
		<circle
			r={SIZE * 0.7}
			cx="0"
			cy="0"
			fill="none"
			stroke="#cc2222"
			stroke-width="3"
			pointer-events="none"
		/>
	{/if}
	{#if chargeTarget}
		<circle
			r={SIZE * 0.78}
			cx="0"
			cy="0"
			fill="none"
			stroke="#e87722"
			stroke-width="3"
			pointer-events="none"
		/>
	{/if}
	<g
		style="outline: none"
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
