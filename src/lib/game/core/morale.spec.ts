import { describe, expect, it } from 'vitest';
import { Grid, type OffsetCoordinates } from 'honeycomb-grid';
import { checkMorale } from './morale';
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

function neighborOffset(
	grid: Grid<HexCell>,
	coords: OffsetCoordinates,
	dirIdx: number
): OffsetCoordinates | null {
	const hex = grid.getHex(coords);
	if (!hex) return null;
	for (const h of grid) {
		const [dq, dr] = directions[dirIdx];
		if (h.q === hex.q + dq && h.r === hex.r + dr) return { col: h.col, row: h.row };
	}
	return null;
}

function unit(
	id: string,
	type: UnitType,
	player: Player,
	coordinates: OffsetCoordinates,
	overrides: Partial<Unit> = {}
): Unit {
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
		elite: false,
		...overrides
	};
}

const seqRng = (values: number[]) => {
	let i = 0;
	return () => values[i++];
};

const CENTER: OffsetCoordinates = { col: 3, row: 3 };

describe('checkMorale — pass/fail by SP ratio', () => {
	it('full SP, no modifiers, rng=0 → passes (basePass 1.0)', () => {
		expect.assertions(4);
		const grid = buildGrid(openRect(7, 7));
		const u = unit('d', UnitType.LINE_INFANTRY, 1, CENTER);
		const attackerOrigin = neighborOffset(grid, CENTER, 3)!;
		const result = checkMorale(
			u,
			attackerOrigin,
			grid,
			[u],
			{ leaderAttached: false, outOfCommand: false },
			seqRng([0])
		);
		expect(result.passed).toBe(true);
		expect(result.finalPassChance).toBeCloseTo(1);
		expect(result.additionalDamage).toBe(0);
		expect(result.retreatTo).toBeNull();
	});

	it('half SP, no modifiers, rng=0.4 → passes (finalPass 0.5)', () => {
		expect.assertions(2);
		const grid = buildGrid(openRect(7, 7));
		const u = unit('d', UnitType.LINE_INFANTRY, 1, CENTER, { strengthPoints: 2 });
		const attackerOrigin = neighborOffset(grid, CENTER, 3)!;
		const result = checkMorale(
			u,
			attackerOrigin,
			grid,
			[u],
			{ leaderAttached: false, outOfCommand: false },
			seqRng([0.4])
		);
		expect(result.passed).toBe(true);
		expect(result.finalPassChance).toBeCloseTo(0.5);
	});

	it('half SP, no modifiers, rng=0.6 → fails; retreat populated, +1 damage', () => {
		expect.assertions(3);
		const grid = buildGrid(openRect(7, 7));
		const u = unit('d', UnitType.LINE_INFANTRY, 1, CENTER, { strengthPoints: 2 });
		const attackerOrigin = neighborOffset(grid, CENTER, 3)!;
		const result = checkMorale(
			u,
			attackerOrigin,
			grid,
			[u],
			{ leaderAttached: false, outOfCommand: false },
			seqRng([0.6])
		);
		expect(result.passed).toBe(false);
		expect(result.additionalDamage).toBe(1);
		expect(result.retreatTo).not.toBeNull();
	});
});

describe('checkMorale — modifiers', () => {
	it('elite at half SP shifts pass threshold to 0.65', () => {
		expect.assertions(2);
		const grid = buildGrid(openRect(7, 7));
		const u = unit('d', UnitType.LINE_INFANTRY, 1, CENTER, { strengthPoints: 2, elite: true });
		const attackerOrigin = neighborOffset(grid, CENTER, 3)!;
		const result = checkMorale(
			u,
			attackerOrigin,
			grid,
			[u],
			{ leaderAttached: false, outOfCommand: false },
			seqRng([0.6])
		);
		expect(result.finalPassChance).toBeCloseTo(0.65);
		expect(result.passed).toBe(true);
	});

	it('out of command at full SP shifts pass threshold to 0.85', () => {
		expect.assertions(2);
		const grid = buildGrid(openRect(7, 7));
		const u = unit('d', UnitType.LINE_INFANTRY, 1, CENTER);
		const attackerOrigin = neighborOffset(grid, CENTER, 3)!;
		const result = checkMorale(
			u,
			attackerOrigin,
			grid,
			[u],
			{ leaderAttached: false, outOfCommand: true },
			seqRng([0.9])
		);
		expect(result.finalPassChance).toBeCloseTo(0.85);
		expect(result.passed).toBe(false);
	});

	it('elite + leader + outOfCommand at half SP → 0.65 (mods cancel)', () => {
		expect.assertions(4);
		const grid = buildGrid(openRect(7, 7));
		const u = unit('d', UnitType.LINE_INFANTRY, 1, CENTER, { strengthPoints: 2, elite: true });
		const attackerOrigin = neighborOffset(grid, CENTER, 3)!;
		const result = checkMorale(
			u,
			attackerOrigin,
			grid,
			[u],
			{ leaderAttached: true, outOfCommand: true },
			seqRng([0.6])
		);
		expect(result.eliteModifier).toBeCloseTo(0.15);
		expect(result.leaderModifier).toBeCloseTo(0.15);
		expect(result.outOfCommandModifier).toBeCloseTo(-0.15);
		expect(result.finalPassChance).toBeCloseTo(0.65);
	});
});

