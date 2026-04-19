import { describe, expect, it } from 'vitest';
import { Grid, type OffsetCoordinates } from 'honeycomb-grid';
import { hasLineOfSight } from './los';
import { HexCell, directions } from './hex';
import { HexFacing, TerrainType, UnitType, type Player, type Unit } from './types';
import { unitDefinitions } from './unitDefinitions';

// --- Test fixtures & helpers ---

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

function offsetAlong(
	grid: Grid<HexCell>,
	from: OffsetCoordinates,
	dirIdx: number,
	steps: number
): OffsetCoordinates | null {
	const start = grid.getHex(from);
	if (!start) return null;
	const map = buildCubeToOffset(grid);
	const [dq, dr] = directions[dirIdx];
	return map.get(`${start.q + steps * dq},${start.r + steps * dr}`) ?? null;
}

function setTerrainAt(layout: Layout[], coord: OffsetCoordinates, terrain: TerrainType): void {
	const cell = layout.find((c) => c.col === coord.col && c.row === coord.row);
	if (cell) cell.terrain = terrain;
}

function unit(
	id: string,
	type: UnitType,
	player: Player,
	coordinates: OffsetCoordinates,
	facing: HexFacing = HexFacing.N
): Unit {
	const def = unitDefinitions[type];
	return {
		id,
		type,
		player,
		coordinates,
		facing,
		strengthPoints: def.defaultStrengthPoints,
		maxStrengthPoints: def.defaultStrengthPoints,
		selected: false,
		movementPointsUsed: 0,
		facingStepsUsed: 0,
		activated: false
	};
}

// --- Tests ---

describe('hasLineOfSight — trivial cases', () => {
	it('returns true when source and target are the same hex', () => {
		expect.assertions(1);
		const grid = buildGrid(openRect(3, 3));
		expect(hasLineOfSight({ col: 1, row: 1 }, { col: 1, row: 1 }, grid, [])).toBe(true);
	});

	it('returns true for every adjacent direction', () => {
		expect.assertions(6);
		const grid = buildGrid(openRect(5, 5));
		const from = { col: 2, row: 2 };
		for (let d = 0; d < 6; d++) {
			const to = offsetAlong(grid, from, d, 1)!;
			expect(hasLineOfSight(from, to, grid, [])).toBe(true);
		}
	});

	it('returns true even when adjacent target sits on Woods (target itself never blocks)', () => {
		expect.assertions(1);
		const layout = openRect(3, 3);
		const from = { col: 1, row: 1 };
		const probe = buildGrid(openRect(3, 3));
		const to = offsetAlong(probe, from, 0, 1)!;
		setTerrainAt(layout, to, TerrainType.WOODS);
		const grid = buildGrid(layout);
		expect(hasLineOfSight(from, to, grid, [])).toBe(true);
	});

	it('returns false when from is off-grid', () => {
		expect.assertions(1);
		const grid = buildGrid(openRect(3, 3));
		expect(hasLineOfSight({ col: 99, row: 99 }, { col: 1, row: 1 }, grid, [])).toBe(false);
	});

	it('returns false when to is off-grid', () => {
		expect.assertions(1);
		const grid = buildGrid(openRect(3, 3));
		expect(hasLineOfSight({ col: 1, row: 1 }, { col: 99, row: 99 }, grid, [])).toBe(false);
	});
});

describe('hasLineOfSight — open terrain', () => {
	it.each([2, 3, 4])('clear LOS at distance %i along direction 0', (dist) => {
		expect.assertions(1);
		const grid = buildGrid(openRect(8, 8));
		const from = { col: 0, row: 4 };
		const to = offsetAlong(grid, from, 0, dist)!;
		expect(hasLineOfSight(from, to, grid, [])).toBe(true);
	});

	it('clear LOS across a 6-hex open stretch', () => {
		expect.assertions(1);
		const grid = buildGrid(openRect(10, 10));
		const from = { col: 0, row: 5 };
		const to = offsetAlong(grid, from, 0, 6)!;
		expect(hasLineOfSight(from, to, grid, [])).toBe(true);
	});
});

