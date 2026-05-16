import { describe, expect, it } from 'vitest';
import { Grid, type OffsetCoordinates } from 'honeycomb-grid';
import { canCharge, getValidChargeTargets, resolveCharge } from './charge';
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
		activated: false
	};
}

const seqRng = (values: number[]) => {
	let i = 0;
	return () => values[i++];
};

describe('canCharge — unit-type restrictions', () => {
	it('Line Infantry cannot charge Dragoons', () => {
		expect.assertions(1);
		const a = unit('a', UnitType.LINE_INFANTRY, 0, { col: 0, row: 0 });
		const d = unit('d', UnitType.DRAGOONS, 1, { col: 1, row: 0 });
		expect(canCharge(a, d)).toBe(false);
	});

	it('Line Infantry cannot charge Light Horse', () => {
		expect.assertions(1);
		const a = unit('a', UnitType.LINE_INFANTRY, 0, { col: 0, row: 0 });
		const d = unit('d', UnitType.LIGHT_HORSE, 1, { col: 1, row: 0 });
		expect(canCharge(a, d)).toBe(false);
	});

	it('Line Infantry cannot charge Horse', () => {
		expect.assertions(1);
		const a = unit('a', UnitType.LINE_INFANTRY, 0, { col: 0, row: 0 });
		const d = unit('d', UnitType.HORSE, 1, { col: 1, row: 0 });
		expect(canCharge(a, d)).toBe(false);
	});

	it('Line Infantry can charge Line Infantry, Light Infantry, Artillery', () => {
		expect.assertions(3);
		const a = unit('a', UnitType.LINE_INFANTRY, 0, { col: 0, row: 0 });
		for (const t of [UnitType.LINE_INFANTRY, UnitType.LIGHT_INFANTRY, UnitType.ARTILLERY]) {
			const d = unit('d', t, 1, { col: 1, row: 0 });
			expect(canCharge(a, d)).toBe(true);
		}
	});

	it('Light Infantry cannot charge anything', () => {
		expect.assertions(1);
		const a = unit('a', UnitType.LIGHT_INFANTRY, 0, { col: 0, row: 0 });
		const d = unit('d', UnitType.LINE_INFANTRY, 1, { col: 1, row: 0 });
		expect(canCharge(a, d)).toBe(false);
	});

	it('Artillery cannot charge', () => {
		expect.assertions(1);
		const a = unit('a', UnitType.ARTILLERY, 0, { col: 0, row: 0 });
		const d = unit('d', UnitType.LINE_INFANTRY, 1, { col: 1, row: 0 });
		expect(canCharge(a, d)).toBe(false);
	});

	it('Dragoons can charge any unit type (no restrictions)', () => {
		expect.assertions(6);
		const a = unit('a', UnitType.DRAGOONS, 0, { col: 0, row: 0 });
		for (const t of Object.values(UnitType)) {
			const d = unit('d', t, 1, { col: 1, row: 0 });
			expect(canCharge(a, d)).toBe(true);
		}
	});

	it('Horse can charge any unit type (no restrictions)', () => {
		expect.assertions(6);
		const a = unit('a', UnitType.HORSE, 0, { col: 0, row: 0 });
		for (const t of Object.values(UnitType)) {
			const d = unit('d', t, 1, { col: 1, row: 0 });
			expect(canCharge(a, d)).toBe(true);
		}
	});
});

describe('canCharge — state gating', () => {
	it('returns false against same-player unit', () => {
		expect.assertions(1);
		const a = unit('a', UnitType.DRAGOONS, 0, { col: 0, row: 0 });
		const f = unit('f', UnitType.LINE_INFANTRY, 0, { col: 1, row: 0 });
		expect(canCharge(a, f)).toBe(false);
	});

	it('returns false when attacker has fired this activation', () => {
		expect.assertions(1);
		const a = unit('a', UnitType.DRAGOONS, 0, { col: 0, row: 0 });
		a.firedThisActivation = true;
		const d = unit('d', UnitType.LINE_INFANTRY, 1, { col: 1, row: 0 });
		expect(canCharge(a, d)).toBe(false);
	});

	it('returns false when defender SP is 0', () => {
		expect.assertions(1);
		const a = unit('a', UnitType.DRAGOONS, 0, { col: 0, row: 0 });
		const d = unit('d', UnitType.LINE_INFANTRY, 1, { col: 1, row: 0 });
		d.strengthPoints = 0;
		expect(canCharge(a, d)).toBe(false);
	});
});

