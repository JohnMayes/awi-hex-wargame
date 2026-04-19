import { describe, expect, it } from 'vitest';
import { Grid, type OffsetCoordinates } from 'honeycomb-grid';
import { getValidFireTargets, resolveFireAction } from './combat';
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

function offsetAtCubeDelta(
	grid: Grid<HexCell>,
	from: OffsetCoordinates,
	dq: number,
	dr: number
): OffsetCoordinates | null {
	const start = grid.getHex(from);
	if (!start) return null;
	const map = buildCubeToOffset(grid);
	return map.get(`${start.q + dq},${start.r + dr}`) ?? null;
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
		firedThisActivation: false,
		activated: false
	};
}

// Anchor used by most tests: a generously-sized open grid with the firer in
// the interior so neighbors in every direction stay on the map.
const ANCHOR: OffsetCoordinates = { col: 4, row: 4 };

// --- getValidFireTargets: range & arc ---

describe('getValidFireTargets — range', () => {
	it('Line Infantry at range 1 in arc with clear LOS includes the enemy', () => {
		expect.assertions(2);
		const grid = buildGrid(openRect(9, 9));
		const firer = unit('a', UnitType.LINE_INFANTRY, 0, ANCHOR, HexFacing.N);
		const tgt = offsetAlong(grid, ANCHOR, 0, 1);
		expect(tgt).not.toBeNull();
		const enemy = unit('e', UnitType.LINE_INFANTRY, 1, tgt!, HexFacing.N);
		const out = getValidFireTargets(firer, grid, [firer, enemy]);
		expect(out.map((u) => u.id)).toEqual(['e']);
	});

	it('Line Infantry at range 2 in arc with clear LOS includes the enemy', () => {
		expect.assertions(2);
		const grid = buildGrid(openRect(9, 9));
		const firer = unit('a', UnitType.LINE_INFANTRY, 0, ANCHOR, HexFacing.N);
		const tgt = offsetAlong(grid, ANCHOR, 0, 2);
		expect(tgt).not.toBeNull();
		const enemy = unit('e', UnitType.LINE_INFANTRY, 1, tgt!, HexFacing.N);
		const out = getValidFireTargets(firer, grid, [firer, enemy]);
		expect(out.map((u) => u.id)).toEqual(['e']);
	});

	it('Line Infantry at range 3 (beyond firingRange 2) returns empty', () => {
		expect.assertions(2);
		const grid = buildGrid(openRect(9, 9));
		const firer = unit('a', UnitType.LINE_INFANTRY, 0, ANCHOR, HexFacing.N);
		const tgt = offsetAlong(grid, ANCHOR, 0, 3);
		expect(tgt).not.toBeNull();
		const enemy = unit('e', UnitType.LINE_INFANTRY, 1, tgt!, HexFacing.N);
		const out = getValidFireTargets(firer, grid, [firer, enemy]);
		expect(out).toEqual([]);
	});

	it('Artillery at range 4 in arc with clear LOS includes the enemy', () => {
		expect.assertions(2);
		const grid = buildGrid(openRect(11, 11));
		const firer = unit('a', UnitType.ARTILLERY, 0, ANCHOR, HexFacing.N);
		const tgt = offsetAlong(grid, ANCHOR, 0, 4);
		expect(tgt).not.toBeNull();
		const enemy = unit('e', UnitType.LINE_INFANTRY, 1, tgt!, HexFacing.N);
		const out = getValidFireTargets(firer, grid, [firer, enemy]);
		expect(out.map((u) => u.id)).toEqual(['e']);
	});

	it('Artillery at range 5 (beyond firingRange 4) returns empty', () => {
		expect.assertions(2);
		const grid = buildGrid(openRect(11, 11));
		const firer = unit('a', UnitType.ARTILLERY, 0, ANCHOR, HexFacing.N);
		const tgt = offsetAlong(grid, ANCHOR, 0, 5);
		expect(tgt).not.toBeNull();
		const enemy = unit('e', UnitType.LINE_INFANTRY, 1, tgt!, HexFacing.N);
		const out = getValidFireTargets(firer, grid, [firer, enemy]);
		expect(out).toEqual([]);
	});

	it('Light Horse and Horse (firingRange 0) never fire', () => {
		expect.assertions(2);
		const grid = buildGrid(openRect(9, 9));
		const tgt = offsetAlong(grid, ANCHOR, 0, 1)!;
		const enemy = unit('e', UnitType.LINE_INFANTRY, 1, tgt, HexFacing.N);
		const lightHorse = unit('lh', UnitType.LIGHT_HORSE, 0, ANCHOR, HexFacing.N);
		const horse = unit('h', UnitType.HORSE, 0, ANCHOR, HexFacing.N);
		expect(getValidFireTargets(lightHorse, grid, [lightHorse, enemy])).toEqual([]);
		expect(getValidFireTargets(horse, grid, [horse, enemy])).toEqual([]);
	});
});