describe('hasLineOfSight — terrain blockers', () => {
	it('Woods between blocks LOS', () => {
		expect.assertions(1);
		const layout = openRect(7, 7);
		const from = { col: 0, row: 3 };
		const probe = buildGrid(openRect(7, 7));
		const blocker = offsetAlong(probe, from, 0, 1)!;
		setTerrainAt(layout, blocker, TerrainType.WOODS);
		const grid = buildGrid(layout);
		const to = offsetAlong(grid, from, 0, 2)!;
		expect(hasLineOfSight(from, to, grid, [])).toBe(false);
	});

	it('Town between blocks LOS', () => {
		expect.assertions(1);
		const layout = openRect(7, 7);
		const from = { col: 0, row: 3 };
		const probe = buildGrid(openRect(7, 7));
		const blocker = offsetAlong(probe, from, 0, 1)!;
		setTerrainAt(layout, blocker, TerrainType.TOWN);
		const grid = buildGrid(layout);
		const to = offsetAlong(grid, from, 0, 2)!;
		expect(hasLineOfSight(from, to, grid, [])).toBe(false);
	});

	it('Open hex between leaves LOS clear', () => {
		expect.assertions(1);
		const grid = buildGrid(openRect(7, 7));
		const from = { col: 0, row: 3 };
		const to = offsetAlong(grid, from, 0, 2)!;
		expect(hasLineOfSight(from, to, grid, [])).toBe(true);
	});

	it('Marsh / Lake / River / Bridge / Road / Ford between do not block LOS', () => {
		expect.assertions(6);
		for (const t of [
			TerrainType.MARSH,
			TerrainType.LAKE,
			TerrainType.RIVER,
			TerrainType.BRIDGE,
			TerrainType.ROAD,
			TerrainType.FORD
		]) {
			const layout = openRect(7, 7);
			const from = { col: 0, row: 3 };
			const probe = buildGrid(openRect(7, 7));
			const blocker = offsetAlong(probe, from, 0, 1)!;
			setTerrainAt(layout, blocker, t);
			const grid = buildGrid(layout);
			const to = offsetAlong(grid, from, 0, 2)!;
			expect(hasLineOfSight(from, to, grid, [])).toBe(true);
		}
	});

	it('Woods on source hex does not block its own outgoing LOS', () => {
		expect.assertions(1);
		const layout = openRect(7, 7);
		const from = { col: 0, row: 3 };
		setTerrainAt(layout, from, TerrainType.WOODS);
		const grid = buildGrid(layout);
		const to = offsetAlong(grid, from, 0, 2)!;
		expect(hasLineOfSight(from, to, grid, [])).toBe(true);
	});

	it('Woods on target hex does not block incoming LOS to itself', () => {
		expect.assertions(1);
		const layout = openRect(7, 7);
		const from = { col: 0, row: 3 };
		const probe = buildGrid(openRect(7, 7));
		const to = offsetAlong(probe, from, 0, 2)!;
		setTerrainAt(layout, to, TerrainType.WOODS);
		const grid = buildGrid(layout);
		expect(hasLineOfSight(from, to, grid, [])).toBe(true);
	});
});

describe('hasLineOfSight — unit blockers', () => {
	it('intervening friendly unit blocks LOS', () => {
		expect.assertions(1);
		const grid = buildGrid(openRect(7, 7));
		const from = { col: 0, row: 3 };
		const blockerCoord = offsetAlong(grid, from, 0, 1)!;
		const to = offsetAlong(grid, from, 0, 2)!;
		const f = unit('f', UnitType.LINE_INFANTRY, 0, blockerCoord);
		expect(hasLineOfSight(from, to, grid, [f])).toBe(false);
	});

	it('intervening enemy unit blocks LOS', () => {
		expect.assertions(1);
		const grid = buildGrid(openRect(7, 7));
		const from = { col: 0, row: 3 };
		const blockerCoord = offsetAlong(grid, from, 0, 1)!;
		const to = offsetAlong(grid, from, 0, 2)!;
		const e = unit('e', UnitType.LINE_INFANTRY, 1, blockerCoord);
		expect(hasLineOfSight(from, to, grid, [e])).toBe(false);
	});

	it('unit on source hex does not block its own LOS', () => {
		expect.assertions(1);
		const grid = buildGrid(openRect(7, 7));
		const from = { col: 0, row: 3 };
		const to = offsetAlong(grid, from, 0, 2)!;
		const firer = unit('s', UnitType.LINE_INFANTRY, 0, from);
		expect(hasLineOfSight(from, to, grid, [firer])).toBe(true);
	});

	it('unit on target hex does not block incoming LOS to itself', () => {
		expect.assertions(1);
		const grid = buildGrid(openRect(7, 7));
		const from = { col: 0, row: 3 };
		const to = offsetAlong(grid, from, 0, 2)!;
		const target = unit('t', UnitType.LINE_INFANTRY, 1, to);
		expect(hasLineOfSight(from, to, grid, [target])).toBe(true);
	});
});