describe('getValidChargeTargets', () => {
	it('returns [] for non-charging unit (Light Infantry)', () => {
		expect.assertions(1);
		const grid = buildGrid(openRect(5, 5));
		const a = unit('a', UnitType.LIGHT_INFANTRY, 0, { col: 2, row: 2 });
		const d = unit('d', UnitType.LINE_INFANTRY, 1, offsetAlong(grid, a.coordinates, 0, 1)!);
		expect(getValidChargeTargets(a, grid, [a, d])).toEqual([]);
	});

	it('returns [] for Artillery', () => {
		expect.assertions(1);
		const grid = buildGrid(openRect(5, 5));
		const a = unit('a', UnitType.ARTILLERY, 0, { col: 2, row: 2 });
		const d = unit('d', UnitType.LINE_INFANTRY, 1, offsetAlong(grid, a.coordinates, 0, 1)!);
		expect(getValidChargeTargets(a, grid, [a, d])).toEqual([]);
	});

	it('includes adjacent enemy for 1-MP Line Infantry', () => {
		expect.assertions(1);
		const grid = buildGrid(openRect(5, 5));
		const a = unit('a', UnitType.LINE_INFANTRY, 0, { col: 2, row: 2 });
		const d = unit('d', UnitType.LINE_INFANTRY, 1, offsetAlong(grid, a.coordinates, 0, 1)!);
		expect(getValidChargeTargets(a, grid, [a, d]).map((u) => u.id)).toEqual(['d']);
	});

	it('includes 2-hex-distant enemy for 2-MP Horse', () => {
		expect.assertions(1);
		const grid = buildGrid(openRect(7, 7));
		const a = unit('a', UnitType.HORSE, 0, { col: 3, row: 3 });
		const d = unit('d', UnitType.LINE_INFANTRY, 1, offsetAlong(grid, a.coordinates, 0, 2)!);
		expect(getValidChargeTargets(a, grid, [a, d]).map((u) => u.id)).toEqual(['d']);
	});

	it('excludes 3-hex-distant enemy for 2-MP Horse', () => {
		expect.assertions(1);
		const grid = buildGrid(openRect(9, 9));
		const a = unit('a', UnitType.HORSE, 0, { col: 4, row: 4 });
		const d = unit('d', UnitType.LINE_INFANTRY, 1, offsetAlong(grid, a.coordinates, 0, 3)!);
		expect(getValidChargeTargets(a, grid, [a, d])).toEqual([]);
	});

	it('excludes Cavalry defender when attacker is Line Infantry', () => {
		expect.assertions(1);
		const grid = buildGrid(openRect(5, 5));
		const a = unit('a', UnitType.LINE_INFANTRY, 0, { col: 2, row: 2 });
		const d = unit('d', UnitType.HORSE, 1, offsetAlong(grid, a.coordinates, 0, 1)!);
		expect(getValidChargeTargets(a, grid, [a, d])).toEqual([]);
	});

	it('respects terrain entry on defender hex (Dragoons cannot charge Town)', () => {
		expect.assertions(1);
		const layout = openRect(5, 5);
		const a = unit('a', UnitType.DRAGOONS, 0, { col: 2, row: 2 });
		const probeGrid = buildGrid(layout);
		const dCoord = offsetAlong(probeGrid, a.coordinates, 0, 1)!;
		for (const c of layout) if (coordsEqual(c, dCoord)) c.terrain = TerrainType.TOWN;
		const grid = buildGrid(layout);
		const d = unit('d', UnitType.LINE_INFANTRY, 1, dCoord);
		expect(getValidChargeTargets(a, grid, [a, d])).toEqual([]);
	});

	it('excludes defender if path is blocked by friendly unit', () => {
		expect.assertions(1);
		const grid = buildGrid(openRect(7, 7));
		const a = unit('a', UnitType.HORSE, 0, { col: 3, row: 3 });
		const blockerCoord = offsetAlong(grid, a.coordinates, 0, 1)!;
		const blocker = unit('b', UnitType.LINE_INFANTRY, 0, blockerCoord);
		const dCoord = offsetAlong(grid, a.coordinates, 0, 2)!;
		const d = unit('d', UnitType.LINE_INFANTRY, 1, dCoord);
		expect(getValidChargeTargets(a, grid, [a, blocker, d])).toEqual([]);
	});

	it('returns multiple eligible targets when many exist', () => {
		expect.assertions(1);
		const grid = buildGrid(openRect(7, 7));
		const a = unit('a', UnitType.HORSE, 0, { col: 3, row: 3 });
		const d1 = unit('d1', UnitType.LINE_INFANTRY, 1, offsetAlong(grid, a.coordinates, 0, 1)!);
		const d2 = unit('d2', UnitType.LINE_INFANTRY, 1, offsetAlong(grid, a.coordinates, 2, 1)!);
		const got = getValidChargeTargets(a, grid, [a, d1, d2])
			.map((u) => u.id)
			.sort();
		expect(got).toEqual(['d1', 'd2']);
	});

	it('returns [] when attacker has already used all MP', () => {
		expect.assertions(1);
		const grid = buildGrid(openRect(5, 5));
		const a = unit('a', UnitType.LINE_INFANTRY, 0, { col: 2, row: 2 });
		a.movementPointsUsed = 1;
		const d = unit('d', UnitType.LINE_INFANTRY, 1, offsetAlong(grid, a.coordinates, 0, 1)!);
		expect(getValidChargeTargets(a, grid, [a, d])).toEqual([]);
	});
});

