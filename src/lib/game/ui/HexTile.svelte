<script lang="ts">
	import { HexCell } from '../core/hex';
	import { TerrainType } from '../core/types';
	type Props = {
		cell: HexCell;
		onClick: () => void;
	};

	let { cell, onClick }: Props = $props();

	const terrainColors: Record<TerrainType, string> = {
		open: '#d9cbb2',
		woods: '#7f9a76',
		town: '#bfa58c',
		marsh: '#8ea88f',
		lake: '#7fa3b8',
		river: '#6f95ad',
		ford: '#a9b7b5',
		bridge: '#a48f7a',
		road: '#c8b79c',
		hilltop: '#b6a87f'
	};

	let fillColor = $derived(terrainColors[cell.terrain]);
</script>

<polygon
	role="listitem"
	points={cell.corners.map(({ x, y }) => `${x},${y}`).join(' ')}
	fill={fillColor}
	stroke="black"
	onclick={onClick}
/>

<style>
	polygon {
		transition: filter 0.5s;
	}
	polygon:hover {
		filter: brightness(1.1);
	}
</style>