describe('hasLineOfSight — hill elevation', () => {
	it('Hill between two open-ground units blocks LOS', () => {
		expect.assertions(1);
		const layout = openRect(7, 7);
		const from = { col: 0, row: 3 };
		const probe = buildGrid(openRect(7, 7));
		const blocker = offsetAlong(probe, from, 0, 1)!;
		setTerrainAt(layout, blocker, TerrainType.HILLTOP);
		const grid = buildGrid(layout);
		const to = offsetAlong(grid, from, 0, 2)!;
		expect(hasLineOfSight(from, to, grid, [])).toBe(false);
	});

	it('Source on hill sees over an intervening hill of equal height', () => {
		expect.assertions(1);
		const layout = openRect(7, 7);
		const from = { col: 0, row: 3 };
		setTerrainAt(layout, from, TerrainType.HILLTOP);
		const probe = buildGrid(openRect(7, 7));
		const blocker = offsetAlong(probe, from, 0, 1)!;
		setTerrainAt(layout, blocker, TerrainType.HILLTOP);
		const grid = buildGrid(layout);
		const to = offsetAlong(grid, from, 0, 2)!;
		expect(hasLineOfSight(from, to, grid, [])).toBe(true);
	});

	it('Target on hill is visible across an intervening hill', () => {
		expect.assertions(1);
		const layout = openRect(7, 7);
		const from = { col: 0, row: 3 };
		const probe = buildGrid(openRect(7, 7));
		const blocker = offsetAlong(probe, from, 0, 1)!;
		const toCoord = offsetAlong(probe, from, 0, 2)!;
		setTerrainAt(layout, blocker, TerrainType.HILLTOP);
		setTerrainAt(layout, toCoord, TerrainType.HILLTOP);
		const grid = buildGrid(layout);
		expect(hasLineOfSight(from, toCoord, grid, [])).toBe(true);
	});

	it('Woods between two hill-top endpoints still blocks (Woods has no elevation override)', () => {
		expect.assertions(1);
		const layout = openRect(7, 7);
		const from = { col: 0, row: 3 };
		const probe = buildGrid(openRect(7, 7));
		const blocker = offsetAlong(probe, from, 0, 1)!;
		const toCoord = offsetAlong(probe, from, 0, 2)!;
		setTerrainAt(layout, from, TerrainType.HILLTOP);
		setTerrainAt(layout, blocker, TerrainType.WOODS);
		setTerrainAt(layout, toCoord, TerrainType.HILLTOP);
		const grid = buildGrid(layout);
		expect(hasLineOfSight(from, toCoord, grid, [])).toBe(false);
	});

	it('Intervening unit on a hill still blocks LOS between two open hexes', () => {
		expect.assertions(1);
		const layout = openRect(7, 7);
		const from = { col: 0, row: 3 };
		const probe = buildGrid(openRect(7, 7));
		const blocker = offsetAlong(probe, from, 0, 1)!;
		setTerrainAt(layout, blocker, TerrainType.HILLTOP);
		const grid = buildGrid(layout);
		const to = offsetAlong(grid, from, 0, 2)!;
		const onHill = unit('h', UnitType.LINE_INFANTRY, 1, blocker);
		expect(hasLineOfSight(from, to, grid, [onHill])).toBe(false);
	});
});