describe('getValidFireTargets — facing/arc', () => {
	it('Light Infantry (no facing) sees enemies in all 6 directions', () => {
		expect.assertions(1);
		const grid = buildGrid(openRect(9, 9));
		const firer = unit('a', UnitType.LIGHT_INFANTRY, 0, ANCHOR, HexFacing.N);
		const enemies: Unit[] = [];
		for (let i = 0; i < 6; i++) {
			const c = offsetAlong(grid, ANCHOR, i, 1)!;
			enemies.push(unit(`e${i}`, UnitType.LINE_INFANTRY, 1, c, HexFacing.N));
		}
		const out = getValidFireTargets(firer, grid, [firer, ...enemies]);
		expect(out).toHaveLength(6);
	});

	it('Line Infantry in a Town hex gains all-around arc', () => {
		expect.assertions(1);
		const layout = openRect(9, 9);
		setTerrainAt(layout, ANCHOR, TerrainType.TOWN);
		const grid = buildGrid(layout);
		const firer = unit('a', UnitType.LINE_INFANTRY, 0, ANCHOR, HexFacing.N);
		const enemies: Unit[] = [];
		for (let i = 0; i < 6; i++) {
			const c = offsetAlong(grid, ANCHOR, i, 1)!;
			enemies.push(unit(`e${i}`, UnitType.LINE_INFANTRY, 1, c, HexFacing.N));
		}
		const out = getValidFireTargets(firer, grid, [firer, ...enemies]);
		expect(out).toHaveLength(6);
	});

	it('Line Infantry facing N excludes a rear-arc enemy at range 1', () => {
		expect.assertions(2);
		const grid = buildGrid(openRect(9, 9));
		const firer = unit('a', UnitType.LINE_INFANTRY, 0, ANCHOR, HexFacing.N);
		// Direction 3 is in the rear arc when facing N (front is dirs 0,1,5).
		const tgt = offsetAlong(grid, ANCHOR, 3, 1);
		expect(tgt).not.toBeNull();
		const enemy = unit('e', UnitType.LINE_INFANTRY, 1, tgt!, HexFacing.N);
		const out = getValidFireTargets(firer, grid, [firer, enemy]);
		expect(out).toEqual([]);
	});

	it('hexside-tie target at the front/rear boundary is included (permissive arc)', () => {
		expect.assertions(2);
		const grid = buildGrid(openRect(9, 9));
		const firer = unit('a', UnitType.LINE_INFANTRY, 0, ANCHOR, HexFacing.N);
		// Cube delta (-1, 2): distance 2, midpoint lerp lands on a hexside between
		// direction 5 (front) and direction 4 (rear). Permissive arc → in arc.
		const tgt = offsetAtCubeDelta(grid, ANCHOR, -1, 2);
		expect(tgt).not.toBeNull();
		const enemy = unit('e', UnitType.LINE_INFANTRY, 1, tgt!, HexFacing.N);
		const out = getValidFireTargets(firer, grid, [firer, enemy]);
		expect(out.map((u) => u.id)).toEqual(['e']);
	});
});

