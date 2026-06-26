import { TerrainType } from '../core/types';

/** Normalized RGB in 0..1 (the range LittleJS's `rgb(r,g,b)` expects). */
export type Rgb = { r: number; g: number; b: number };

/**
 * Terrain fill palette — the canonical per-terrain board colors. Engine-free and
 * pure so it is unit-tested in Node; the render layer converts to a LittleJS
 * `Color` via `rgb(...)` at the draw call.
 */
export const terrainHexColors: Record<TerrainType, string> = {
	[TerrainType.OPEN]: '#d9cbb2',
	[TerrainType.WOODS]: '#7f9a76',
	[TerrainType.TOWN]: '#bfa58c',
	[TerrainType.MARSH]: '#8ea88f',
	[TerrainType.LAKE]: '#7fa3b8',
	[TerrainType.RIVER]: '#6f95ad',
	[TerrainType.FORD]: '#a9b7b5',
	[TerrainType.BRIDGE]: '#a48f7a',
	[TerrainType.HILLTOP]: '#b6a87f',
	[TerrainType.BURNED]: '#3a3330'
};

/** Hex border color (black). */
export const hexStrokeHex = '#000000';

/** Road stroke color — a dirt track drawn over the hex's real terrain. */
export const roadStrokeHex = '#8a6d3b';

/** Parse a `#rrggbb` string into normalized 0..1 RGB. */
export function hexToRgb(hex: string): Rgb {
	const int = parseInt(hex.replace('#', ''), 16);
	return {
		r: ((int >> 16) & 255) / 255,
		g: ((int >> 8) & 255) / 255,
		b: (int & 255) / 255
	};
}

/** Normalized 0..1 fill color for a terrain type. */
export function terrainFill(terrain: TerrainType): Rgb {
	return hexToRgb(terrainHexColors[terrain]);
}