describe('resolveCharge — outcomes', () => {
	// Setup: attacker at (2,2), defender adjacent at dir 0.
	const makeOpen = () => {
		const grid = buildGrid(openRect(5, 5));
		const a = unit('a', UnitType.LINE_INFANTRY, 0, { col: 2, row: 2 });
		const d = unit('d', UnitType.LINE_INFANTRY, 1, offsetAlong(grid, a.coordinates, 0, 1)!);
		return { grid, a, d, origin: a.coordinates };
	};

	it('attacker_repulsed on tied scores: attacker takes 1 hit, no defender damage', () => {
		expect.assertions(4);
		const { grid, a, d, origin } = makeOpen();
		// Both roll 1 (rng=0); SP equal → delta = 0 → attacker_repulsed.
		const r = resolveCharge(a, d, origin, grid, [a, d], seqRng([0, 0]));
		expect(r.outcome).toBe('attacker_repulsed');
		expect(r.attackerDamage).toBe(1);
		expect(r.defenderDamage).toBe(0);
		expect(r.attackerAdvances).toBe(false);
	});

	it('defender_retreats on delta=1: defender takes 1 hit, retreats, Line Infantry advances', () => {
		expect.assertions(5);
		const { grid, a, d, origin } = makeOpen();
		// Attacker rolls 2 (rng=0.2), defender rolls 1 (rng=0); delta = 1.
		const r = resolveCharge(a, d, origin, grid, [a, d], seqRng([0.2, 0]));
		expect(r.outcome).toBe('defender_retreats');
		expect(r.attackerDamage).toBe(0);
		expect(r.defenderDamage).toBe(1);
		expect(r.attackerAdvances).toBe(true);
		expect(r.defenderRetreatTo).not.toBeNull();
	});

	it('defender_eliminated when delta=3 reduces defender below 0 SP', () => {
		expect.assertions(3);
		const { grid, a, d, origin } = makeOpen();
		d.strengthPoints = 1;
		// Attacker rolls 4 (rng=0.6), defender rolls 1 (rng=0); delta = 3. Defender takes 2 hits → eliminated.
		const r = resolveCharge(a, d, origin, grid, [a, d], seqRng([0.6, 0]));
		expect(r.outcome).toBe('defender_eliminated');
		expect(r.defenderDamage).toBe(2);
		expect(r.attackerAdvances).toBe(true);
	});
});