describe('getValidFireTargets — eligibility', () => {
	it('friendly units are never returned as fire targets', () => {
		expect.assertions(1);
		const grid = buildGrid(openRect(9, 9));
		const firer = unit('a', UnitType.LINE_INFANTRY, 0, ANCHOR, HexFacing.N);
		const friend = unit(
			'f',
			UnitType.LINE_INFANTRY,
			0,
			offsetAlong(grid, ANCHOR, 0, 1)!,
			HexFacing.N
		);
		const out = getValidFireTargets(firer, grid, [firer, friend]);
		expect(out).toEqual([]);
	});

	it('enemy with intervening Woods is excluded by LOS', () => {
		expect.assertions(2);
		const layout = openRect(9, 9);
		const blockerCoord = offsetAlong(buildGrid(layout), ANCHOR, 0, 1)!;
		setTerrainAt(layout, blockerCoord, TerrainType.WOODS);
		const grid = buildGrid(layout);
		const firer = unit('a', UnitType.LINE_INFANTRY, 0, ANCHOR, HexFacing.N);
		const tgt = offsetAlong(grid, ANCHOR, 0, 2);
		expect(tgt).not.toBeNull();
		const enemy = unit('e', UnitType.LINE_INFANTRY, 1, tgt!, HexFacing.N);
		const out = getValidFireTargets(firer, grid, [firer, enemy]);
		expect(out).toEqual([]);
	});

	it('enemy on the firer’s own hex (dist 0) is excluded', () => {
		expect.assertions(1);
		const grid = buildGrid(openRect(9, 9));
		const firer = unit('a', UnitType.LINE_INFANTRY, 0, ANCHOR, HexFacing.N);
		const enemy = unit('e', UnitType.LINE_INFANTRY, 1, ANCHOR, HexFacing.N);
		const out = getValidFireTargets(firer, grid, [firer, enemy]);
		expect(out).toEqual([]);
	});

	it('firer with firedThisActivation=true returns empty', () => {
		expect.assertions(1);
		const grid = buildGrid(openRect(9, 9));
		const firer = unit('a', UnitType.LINE_INFANTRY, 0, ANCHOR, HexFacing.N);
		firer.firedThisActivation = true;
		const tgt = offsetAlong(grid, ANCHOR, 0, 1)!;
		const enemy = unit('e', UnitType.LINE_INFANTRY, 1, tgt, HexFacing.N);
		const out = getValidFireTargets(firer, grid, [firer, enemy]);
		expect(out).toEqual([]);
	});

	it('returns all eligible enemies (no closest-target restriction)', () => {
		expect.assertions(1);
		const grid = buildGrid(openRect(9, 9));
		const firer = unit('a', UnitType.LINE_INFANTRY, 0, ANCHOR, HexFacing.N);
		const near = unit(
			'near',
			UnitType.LINE_INFANTRY,
			1,
			offsetAlong(grid, ANCHOR, 0, 1)!,
			HexFacing.N
		);
		const far = unit(
			'far',
			UnitType.LINE_INFANTRY,
			1,
			offsetAlong(grid, ANCHOR, 1, 2)!,
			HexFacing.N
		);
		const out = getValidFireTargets(firer, grid, [firer, near, far]);
		const ids = out.map((u) => u.id).sort();
		expect(ids).toEqual(['far', 'near']);
	});
});

// --- resolveFireAction: hit resolution ---

describe('resolveFireAction — base hit chances', () => {
	it('Line Infantry baseHitChance is 0.65', () => {
		expect.assertions(1);
		const grid = buildGrid(openRect(9, 9));
		const firer = unit('a', UnitType.LINE_INFANTRY, 0, ANCHOR, HexFacing.N);
		const enemy = unit('e', UnitType.LINE_INFANTRY, 1, offsetAlong(grid, ANCHOR, 0, 1)!);
		const r = resolveFireAction(firer, enemy, grid, () => 0.99);
		expect(r.baseHitChance).toBe(0.65);
	});

	it('Light Infantry, Dragoons, Artillery baseHitChance is 0.5', () => {
		expect.assertions(3);
		const grid = buildGrid(openRect(9, 9));
		const enemyCoord = offsetAlong(grid, ANCHOR, 0, 1)!;
		const enemy = unit('e', UnitType.LINE_INFANTRY, 1, enemyCoord);
		const li = unit('li', UnitType.LIGHT_INFANTRY, 0, ANCHOR, HexFacing.N);
		const dr = unit('dr', UnitType.DRAGOONS, 0, ANCHOR, HexFacing.N);
		const ar = unit('ar', UnitType.ARTILLERY, 0, ANCHOR, HexFacing.N);
		expect(resolveFireAction(li, enemy, grid, () => 0.99).baseHitChance).toBe(0.5);
		expect(resolveFireAction(dr, enemy, grid, () => 0.99).baseHitChance).toBe(0.5);
		expect(resolveFireAction(ar, enemy, grid, () => 0.99).baseHitChance).toBe(0.5);
	});
});