describe('hasLineOfSight — hexside boundary ties', () => {
	// Geometry: from cube (0,0) to cube (1,1) is distance 2; the midpoint lerp
	// (0.5, 0.5, -1) ties between candidates (1,0,-1) and (0,1,-1).
	function hexsideFixture() {
		const layout = openRect(5, 5);
		const from = { col: 0, row: 3 };
		const probe = buildGrid(layout);
		const startHex = probe.getHex(from)!;
		const cmap = buildCubeToOffset(probe);
		const target = cmap.get(`${startHex.q + 1},${startHex.r + 1}`);
		const candA = cmap.get(`${startHex.q + 1},${startHex.r}`);
		const candB = cmap.get(`${startHex.q},${startHex.r + 1}`);
		return { layout, from, target, candA, candB };
	}

	it('hexside tie: blocked when one candidate is Woods', () => {
		expect.assertions(2);
		const { layout, from, target, candA, candB } = hexsideFixture();
		expect(target && candA && candB).toBeTruthy();
		setTerrainAt(layout, candA!, TerrainType.WOODS);
		const grid = buildGrid(layout);
		expect(hasLineOfSight(from, target!, grid, [])).toBe(false);
	});

	it('hexside tie: blocked when the other candidate is Woods', () => {
		expect.assertions(2);
		const { layout, from, target, candA, candB } = hexsideFixture();
		expect(target && candA && candB).toBeTruthy();
		setTerrainAt(layout, candB!, TerrainType.WOODS);
		const grid = buildGrid(layout);
		expect(hasLineOfSight(from, target!, grid, [])).toBe(false);
	});

	it('hexside tie: clear when both candidates are open', () => {
		expect.assertions(2);
		const { layout, from, target, candA, candB } = hexsideFixture();
		expect(target && candA && candB).toBeTruthy();
		const grid = buildGrid(layout);
		expect(hasLineOfSight(from, target!, grid, [])).toBe(true);
	});

	it('hexside tie: blocked when both candidates are Woods', () => {
		expect.assertions(2);
		const { layout, from, target, candA, candB } = hexsideFixture();
		expect(target && candA && candB).toBeTruthy();
		setTerrainAt(layout, candA!, TerrainType.WOODS);
		setTerrainAt(layout, candB!, TerrainType.WOODS);
		const grid = buildGrid(layout);
		expect(hasLineOfSight(from, target!, grid, [])).toBe(false);
	});
});