describe('resolveCharge — cavalry retreat rule', () => {
	it('Horse on a winning charge bounces to origin when defender survives', () => {
		expect.assertions(2);
		const grid = buildGrid(openRect(7, 7));
		const a = unit('a', UnitType.HORSE, 0, { col: 3, row: 3 });
		const d = unit('d', UnitType.LINE_INFANTRY, 1, offsetAlong(grid, a.coordinates, 0, 1)!);
		// Force delta=1: attacker roll 1, defender roll 1, but Horse +1 bonus and equal SP
		// → attackerScore = 1+4+1 = 6, defenderScore = 1+4 = 5, delta = 1.
		const r = resolveCharge(a, d, a.coordinates, grid, [a, d], seqRng([0, 0]));
		expect(r.outcome).toBe('defender_retreats');
		expect(r.attackerAdvances).toBe(false); // cavalry bounces
	});

	it('Horse advances when defender is eliminated', () => {
		expect.assertions(2);
		const grid = buildGrid(openRect(7, 7));
		const a = unit('a', UnitType.HORSE, 0, { col: 3, row: 3 });
		const d = unit('d', UnitType.LINE_INFANTRY, 1, offsetAlong(grid, a.coordinates, 0, 1)!);
		d.strengthPoints = 1;
		// delta=3 → 2 hits → eliminated
		const r = resolveCharge(a, d, a.coordinates, grid, [a, d], seqRng([0.5, 0]));
		expect(r.outcome).toBe('defender_eliminated');
		expect(r.attackerAdvances).toBe(true);
	});

	it('Line Infantry advances on defender retreat', () => {
		expect.assertions(2);
		const grid = buildGrid(openRect(7, 7));
		const a = unit('a', UnitType.LINE_INFANTRY, 0, { col: 3, row: 3 });
		const d = unit('d', UnitType.LIGHT_INFANTRY, 1, offsetAlong(grid, a.coordinates, 0, 1)!);
		// delta = 1: attacker roll 2 (rng=0.2), defender roll 1 (rng=0)
		const r = resolveCharge(a, d, a.coordinates, grid, [a, d], seqRng([0.2, 0]));
		expect(r.outcome).toBe('defender_retreats');
		expect(r.attackerAdvances).toBe(true);
	});
});

describe('resolveCharge — modifiers', () => {
	it('Horse +1 charge bonus is applied', () => {
		expect.assertions(1);
		const grid = buildGrid(openRect(5, 5));
		const a = unit('a', UnitType.HORSE, 0, { col: 2, row: 2 });
		const d = unit('d', UnitType.LINE_INFANTRY, 1, offsetAlong(grid, a.coordinates, 0, 1)!);
		// Both roll 1, both SP 4. Without bonus delta=0 (repulse). With +1 bonus delta=1.
		const r = resolveCharge(a, d, a.coordinates, grid, [a, d], seqRng([0, 0]));
		expect(r.attackerScore - r.defenderScore).toBe(1);
	});

	it('Difficult-terrain defender produces a -1 modifier to attacker score', () => {
		expect.assertions(1);
		const layout = openRect(5, 5);
		const aCoord = { col: 2, row: 2 };
		const probe = buildGrid(layout);
		const dCoord = offsetAlong(probe, aCoord, 0, 1)!;
		for (const c of layout) if (coordsEqual(c, dCoord)) c.terrain = TerrainType.HILLTOP;
		const grid = buildGrid(layout);
		const a = unit('a', UnitType.LINE_INFANTRY, 0, aCoord);
		const d = unit('d', UnitType.LINE_INFANTRY, 1, dCoord);
		// Without DT mod: scores 1+4 vs 1+4 → delta 0. With DT mod: 1+4-1 vs 1+4 → delta -1.
		const r = resolveCharge(a, d, aCoord, grid, [a, d], seqRng([0, 0]));
		expect(r.attackerScore - r.defenderScore).toBe(-1);
	});

	it('Difficult-terrain defender auto-holds on delta 1-2 instead of retreating', () => {
		expect.assertions(3);
		const layout = openRect(5, 5);
		const aCoord = { col: 2, row: 2 };
		const probe = buildGrid(layout);
		const dCoord = offsetAlong(probe, aCoord, 0, 1)!;
		for (const c of layout) if (coordsEqual(c, dCoord)) c.terrain = TerrainType.HILLTOP;
		const grid = buildGrid(layout);
		const a = unit('a', UnitType.LINE_INFANTRY, 0, aCoord);
		const d = unit('d', UnitType.LINE_INFANTRY, 1, dCoord);
		// Want delta=1 net of DT penalty: attacker roll 3, defender roll 1 → (3+4-1) - (1+4) = 1
		const r = resolveCharge(a, d, aCoord, grid, [a, d], seqRng([2 / 6, 0]));
		expect(r.outcome).toBe('defender_holds');
		expect(r.defenderDamage).toBe(1);
		expect(r.attackerAdvances).toBe(false);
	});

	it('Delta 3+ forces retreat even on difficult terrain', () => {
		expect.assertions(2);
		const layout = openRect(5, 5);
		const aCoord = { col: 2, row: 2 };
		const probe = buildGrid(layout);
		const dCoord = offsetAlong(probe, aCoord, 0, 1)!;
		for (const c of layout) if (coordsEqual(c, dCoord)) c.terrain = TerrainType.HILLTOP;
		const grid = buildGrid(layout);
		const a = unit('a', UnitType.LINE_INFANTRY, 0, aCoord);
		const d = unit('d', UnitType.LINE_INFANTRY, 1, dCoord);
		// Want delta 3+: attacker roll 5 (rng 4/6), defender roll 1 → (5+4-1) - (1+4) = 3
		const r = resolveCharge(a, d, aCoord, grid, [a, d], seqRng([4 / 6, 0]));
		expect(r.outcome).toBe('defender_retreats');
		expect(r.defenderDamage).toBe(2);
	});
});