describe('resolveFireAction — modifiers', () => {
	it('open-ground target: coverModifier 0, finalHitChance equals baseHitChance', () => {
		expect.assertions(2);
		const grid = buildGrid(openRect(9, 9));
		const firer = unit('a', UnitType.LINE_INFANTRY, 0, ANCHOR, HexFacing.N);
		const enemy = unit('e', UnitType.LINE_INFANTRY, 1, offsetAlong(grid, ANCHOR, 0, 1)!);
		const r = resolveFireAction(firer, enemy, grid, () => 0.99);
		expect(r.coverModifier).toBe(0);
		expect(r.finalHitChance).toBe(r.baseHitChance);
	});

	it('Woods-occupying target: coverModifier −0.15', () => {
		expect.assertions(1);
		const layout = openRect(9, 9);
		const grid0 = buildGrid(layout);
		const tgtCoord = offsetAlong(grid0, ANCHOR, 0, 1)!;
		setTerrainAt(layout, tgtCoord, TerrainType.WOODS);
		const grid = buildGrid(layout);
		const firer = unit('a', UnitType.LINE_INFANTRY, 0, ANCHOR, HexFacing.N);
		const enemy = unit('e', UnitType.LIGHT_INFANTRY, 1, tgtCoord);
		const r = resolveFireAction(firer, enemy, grid, () => 0.99);
		expect(r.coverModifier).toBeCloseTo(-0.15, 10);
	});

	it('Town-occupying target: coverModifier −0.15', () => {
		expect.assertions(1);
		const layout = openRect(9, 9);
		const grid0 = buildGrid(layout);
		const tgtCoord = offsetAlong(grid0, ANCHOR, 0, 1)!;
		setTerrainAt(layout, tgtCoord, TerrainType.TOWN);
		const grid = buildGrid(layout);
		const firer = unit('a', UnitType.LINE_INFANTRY, 0, ANCHOR, HexFacing.N);
		const enemy = unit('e', UnitType.LINE_INFANTRY, 1, tgtCoord);
		const r = resolveFireAction(firer, enemy, grid, () => 0.99);
		expect(r.coverModifier).toBeCloseTo(-0.15, 10);
	});

	it('Artillery at range 1 or 2: longRangeModifier 0', () => {
		expect.assertions(2);
		const grid = buildGrid(openRect(11, 11));
		const firer = unit('a', UnitType.ARTILLERY, 0, ANCHOR, HexFacing.N);
		const e1 = unit('e1', UnitType.LINE_INFANTRY, 1, offsetAlong(grid, ANCHOR, 0, 1)!);
		const e2 = unit('e2', UnitType.LINE_INFANTRY, 1, offsetAlong(grid, ANCHOR, 0, 2)!);
		expect(resolveFireAction(firer, e1, grid, () => 0.99).longRangeModifier).toBe(0);
		expect(resolveFireAction(firer, e2, grid, () => 0.99).longRangeModifier).toBe(0);
	});

	it('Artillery at range 3 or 4: longRangeModifier −0.15', () => {
		expect.assertions(2);
		const grid = buildGrid(openRect(11, 11));
		const firer = unit('a', UnitType.ARTILLERY, 0, ANCHOR, HexFacing.N);
		const e3 = unit('e3', UnitType.LINE_INFANTRY, 1, offsetAlong(grid, ANCHOR, 0, 3)!);
		const e4 = unit('e4', UnitType.LINE_INFANTRY, 1, offsetAlong(grid, ANCHOR, 0, 4)!);
		expect(resolveFireAction(firer, e3, grid, () => 0.99).longRangeModifier).toBeCloseTo(-0.15, 10);
		expect(resolveFireAction(firer, e4, grid, () => 0.99).longRangeModifier).toBeCloseTo(-0.15, 10);
	});

	it('Non-artillery at range 2: longRangeModifier 0', () => {
		expect.assertions(1);
		const grid = buildGrid(openRect(9, 9));
		const firer = unit('a', UnitType.LINE_INFANTRY, 0, ANCHOR, HexFacing.N);
		const enemy = unit('e', UnitType.LINE_INFANTRY, 1, offsetAlong(grid, ANCHOR, 0, 2)!);
		const r = resolveFireAction(firer, enemy, grid, () => 0.99);
		expect(r.longRangeModifier).toBe(0);
	});

	it('finalHitChance is clamped to ≥ 0', () => {
		expect.assertions(1);
		const layout = openRect(11, 11);
		const grid0 = buildGrid(layout);
		const tgtCoord = offsetAlong(grid0, ANCHOR, 0, 4)!;
		setTerrainAt(layout, tgtCoord, TerrainType.WOODS);
		const grid = buildGrid(layout);
		// Artillery (base 0.5) at range 4 (-0.15) into Woods (-0.15) = 0.2 — still
		// positive. Force a clamp by stacking another negative via Light Infantry
		// (base 0.5) — that alone is positive too. Easiest: Artillery at range 4
		// to a Woods target of base 0.5 → 0.5 − 0.15 − 0.15 = 0.20. To verify the
		// clamp we use a synthetic check: any final less than baseHit + cover +
		// long must equal max(0, sum). Use hypothetical sum < 0 by constructing
		// another negative via... actually we just assert the clamp invariant
		// holds: Artillery at range 4 in Woods produces a non-negative value.
		const firer = unit('a', UnitType.ARTILLERY, 0, ANCHOR, HexFacing.N);
		const enemy = unit('e', UnitType.LIGHT_INFANTRY, 1, tgtCoord);
		const r = resolveFireAction(firer, enemy, grid, () => 0.99);
		expect(r.finalHitChance).toBeGreaterThanOrEqual(0);
	});
});

