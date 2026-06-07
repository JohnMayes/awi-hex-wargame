import { type Grid } from 'honeycomb-grid';
import { HexCell, coordsEqual } from '../core/hex';
import type { Unit } from '../core/types';

/**
 * Coordinate-space bridge between LittleJS world space and honeycomb-grid pixel
 * space, plus hit-testing (world point -> hex/unit).
 *
 * Pure and renderer-agnostic: takes plain `{ x, y }` points (a LittleJS
 * `Vector2` satisfies this structurally) and never imports the engine, so it is
 * unit-tested in Node without a browser. The render layer wraps the results in
 * `vec2(...)` at the call site.
 */
export type Point = { x: number; y: number };

/**
 * honeycomb-grid pixel space is Y-down (topLeft origin); LittleJS world space is
 * Y-up. Negating Y is the *entire* bridge — there is no camera offset, because
 * LittleJS's camera transform already yields world-space `mousePos`, and we draw
 * hexes at the flipped honeycomb coordinates. The two functions are inverses
 * (each is its own involution).
 */
export function hexPixelToWorld(pixel: Point): Point {
	return { x: pixel.x, y: -pixel.y };
}

export function worldToHexPixel(world: Point): Point {
	return { x: world.x, y: -world.y };
}

/** World-space point -> the hex under it, or null if outside the grid. */
export function pickHex(world: Point, grid: Grid<HexCell>): HexCell | null {
	return grid.pointToHex(worldToHexPixel(world), { allowOutside: false }) ?? null;
}

/** World-space point -> the unit occupying that hex, or null if none/off-grid. */
export function pickUnit(world: Point, units: Unit[], grid: Grid<HexCell>): Unit | null {
	const hex = pickHex(world, grid);
	if (!hex) return null;
	return units.find((u) => coordsEqual(u.coordinates, { col: hex.col, row: hex.row })) ?? null;
}
