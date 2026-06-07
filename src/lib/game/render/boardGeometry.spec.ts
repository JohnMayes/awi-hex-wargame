import { describe, expect, it } from 'vitest';
import { Grid, type OffsetCoordinates } from 'honeycomb-grid';
import { HexCell } from '../core/hex';
import { TerrainType, UnitType, type Player, type Unit } from '../core/types';
import { unitDefinitions } from '../core/unitDefinitions';
import { hexPixelToWorld, worldToHexPixel, pickHex, pickUnit, type Point } from './boardGeometry';

// --- fixtures ---

function buildGrid(cols: number, rows: number): Grid<HexCell> {
	const cells: HexCell[] = [];
	for (let col = 0; col < cols; col++)
		for (let row = 0; row < rows; row++)
			cells.push(HexCell.create({ col, row, terrain: TerrainType.OPEN }));
	return new Grid(HexCell, cells);
}

function unit(id: string, coordinates: OffsetCoordinates, player: Player = 0): Unit {
	const def = unitDefinitions[UnitType.LINE_INFANTRY];
	return {
		id,
		type: UnitType.LINE_INFANTRY,
		player,
		coordinates,
		strengthPoints: def.defaultStrengthPoints,
		maxStrengthPoints: def.defaultStrengthPoints,
		selected: false,
		movementPointsUsed: 0,
		firedThisActivation: false,
		activated: false,
		elite: false
	};
}

/** World-space center of a hex (the flipped honeycomb pixel center). */
function centerWorld(grid: Grid<HexCell>, coords: OffsetCoordinates): Point {
	const hex = grid.getHex(coords)!;
	return hexPixelToWorld({ x: hex.x, y: hex.y });
}

/** The grid hex whose pixel center is closest to `hex` (edge-adjacent). */
function nearestNeighbor(grid: Grid<HexCell>, hex: HexCell): HexCell {
	let best: HexCell | null = null;
	let bestD = Infinity;
	for (const h of grid) {
		if (h.col === hex.col && h.row === hex.row) continue;
		const d = Math.hypot(h.x - hex.x, h.y - hex.y);
		if (d < bestD) {
			bestD = d;
			best = h;
		}
	}
	return best!;
}

// --- worldToHexPixel / hexPixelToWorld ---

describe('Y-flip conversion', () => {
	it('negates Y and preserves X in both directions', () => {
		expect(worldToHexPixel({ x: 10, y: 5 })).toEqual({ x: 10, y: -5 });
		expect(hexPixelToWorld({ x: 10, y: 5 })).toEqual({ x: 10, y: -5 });
		expect(worldToHexPixel({ x: -3, y: 2 })).toEqual({ x: -3, y: -2 });
	});

	it('round-trips world -> pixel -> world', () => {
		for (const p of [
			{ x: 0, y: 0 },
			{ x: 123.5, y: -47.25 },
			{ x: -800, y: 600 }
		]) {
			expect(hexPixelToWorld(worldToHexPixel(p))).toEqual(p);
			expect(worldToHexPixel(hexPixelToWorld(p))).toEqual(p);
		}
	});
});

// --- pickHex ---

describe('pickHex', () => {
	it('resolves each hex center (through the world round-trip) back to that hex', () => {
		const grid = buildGrid(3, 3);
		for (const hex of grid) {
			const picked = pickHex(centerWorld(grid, { col: hex.col, row: hex.row }), grid);
			expect(picked).not.toBeNull();
			expect({ col: picked!.col, row: picked!.row }).toEqual({ col: hex.col, row: hex.row });
		}
	});

	it('resolves points either side of a shared hexside to the correct hex', () => {
		const grid = buildGrid(3, 3);
		const a = grid.getHex({ col: 1, row: 1 })!;
		const b = nearestNeighbor(grid, a);

		// Pixel points 49% / 51% along the line between the two centers straddle
		// their shared edge (the midpoint lies on it).
		const lerp = (t: number): Point => ({ x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) });

		const nearA = pickHex(hexPixelToWorld(lerp(0.49)), grid);
		const nearB = pickHex(hexPixelToWorld(lerp(0.51)), grid);

		expect({ col: nearA!.col, row: nearA!.row }).toEqual({ col: a.col, row: a.row });
		expect({ col: nearB!.col, row: nearB!.row }).toEqual({ col: b.col, row: b.row });
	});

	it('returns null for an off-grid point', () => {
		const grid = buildGrid(3, 3);
		expect(pickHex({ x: 100000, y: 100000 }, grid)).toBeNull();
		expect(pickHex({ x: -100000, y: -100000 }, grid)).toBeNull();
	});
});

// --- pickUnit ---

describe('pickUnit', () => {
	it('returns the unit occupying the picked hex', () => {
		const grid = buildGrid(3, 3);
		const u = unit('u1', { col: 1, row: 1 });
		const picked = pickUnit(centerWorld(grid, { col: 1, row: 1 }), [u], grid);
		expect(picked).toBe(u);
	});

	it('distinguishes between units on different hexes', () => {
		const grid = buildGrid(3, 3);
		const a = unit('a', { col: 0, row: 0 });
		const b = unit('b', { col: 2, row: 2 }, 1);
		const units = [a, b];
		expect(pickUnit(centerWorld(grid, { col: 0, row: 0 }), units, grid)).toBe(a);
		expect(pickUnit(centerWorld(grid, { col: 2, row: 2 }), units, grid)).toBe(b);
	});

	it('returns null on an empty hex', () => {
		const grid = buildGrid(3, 3);
		const u = unit('u1', { col: 1, row: 1 });
		expect(pickUnit(centerWorld(grid, { col: 0, row: 0 }), [u], grid)).toBeNull();
	});

	it('returns null for an off-grid point', () => {
		const grid = buildGrid(3, 3);
		const u = unit('u1', { col: 1, row: 1 });
		expect(pickUnit({ x: 100000, y: 100000 }, [u], grid)).toBeNull();
	});
});