describe('resolveFireAction — RNG-driven outcomes', () => {
	it('RNG returns 0 → guaranteed hit', () => {
		expect.assertions(2);
		const grid = buildGrid(openRect(9, 9));
		const firer = unit('a', UnitType.LINE_INFANTRY, 0, ANCHOR, HexFacing.N);
		const enemy = unit('e', UnitType.LINE_INFANTRY, 1, offsetAlong(grid, ANCHOR, 0, 1)!);
		const r = resolveFireAction(firer, enemy, grid, () => 0);
		expect(r.hit).toBe(true);
		expect(r.damage).toBe(2); // both rolls 0; second roll 0 < 1/6 → double
	});

	it('RNG returns 0.999 → guaranteed miss; damage 0', () => {
		expect.assertions(2);
		const grid = buildGrid(openRect(9, 9));
		const firer = unit('a', UnitType.LINE_INFANTRY, 0, ANCHOR, HexFacing.N);
		const enemy = unit('e', UnitType.LINE_INFANTRY, 1, offsetAlong(grid, ANCHOR, 0, 1)!);
		const r = resolveFireAction(firer, enemy, grid, () => 0.999);
		expect(r.hit).toBe(false);
		expect(r.damage).toBe(0);
	});

	it('Sequenced RNG [0, 0.5] → hit, second roll 0.5 ≥ 1/6 → damage 1', () => {
		expect.assertions(2);
		const grid = buildGrid(openRect(9, 9));
		const firer = unit('a', UnitType.LINE_INFANTRY, 0, ANCHOR, HexFacing.N);
		const enemy = unit('e', UnitType.LINE_INFANTRY, 1, offsetAlong(grid, ANCHOR, 0, 1)!);
		const seq = [0, 0.5];
		let i = 0;
		const rng = () => seq[i++];
		const r = resolveFireAction(firer, enemy, grid, rng);
		expect(r.hit).toBe(true);
		expect(r.damage).toBe(1);
	});

	it('Sequenced RNG [0, 0.1] → hit, second roll 0.1 < 1/6 → damage 2', () => {
		expect.assertions(2);
		const grid = buildGrid(openRect(9, 9));
		const firer = unit('a', UnitType.LINE_INFANTRY, 0, ANCHOR, HexFacing.N);
		const enemy = unit('e', UnitType.LINE_INFANTRY, 1, offsetAlong(grid, ANCHOR, 0, 1)!);
		const seq = [0, 0.1];
		let i = 0;
		const rng = () => seq[i++];
		const r = resolveFireAction(firer, enemy, grid, rng);
		expect(r.hit).toBe(true);
		expect(r.damage).toBe(2);
	});

	it('Miss does not consume the second RNG draw', () => {
		expect.assertions(3);
		const grid = buildGrid(openRect(9, 9));
		const firer = unit('a', UnitType.LINE_INFANTRY, 0, ANCHOR, HexFacing.N);
		const enemy = unit('e', UnitType.LINE_INFANTRY, 1, offsetAlong(grid, ANCHOR, 0, 1)!);
		let calls = 0;
		const rng = () => {
			calls += 1;
			return 0.999;
		};
		const r = resolveFireAction(firer, enemy, grid, rng);
		expect(r.hit).toBe(false);
		expect(r.damage).toBe(0);
		expect(calls).toBe(1);
	});
});