describe('resolveCharge — no-retreat conversion', () => {
	it('No retreat hex on delta 1-2 result: extra hit, defender_holds', () => {
		expect.assertions(3);
		const grid = buildGrid(openRect(3, 3));
		const aCoord = { col: 1, row: 1 };
		const dCoord = { col: 0, row: 0 }; // corner
		const a = unit('a', UnitType.LINE_INFANTRY, 0, aCoord);
		const d = unit('d', UnitType.LINE_INFANTRY, 1, dCoord);
		// Block defender's on-map neighbors with friendlies so no retreat is legal
		const blockers: Unit[] = [];
		const probe = buildGrid(openRect(3, 3));
		for (let dir = 0; dir < 6; dir++) {
			const n = offsetAlong(probe, dCoord, dir, 1);
			if (n && !coordsEqual(n, aCoord)) {
				blockers.push(unit(`b${dir}`, UnitType.LINE_INFANTRY, 1, n));
			}
		}
		// delta=1: attacker roll 2, defender roll 1 → (2+4) - (1+4) = 1
		const r = resolveCharge(a, d, aCoord, grid, [a, d, ...blockers], seqRng([1 / 6, 0]));
		expect(r.outcome).toBe('defender_holds');
		expect(r.defenderDamage).toBe(2); // 1 base + 1 extra for failed retreat
		expect(r.defenderRetreatTo).toBeNull();
	});

	it('No retreat hex on delta 3+ result: extra hit, defender_holds', () => {
		expect.assertions(2);
		const grid = buildGrid(openRect(3, 3));
		const aCoord = { col: 1, row: 1 };
		const dCoord = { col: 0, row: 0 };
		const a = unit('a', UnitType.LINE_INFANTRY, 0, aCoord);
		const d = unit('d', UnitType.LINE_INFANTRY, 1, dCoord);
		const blockers: Unit[] = [];
		const probe = buildGrid(openRect(3, 3));
		for (let dir = 0; dir < 6; dir++) {
			const n = offsetAlong(probe, dCoord, dir, 1);
			if (n && !coordsEqual(n, aCoord)) {
				blockers.push(unit(`b${dir}`, UnitType.LINE_INFANTRY, 1, n));
			}
		}
		// delta=3: attacker roll 4 (rng 3/6), defender roll 1 → (4+4) - (1+4) = 3
		const r = resolveCharge(a, d, aCoord, grid, [a, d, ...blockers], seqRng([3 / 6, 0]));
		expect(r.outcome).toBe('defender_holds');
		expect(r.defenderDamage).toBe(3); // 2 base + 1 extra
	});

	it('Extra hits eliminate defender when SP is low', () => {
		expect.assertions(2);
		const grid = buildGrid(openRect(3, 3));
		const aCoord = { col: 1, row: 1 };
		const dCoord = { col: 0, row: 0 };
		const a = unit('a', UnitType.LINE_INFANTRY, 0, aCoord);
		const d = unit('d', UnitType.LINE_INFANTRY, 1, dCoord);
		d.strengthPoints = 2;
		const blockers: Unit[] = [];
		const probe = buildGrid(openRect(3, 3));
		for (let dir = 0; dir < 6; dir++) {
			const n = offsetAlong(probe, dCoord, dir, 1);
			if (n && !coordsEqual(n, aCoord)) {
				blockers.push(unit(`b${dir}`, UnitType.LINE_INFANTRY, 1, n));
			}
		}
		// delta=1 with defender SP=2: attacker rolls 1 (4+1=5), defender rolls 2 (2+2=4)
		// → 1 base hit + 1 extra for no retreat = 2 total, eliminates defender.
		const r = resolveCharge(a, d, aCoord, grid, [a, d, ...blockers], seqRng([0, 1 / 6 + 0.01]));
		expect(r.outcome).toBe('defender_eliminated');
		expect(r.defenderDamage).toBe(2);
	});
});
