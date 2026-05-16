import { describe, expect, it } from 'vitest';
import { Grid, type OffsetCoordinates } from 'honeycomb-grid';
import { getRetreatHex } from './retreat';
import { HexCell, coordsEqual, directions } from './hex';
import { TerrainType, UnitType, type Player, type Unit } from './types';
import { unitDefinitions } from './unitDefinitions';

type Layout = { col: number; row: number; terrain: TerrainType };

function buildGrid(layout: Layout[]): Grid<HexCell> {
	return new Grid(
		HexCell,
		layout.map((c) => HexCell.create({ col: c.col, row: c.row, terrain: c.terrain }))
	);
}

function openRect(cols: number, rows: number, terrain = TerrainType.OPEN): Layout[] {
	const out: Layout[] = [];
	for (let col = 0; col < cols; col++)
		for (let row = 0; row < rows; row++) out.push({ col, row, terrain });
	return out;
}

function buildCubeToOffset(grid: Grid<HexCell>): Map<string, OffsetCoordinates> {
	const m = new Map<string, OffsetCoordinates>();
	for (const hex of grid) m.set(`${hex.q},${hex.r}`, { col: hex.col, row: hex.row });
	return m;
}

function neighborOffset(
	grid: Grid<HexCell>,
	coords: OffsetCoordinates,
	dirIdx: number
): OffsetCoordinates | null {
	const hex = grid.getHex(coords);
	if (!hex) return null;
	const cubeMap = buildCubeToOffset(grid);
	const [dq, dr] = directions[dirIdx];
	return cubeMap.get(`${hex.q + dq},${hex.r + dr}`) ?? null;
}