describe('checkMorale — clamping', () => {
	it('clamps high: full SP + elite + leader → finalPass 1.0; rng 0.999 passes', () => {
		expect.assertions(2);
		const grid = buildGrid(openRect(7, 7));
		const u = unit('d', UnitType.LINE_INFANTRY, 1, CENTER, { elite: true });
		const attackerOrigin = neighborOffset(grid, CENTER, 3)!;
		const result = checkMorale(
			u,
			attackerOrigin,
			grid,
			[u],
			{ leaderAttached: true, outOfCommand: false },
			seqRng([0.999])
		);
		expect(result.finalPassChance).toBe(1);
		expect(result.passed).toBe(true);
	});

	it('clamps low: SP 1/4 + outOfCommand → finalPass clamps to ≥0; rng 0 still fails', () => {
		expect.assertions(2);
		const grid = buildGrid(openRect(7, 7));
		const u = unit('d', UnitType.LINE_INFANTRY, 1, CENTER, {
			strengthPoints: 1,
			maxStrengthPoints: 10
		});
		const attackerOrigin = neighborOffset(grid, CENTER, 3)!;
		const result = checkMorale(
			u,
			attackerOrigin,
			grid,
			[u],
			{ leaderAttached: false, outOfCommand: true },
			seqRng([0])
		);
		// 0.1 - 0.15 = -0.05 → clamps to 0; roll 0 is not < 0, so fails.
		expect(result.finalPassChance).toBe(0);
		expect(result.passed).toBe(false);
	});
});

describe('checkMorale — retreat selection', () => {
	it('fail in open ground retreats away from attacker', () => {
		expect.assertions(1);
		const grid = buildGrid(openRect(7, 7));
		const u = unit('d', UnitType.LINE_INFANTRY, 1, CENTER, { strengthPoints: 1 });
		const attackerOrigin = neighborOffset(grid, CENTER, 3)!; // direction 3 (W)
		const result = checkMorale(
			u,
			attackerOrigin,
			grid,
			[u],
			{ leaderAttached: false, outOfCommand: false },
			seqRng([0.99])
		);
		// Push direction is opposite of dir 3 → dir 0
		const expected = neighborOffset(grid, CENTER, 0);
		expect(coordsEqual(result.retreatTo!, expected!)).toBe(true);
	});

	it('fail with no legal retreat → retreatTo null, additionalDamage still 1', () => {
		expect.assertions(2);
		// Defender pinned in a corner against impassable terrain on all reachable neighbors
		const layout: Layout[] = [];
		// 3x3 grid where (0,0) is defender, everything else is LAKE (impassable)
		for (let col = 0; col < 3; col++)
			for (let row = 0; row < 3; row++)
				layout.push({
					col,
					row,
					terrain: col === 0 && row === 0 ? TerrainType.OPEN : TerrainType.LAKE
				});
		const grid = buildGrid(layout);
		const u = unit('d', UnitType.LINE_INFANTRY, 1, { col: 0, row: 0 }, { strengthPoints: 1 });
		const attackerOrigin = { col: 1, row: 0 };
		const result = checkMorale(
			u,
			attackerOrigin,
			grid,
			[u],
			{ leaderAttached: false, outOfCommand: false },
			seqRng([0.99])
		);
		expect(result.retreatTo).toBeNull();
		expect(result.additionalDamage).toBe(1);
	});
});

describe('checkMorale — transparency & determinism', () => {
	it('returned modifier fields match inputs and basePass equals SP/max', () => {
		expect.assertions(5);
		const grid = buildGrid(openRect(7, 7));
		const u = unit('d', UnitType.LINE_INFANTRY, 1, CENTER, { strengthPoints: 3, elite: true });
		const attackerOrigin = neighborOffset(grid, CENTER, 3)!;
		const result = checkMorale(
			u,
			attackerOrigin,
			grid,
			[u],
			{ leaderAttached: true, outOfCommand: false },
			seqRng([0.1])
		);
		expect(result.basePassChance).toBeCloseTo(0.75);
		expect(result.eliteModifier).toBeCloseTo(0.15);
		expect(result.leaderModifier).toBeCloseTo(0.15);
		expect(result.outOfCommandModifier).toBe(0);
		expect(result.remainingSP).toBe(3);
	});

	it('identical rng sequence produces identical results', () => {
		expect.assertions(3);
		const grid = buildGrid(openRect(7, 7));
		const u = unit('d', UnitType.LINE_INFANTRY, 1, CENTER, { strengthPoints: 2 });
		const attackerOrigin = neighborOffset(grid, CENTER, 3)!;
		const opts = { leaderAttached: false, outOfCommand: false };
		const r1 = checkMorale(u, attackerOrigin, grid, [u], opts, seqRng([0.6]));
		const r2 = checkMorale(u, attackerOrigin, grid, [u], opts, seqRng([0.6]));
		expect(r1.passed).toBe(r2.passed);
		expect(r1.finalPassChance).toBe(r2.finalPassChance);
		expect(r1.retreatTo).toEqual(r2.retreatTo);
	});
});
