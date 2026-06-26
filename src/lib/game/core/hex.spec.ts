import { describe, expect, it } from 'vitest';
import { Grid } from 'honeycomb-grid';
import {
	coordsEqual,
	HexCell,
	hexDistance,
	getNeighbors,
	directions,
	edgeToward,
	isEntrenchedToward,
	roadConnects
} from './hex';
import { TerrainType } from './types';

function openGrid(cols: number, rows: number): Grid<HexCell> {
	const cells: HexCell[] = [];
	for (let col = 0; col < cols; col++)
		for (let row = 0; row < rows; row++)
			cells.push(HexCell.create({ col, row, terrain: TerrainType.OPEN }));
	return new Grid(HexCell, cells);
}

/** The hex at cube (base + steps·directions[dir]), or undefined if off-grid. */
function cubeNeighbor(
	grid: Grid<HexCell>,
	base: HexCell,
	dir: number,
	steps = 1
): HexCell | undefined {
	const [dq, dr] = directions[dir];
	for (const hex of grid)
		if (hex.q === base.q + steps * dq && hex.r === base.r + steps * dr) return hex;
	return undefined;
}

describe('coordsEqual', () => {
	it('returns true for matching coordinates', () => {
		expect.assertions(1);
		expect(coordsEqual({ col: 0, row: 0 }, { col: 0, row: 0 })).toBe(true);
	});

	it('returns false when col differs', () => {
		expect.assertions(1);
		expect(coordsEqual({ col: 0, row: 0 }, { col: 1, row: 0 })).toBe(false);
	});

	it('returns false when row differs', () => {
		expect.assertions(1);
		expect(coordsEqual({ col: 0, row: 0 }, { col: 0, row: 1 })).toBe(false);
	});

	it('returns false when both differ', () => {
		expect.assertions(1);
		expect(coordsEqual({ col: 2, row: 3 }, { col: 4, row: 5 })).toBe(false);
	});
});

describe('HexCell.elevation', () => {
	it('returns 1 for HILLTOP', () => {
		expect.assertions(1);
		expect(HexCell.create({ col: 0, row: 0, terrain: TerrainType.HILLTOP }).elevation).toBe(1);
	});

	it('returns 0 for OPEN', () => {
		expect.assertions(1);
		expect(HexCell.create({ col: 0, row: 0, terrain: TerrainType.OPEN }).elevation).toBe(0);
	});

	it('returns 0 for WOODS', () => {
		expect.assertions(1);
		expect(HexCell.create({ col: 0, row: 0, terrain: TerrainType.WOODS }).elevation).toBe(0);
	});

	it('returns 0 for TOWN', () => {
		expect.assertions(1);
		expect(HexCell.create({ col: 0, row: 0, terrain: TerrainType.TOWN }).elevation).toBe(0);
	});

	it('returns 0 for MARSH', () => {
		expect.assertions(1);
		expect(HexCell.create({ col: 0, row: 0, terrain: TerrainType.MARSH }).elevation).toBe(0);
	});
});

describe('HexCell.entrenchedEdges', () => {
	it('defaults to an empty set', () => {
		expect.assertions(1);
		const cell = HexCell.create({ col: 0, row: 0, terrain: TerrainType.OPEN });
		expect(cell.entrenchedEdges.size).toBe(0);
	});

	it('stores provided edges as a set', () => {
		expect.assertions(2);
		const cell = HexCell.create({
			col: 0,
			row: 0,
			terrain: TerrainType.OPEN,
			entrenchedEdges: [1, 4]
		});
		expect(cell.entrenchedEdges.has(1)).toBe(true);
		expect(cell.entrenchedEdges.has(0)).toBe(false);
	});
});

describe('edgeToward', () => {
	it('returns the direction index of each immediate neighbor', () => {
		expect.assertions(6);
		const grid = openGrid(7, 7);
		const center = grid.getHex({ col: 3, row: 3 })!;
		for (let d = 0; d < 6; d++) {
			expect(edgeToward(center, cubeNeighbor(grid, center, d)!)).toBe(d);
		}
	});

	it('picks the aligned edge for a distant (multi-hex) bearing', () => {
		expect.assertions(1);
		const grid = openGrid(9, 9);
		const center = grid.getHex({ col: 4, row: 4 })!;
		expect(edgeToward(center, cubeNeighbor(grid, center, 0, 2)!)).toBe(0);
	});
});

describe('isEntrenchedToward', () => {
	it('is true only when the facing edge is entrenched (directional)', () => {
		expect.assertions(2);
		const grid = openGrid(7, 7);
		const center = grid.getHex({ col: 3, row: 3 })!;
		// Defender entrenched on edge 0; same col/row (so same cube coords) as `center`.
		const defender = HexCell.create({
			col: 3,
			row: 3,
			terrain: TerrainType.OPEN,
			entrenchedEdges: [0]
		});
		expect(isEntrenchedToward(defender, cubeNeighbor(grid, center, 0)!)).toBe(true);
		expect(isEntrenchedToward(defender, cubeNeighbor(grid, center, 3)!)).toBe(false);
	});
});

describe('roadConnects', () => {
	it('is true only when both hexes list the shared edge (symmetric)', () => {
		expect.assertions(3);
		const grid = openGrid(7, 7);
		const center = grid.getHex({ col: 3, row: 3 })!;
		const nb = cubeNeighbor(grid, center, 0)!; // edgeToward(center, nb) === 0; reciprocal 3
		const road = (c: HexCell, edges: number[]) =>
			HexCell.create({ col: c.col, row: c.row, terrain: TerrainType.OPEN, roadEdges: edges });
		expect(roadConnects(road(center, [0]), road(nb, [3]))).toBe(true);
		expect(roadConnects(road(center, [0]), road(nb, [0]))).toBe(false); // nb lacks reciprocal
		expect(roadConnects(road(center, [1]), road(nb, [3]))).toBe(false); // from lacks facing edge
	});
});