function unit(id: string, type: UnitType, player: Player, coordinates: OffsetCoordinates): Unit {
	const def = unitDefinitions[type];
	return {
		id,
		type,
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

describe('getRetreatHex — direction', () => {
	it('retreats opposite the attacker direction in clear open terrain', () => {
		expect.assertions(1);
		const grid = buildGrid(openRect(5, 5));
		const center = { col: 2, row: 2 };
		const defender = unit('d', UnitType.LINE_INFANTRY, 1, center);
		// Attacker at direction 3 (W); push direction is dir 3's opposite (dir 0, E)
		const attackerOrigin = neighborOffset(grid, center, 3)!;
		const result = getRetreatHex(defender, attackerOrigin, grid, [defender]);
		const expected = neighborOffset(grid, center, 0);
		expect(result).toEqual(expected);
	});

	it('produces correct retreat direction for each of 6 attacker positions', () => {
		expect.assertions(6);
		const grid = buildGrid(openRect(7, 7));
		const center = { col: 3, row: 3 };
		const defender = unit('d', UnitType.LINE_INFANTRY, 1, center);
		for (let attackerDir = 0; attackerDir < 6; attackerDir++) {
			const attackerOrigin = neighborOffset(grid, center, attackerDir)!;
			const result = getRetreatHex(defender, attackerOrigin, grid, [defender]);
			const oppositeDir = (attackerDir + 3) % 6;
			const expected = neighborOffset(grid, center, oppositeDir);
			expect(result).toEqual(expected);
		}
	});

	it('retreats away from a 2-hex-distant attacker (MP-distance charge)', () => {
		expect.assertions(1);
		const grid = buildGrid(openRect(7, 7));
		const center = { col: 3, row: 3 };
		const defender = unit('d', UnitType.LINE_INFANTRY, 1, center);
		// Attacker origin 2 hexes away in direction 3
		const cubeMap = buildCubeToOffset(grid);
		const defHex = grid.getHex(center)!;
		const [dq, dr] = directions[3];
		const attackerOrigin = cubeMap.get(`${defHex.q + 2 * dq},${defHex.r + 2 * dr}`)!;
		const result = getRetreatHex(defender, attackerOrigin, grid, [defender]);
		const expected = neighborOffset(grid, center, 0);
		expect(result).toEqual(expected);
	});
});

describe('getRetreatHex — blocking', () => {
	it('returns null when defender is surrounded by friendly units', () => {
		expect.assertions(1);
		const grid = buildGrid(openRect(5, 5));
		const center = { col: 2, row: 2 };
		const defender = unit('d', UnitType.LINE_INFANTRY, 1, center);
		const blockers: Unit[] = [];
		for (let d = 0; d < 6; d++) {
			const n = neighborOffset(grid, center, d)!;
			blockers.push(unit(`b${d}`, UnitType.LINE_INFANTRY, 1, n));
		}
		const attackerOrigin = { col: 0, row: 0 }; // any direction doesn't matter
		const result = getRetreatHex(defender, attackerOrigin, grid, [defender, ...blockers]);
		expect(result).toBeNull();
	});

	it('skips friendly-occupied retreat candidate, picks next-best', () => {
		expect.assertions(1);
		const grid = buildGrid(openRect(5, 5));
		const center = { col: 2, row: 2 };
		const defender = unit('d', UnitType.LINE_INFANTRY, 1, center);
		// Attacker at dir 3 (push opposite = dir 0). Block dir 0 with a friendly.
		const attackerOrigin = neighborOffset(grid, center, 3)!;
		const blockCoord = neighborOffset(grid, center, 0)!;
		const friend = unit('f', UnitType.LINE_INFANTRY, 1, blockCoord);
		const result = getRetreatHex(defender, attackerOrigin, grid, [defender, friend]);
		// Next best: dir 1 (NE) or dir 5 (SE) — both score equally as next-most-aligned
		// with push direction (1,0). Tie-break by lowest dirIdx → dir 1.
		const expected = neighborOffset(grid, center, 1);
		expect(result).toEqual(expected);
	});

	it('skips enemy-occupied retreat candidate, picks next-best', () => {
		expect.assertions(1);
		const grid = buildGrid(openRect(5, 5));
		const center = { col: 2, row: 2 };
		const defender = unit('d', UnitType.LINE_INFANTRY, 1, center);
		const attackerOrigin = neighborOffset(grid, center, 3)!;
		const blockCoord = neighborOffset(grid, center, 0)!;
		const enemy = unit('e', UnitType.LINE_INFANTRY, 0, blockCoord); // player 0 = enemy of defender
		const result = getRetreatHex(defender, attackerOrigin, grid, [defender, enemy]);
		const expected = neighborOffset(grid, center, 1);
		expect(result).toEqual(expected);
	});

	it('permits retreat into a hex adjacent to a different enemy (forced movement)', () => {
		expect.assertions(1);
		const grid = buildGrid(openRect(7, 7));
		const center = { col: 3, row: 3 };
		const defender = unit('d', UnitType.LINE_INFANTRY, 1, center);
		// Attacker at dir 3; retreat target = dir 0 hex. Place a 2nd enemy adjacent to retreat hex.
		const attackerOrigin = neighborOffset(grid, center, 3)!;
		const retreatTarget = neighborOffset(grid, center, 0)!;
		// Adjacent to retreatTarget but not the same as the attacker or defender
		const cubeMap = buildCubeToOffset(grid);
		const rtHex = grid.getHex(retreatTarget)!;
		const [dq, dr] = directions[1];
		const enemy2Coord = cubeMap.get(`${rtHex.q + dq},${rtHex.r + dr}`)!;
		const enemy2 = unit('e2', UnitType.LINE_INFANTRY, 0, enemy2Coord);
		const result = getRetreatHex(defender, attackerOrigin, grid, [defender, enemy2]);
		expect(result).toEqual(retreatTarget);
	});

	it('returns null when defender is at map corner with no legal neighbors', () => {
		expect.assertions(1);
		const grid = buildGrid(openRect(3, 3));
		// Corner cell (0,0); attacker at center; retreat would have to go off-map.
		// Block on-map neighbors with friendlies.
		const defender = unit('d', UnitType.LINE_INFANTRY, 1, { col: 0, row: 0 });
		const attackerOrigin = { col: 1, row: 1 };
		const blockers: Unit[] = [];
		for (let d = 0; d < 6; d++) {
			const n = neighborOffset(grid, { col: 0, row: 0 }, d);
			if (n) blockers.push(unit(`b${d}`, UnitType.LINE_INFANTRY, 1, n));
		}
		const result = getRetreatHex(defender, attackerOrigin, grid, [defender, ...blockers]);
		expect(result).toBeNull();
	});

	it('skips off-map neighbors when defender is at map edge', () => {
		expect.assertions(1);
		const grid = buildGrid(openRect(3, 3));
		// Defender at (0,1) edge; attacker at (1,1) center
		const defender = unit('d', UnitType.LINE_INFANTRY, 1, { col: 0, row: 1 });
		const attackerOrigin = { col: 1, row: 1 };
		const result = getRetreatHex(defender, attackerOrigin, grid, [defender]);
		// Push direction is (-1, ?); retreat must be an on-map neighbor with the
		// best westward alignment. The function should return some non-null hex.
		expect(result).not.toBeNull();
	});
});

describe('getRetreatHex — terrain', () => {
	it('skips terrain-restricted candidate (Dragoons cannot retreat into Town)', () => {
		expect.assertions(1);
		const layout = openRect(5, 5);
		const center = { col: 2, row: 2 };
		const defender = unit('d', UnitType.DRAGOONS, 1, center);
		const attackerOrigin = neighborOffset(buildGrid(layout), center, 3)!;
		const dir0 = neighborOffset(buildGrid(layout), center, 0)!;
		// Make dir 0 a TOWN — Dragoons cannot enter.
		for (const c of layout) if (coordsEqual(c, dir0)) c.terrain = TerrainType.TOWN;
		const grid = buildGrid(layout);
		const result = getRetreatHex(defender, attackerOrigin, grid, [defender]);
		// Should fall to dir 1 (next best alignment)
		const expected = neighborOffset(grid, center, 1);
		expect(result).toEqual(expected);
	});

	it('skips impassable terrain (Marsh) neighbor', () => {
		expect.assertions(1);
		const layout = openRect(5, 5);
		const center = { col: 2, row: 2 };
		const defender = unit('d', UnitType.LINE_INFANTRY, 1, center);
		const attackerOrigin = neighborOffset(buildGrid(layout), center, 3)!;
		const dir0 = neighborOffset(buildGrid(layout), center, 0)!;
		for (const c of layout) if (coordsEqual(c, dir0)) c.terrain = TerrainType.MARSH;
		const grid = buildGrid(layout);
		const result = getRetreatHex(defender, attackerOrigin, grid, [defender]);
		const expected = neighborOffset(grid, center, 1);
		expect(result).toEqual(expected);
	});

	it('permits retreat into HILLTOP (difficult terrain) without check', () => {
		expect.assertions(1);
		const layout = openRect(5, 5);
		const center = { col: 2, row: 2 };
		const defender = unit('d', UnitType.LINE_INFANTRY, 1, center);
		const attackerOrigin = neighborOffset(buildGrid(layout), center, 3)!;
		const dir0 = neighborOffset(buildGrid(layout), center, 0)!;
		for (const c of layout) if (coordsEqual(c, dir0)) c.terrain = TerrainType.HILLTOP;
		const grid = buildGrid(layout);
		const result = getRetreatHex(defender, attackerOrigin, grid, [defender]);
		expect(result).toEqual(dir0);
	});
});

describe('getRetreatHex — tie-breaking', () => {
	it('breaks ties by lowest direction index', () => {
		expect.assertions(1);
		const grid = buildGrid(openRect(5, 5));
		const center = { col: 2, row: 2 };
		const defender = unit('d', UnitType.LINE_INFANTRY, 1, center);
		// Place attacker so push direction is along dir 0; both dir 1 (NE) and dir 5 (SE)
		// score equally as next-best. With dir 0 also unblocked, dir 0 wins outright. To
		// force a tie, block dir 0.
		const attackerOrigin = neighborOffset(grid, center, 3)!;
		const dir0Coord = neighborOffset(grid, center, 0)!;
		const blocker = unit('b', UnitType.LINE_INFANTRY, 1, dir0Coord);
		const result = getRetreatHex(defender, attackerOrigin, grid, [defender, blocker]);
		const expected = neighborOffset(grid, center, 1); // lower idx of {1, 5}
		expect(result).toEqual(expected);
	});
});