describe('hasLineOfSight — artillery plunging fire', () => {
	it('Artillery on Hilltop sees over a Woods adjacent to firer at range 4', () => {
		expect.assertions(1);
		const layout = openRect(8, 8);
		const from = { col: 0, row: 4 };
		setTerrainAt(layout, from, TerrainType.HILLTOP);
		const probe = buildGrid(layout);
		const blocker = offsetAlong(probe, from, 0, 1)!;
		setTerrainAt(layout, blocker, TerrainType.WOODS);
		const grid = buildGrid(layout);
		const to = offsetAlong(grid, from, 0, 4)!;
		const arty = unit('a', UnitType.ARTILLERY, 0, from);
		expect(hasLineOfSight(from, to, grid, [arty])).toBe(true);
	});

	it('Artillery on Hilltop sees over a Woods adjacent to target at range 4', () => {
		expect.assertions(1);
		const layout = openRect(8, 8);
		const from = { col: 0, row: 4 };
		setTerrainAt(layout, from, TerrainType.HILLTOP);
		const probe = buildGrid(layout);
		const blockerNearTarget = offsetAlong(probe, from, 0, 3)!;
		setTerrainAt(layout, blockerNearTarget, TerrainType.WOODS);
		const grid = buildGrid(layout);
		const to = offsetAlong(grid, from, 0, 4)!;
		const arty = unit('a', UnitType.ARTILLERY, 0, from);
		expect(hasLineOfSight(from, to, grid, [arty])).toBe(true);
	});

	it('Artillery plunging fire over a single intervening enemy unit (adjacent to firer)', () => {
		expect.assertions(1);
		const layout = openRect(8, 8);
		const from = { col: 0, row: 4 };
		setTerrainAt(layout, from, TerrainType.HILLTOP);
		const grid = buildGrid(layout);
		const blockerCoord = offsetAlong(grid, from, 0, 1)!;
		const to = offsetAlong(grid, from, 0, 4)!;
		const arty = unit('a', UnitType.ARTILLERY, 0, from);
		const screen = unit('s', UnitType.LINE_INFANTRY, 1, blockerCoord);
		expect(hasLineOfSight(from, to, grid, [arty, screen])).toBe(true);
	});

	it('Plunging fire denied when blocker is in the middle of the line', () => {
		expect.assertions(1);
		const layout = openRect(8, 8);
		const from = { col: 0, row: 4 };
		setTerrainAt(layout, from, TerrainType.HILLTOP);
		const probe = buildGrid(layout);
		const blockerMiddle = offsetAlong(probe, from, 0, 2)!;
		setTerrainAt(layout, blockerMiddle, TerrainType.WOODS);
		const grid = buildGrid(layout);
		const to = offsetAlong(grid, from, 0, 4)!;
		const arty = unit('a', UnitType.ARTILLERY, 0, from);
		expect(hasLineOfSight(from, to, grid, [arty])).toBe(false);
	});

	it('Plunging fire denied at range 5 (over the 4-hex cap)', () => {
		expect.assertions(1);
		const layout = openRect(10, 10);
		const from = { col: 0, row: 5 };
		setTerrainAt(layout, from, TerrainType.HILLTOP);
		const probe = buildGrid(layout);
		const blocker = offsetAlong(probe, from, 0, 1)!;
		setTerrainAt(layout, blocker, TerrainType.WOODS);
		const grid = buildGrid(layout);
		const to = offsetAlong(grid, from, 0, 5)!;
		const arty = unit('a', UnitType.ARTILLERY, 0, from);
		expect(hasLineOfSight(from, to, grid, [arty])).toBe(false);
	});

	it('Plunging fire denied with two intervening blockers', () => {
		expect.assertions(1);
		const layout = openRect(8, 8);
		const from = { col: 0, row: 4 };
		setTerrainAt(layout, from, TerrainType.HILLTOP);
		const probe = buildGrid(layout);
		const b1 = offsetAlong(probe, from, 0, 1)!;
		const b2 = offsetAlong(probe, from, 0, 3)!;
		setTerrainAt(layout, b1, TerrainType.WOODS);
		setTerrainAt(layout, b2, TerrainType.WOODS);
		const grid = buildGrid(layout);
		const to = offsetAlong(grid, from, 0, 4)!;
		const arty = unit('a', UnitType.ARTILLERY, 0, from);
		expect(hasLineOfSight(from, to, grid, [arty])).toBe(false);
	});

	it('Non-artillery on a Hilltop does not get plunging fire', () => {
		expect.assertions(1);
		const layout = openRect(8, 8);
		const from = { col: 0, row: 4 };
		setTerrainAt(layout, from, TerrainType.HILLTOP);
		const probe = buildGrid(layout);
		const blocker = offsetAlong(probe, from, 0, 1)!;
		setTerrainAt(layout, blocker, TerrainType.WOODS);
		const grid = buildGrid(layout);
		const to = offsetAlong(grid, from, 0, 4)!;
		const inf = unit('i', UnitType.LINE_INFANTRY, 0, from);
		expect(hasLineOfSight(from, to, grid, [inf])).toBe(false);
	});

	it('Artillery NOT on a Hilltop does not get plunging fire', () => {
		expect.assertions(1);
		const layout = openRect(8, 8);
		const from = { col: 0, row: 4 };
		const probe = buildGrid(layout);
		const blocker = offsetAlong(probe, from, 0, 1)!;
		setTerrainAt(layout, blocker, TerrainType.WOODS);
		const grid = buildGrid(layout);
		const to = offsetAlong(grid, from, 0, 4)!;
		const arty = unit('a', UnitType.ARTILLERY, 0, from);
		expect(hasLineOfSight(from, to, grid, [arty])).toBe(false);
	});

	it('Plunging fire still works with no source unit at all (caller did not register one)', () => {
		// Defensive: when units list omits the firer, plunging-fire branch is gated
		// off (no sourceUnit), so a single blocker should deny LOS.
		expect.assertions(1);
		const layout = openRect(8, 8);
		const from = { col: 0, row: 4 };
		setTerrainAt(layout, from, TerrainType.HILLTOP);
		const probe = buildGrid(layout);
		const blocker = offsetAlong(probe, from, 0, 1)!;
		setTerrainAt(layout, blocker, TerrainType.WOODS);
		const grid = buildGrid(layout);
		const to = offsetAlong(grid, from, 0, 4)!;
		expect(hasLineOfSight(from, to, grid, [])).toBe(false);
	});
});
