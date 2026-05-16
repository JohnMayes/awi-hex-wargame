import { describe, expect, it } from 'vitest';
import { Grid, type OffsetCoordinates } from 'honeycomb-grid';
import {
	getAttachedLeader,
	isInCommand,
	resolveCommandCheck,
	resolveLeaderCasualty,
	type Leader
} from './command';
import { HexCell } from './hex';
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

describe('isInCommand', () => {
	it('adjacent unit + leader radius 2 → in command', () => {
		expect.assertions(1);
		const grid = buildGrid(openRect(7, 7));
		const host = unit('host', UnitType.LINE_INFANTRY, 0, { col: 3, row: 3 });
		const target = unit('t', UnitType.LIGHT_INFANTRY, 0, { col: 4, row: 3 });
		const leader: Leader = { id: 'L', attachedToUnitId: 'host', commandRadius: 2 };
		expect(isInCommand(target, [leader], [host, target], grid)).toBe(true);
	});

	it('distance 2 + radius 2 → in command (inclusive boundary)', () => {
		expect.assertions(1);
		const grid = buildGrid(openRect(7, 7));
		const host = unit('host', UnitType.LINE_INFANTRY, 0, { col: 3, row: 3 });
		const target = unit('t', UnitType.LIGHT_INFANTRY, 0, { col: 5, row: 3 });
		const leader: Leader = { id: 'L', attachedToUnitId: 'host', commandRadius: 2 };
		expect(isInCommand(target, [leader], [host, target], grid)).toBe(true);
	});

	it('distance 3 + radius 2 → out of command', () => {
		expect.assertions(1);
		const grid = buildGrid(openRect(7, 7));
		const host = unit('host', UnitType.LINE_INFANTRY, 0, { col: 3, row: 3 });
		const target = unit('t', UnitType.LIGHT_INFANTRY, 0, { col: 6, row: 3 });
		const leader: Leader = { id: 'L', attachedToUnitId: 'host', commandRadius: 2 };
		expect(isInCommand(target, [leader], [host, target], grid)).toBe(false);
	});

	it('enemy leader does not put the unit in command', () => {
		expect.assertions(1);
		const grid = buildGrid(openRect(7, 7));
		const enemyHost = unit('eh', UnitType.LINE_INFANTRY, 1, { col: 4, row: 3 });
		const target = unit('t', UnitType.LIGHT_INFANTRY, 0, { col: 3, row: 3 });
		const leader: Leader = { id: 'L', attachedToUnitId: 'eh', commandRadius: 5 };
		expect(isInCommand(target, [leader], [enemyHost, target], grid)).toBe(false);
	});

	it('multiple friendly leaders, only one in range → in command', () => {
		expect.assertions(1);
		const grid = buildGrid(openRect(10, 10));
		const closeHost = unit('h1', UnitType.LINE_INFANTRY, 0, { col: 4, row: 3 });
		const farHost = unit('h2', UnitType.ARTILLERY, 0, { col: 9, row: 9 });
		const target = unit('t', UnitType.LIGHT_INFANTRY, 0, { col: 3, row: 3 });
		const leaders: Leader[] = [
			{ id: 'far', attachedToUnitId: 'h2', commandRadius: 1 },
			{ id: 'near', attachedToUnitId: 'h1', commandRadius: 2 }
		];
		expect(isInCommand(target, leaders, [closeHost, farHost, target], grid)).toBe(true);
	});

	it('no friendly leaders → out of command', () => {
		expect.assertions(1);
		const grid = buildGrid(openRect(7, 7));
		const target = unit('t', UnitType.LIGHT_INFANTRY, 0, { col: 3, row: 3 });
		expect(isInCommand(target, [], [target], grid)).toBe(false);
	});

	it("leader's own attached unit is always in command, even at radius 0", () => {
		expect.assertions(1);
		const grid = buildGrid(openRect(7, 7));
		const host = unit('host', UnitType.LINE_INFANTRY, 0, { col: 3, row: 3 });
		const leader: Leader = { id: 'L', attachedToUnitId: 'host', commandRadius: 0 };
		expect(isInCommand(host, [leader], [host], grid)).toBe(true);
	});
});

describe('resolveCommandCheck', () => {
	it('in command → skipped, passed=true, no rng draw', () => {
		expect.assertions(4);
		const grid = buildGrid(openRect(7, 7));
		const host = unit('host', UnitType.LINE_INFANTRY, 0, { col: 3, row: 3 });
		const target = unit('t', UnitType.LIGHT_INFANTRY, 0, { col: 4, row: 3 });
		const leader: Leader = { id: 'L', attachedToUnitId: 'host', commandRadius: 2 };
		const draws: number[] = [];
		const rng = () => {
			draws.push(1);
			return 1;
		};
		const r = resolveCommandCheck(target, [leader], [host, target], grid, rng);
		expect(r.inCommand).toBe(true);
		expect(r.passed).toBe(true);
		expect(r.roll).toBe(0);
		expect(draws).toHaveLength(0);
	});

	it('out of command, within 2× radius → base 0.5, no penalty; rng 0.4 passes', () => {
		expect.assertions(3);
		const grid = buildGrid(openRect(10, 10));
		const host = unit('host', UnitType.LINE_INFANTRY, 0, { col: 0, row: 0 });
		// Distance 4, radius 2 → out of command, but 4 ≤ 2*2 → no penalty
		const target = unit('t', UnitType.LIGHT_INFANTRY, 0, { col: 4, row: 0 });
		const leader: Leader = { id: 'L', attachedToUnitId: 'host', commandRadius: 2 };
		const r = resolveCommandCheck(target, [leader], [host, target], grid, seqRng([0.4]));
		expect(r.finalPassChance).toBeCloseTo(0.5);
		expect(r.farPenalty).toBe(0);
		expect(r.passed).toBe(true);
	});

	it('out of command, beyond 2× radius → -0.15 penalty; rng 0.3 passes, rng 0.4 fails', () => {
		expect.assertions(4);
		const grid = buildGrid(openRect(10, 10));
		const host = unit('host', UnitType.LINE_INFANTRY, 0, { col: 0, row: 0 });
		// Distance 5, radius 2 → 5 > 4 → penalty
		const target = unit('t', UnitType.LIGHT_INFANTRY, 0, { col: 5, row: 0 });
		const leader: Leader = { id: 'L', attachedToUnitId: 'host', commandRadius: 2 };
		const passing = resolveCommandCheck(target, [leader], [host, target], grid, seqRng([0.3]));
		expect(passing.farPenalty).toBeCloseTo(-0.15);
		expect(passing.finalPassChance).toBeCloseTo(0.35);
		expect(passing.passed).toBe(true);
		const failing = resolveCommandCheck(target, [leader], [host, target], grid, seqRng([0.4]));
		expect(failing.passed).toBe(false);
	});

	it('no friendly leaders → base 0.5, no penalty, no nearest', () => {
		expect.assertions(3);
		const grid = buildGrid(openRect(7, 7));
		const target = unit('t', UnitType.LIGHT_INFANTRY, 0, { col: 3, row: 3 });
		const r = resolveCommandCheck(target, [], [target], grid, seqRng([0.6]));
		expect(r.nearestLeaderId).toBeNull();
		expect(r.finalPassChance).toBeCloseTo(0.5);
		expect(r.passed).toBe(false);
	});
});

describe('resolveLeaderCasualty', () => {
	it('unit with no attached leader → result null, leaders unchanged, no rng draw', () => {
		expect.assertions(3);
		const grid = buildGrid(openRect(7, 7));
		const host = unit('host', UnitType.LINE_INFANTRY, 0, { col: 3, row: 3 });
		const other = unit('o', UnitType.LIGHT_INFANTRY, 0, { col: 4, row: 3 });
		const leaders: Leader[] = [{ id: 'L', attachedToUnitId: 'host', commandRadius: 2 }];
		const draws: number[] = [];
		const rng = () => {
			draws.push(0);
			return 0;
		};
		const out = resolveLeaderCasualty('o', leaders, [host, other], grid, rng);
		expect(out.result).toBeNull();
		expect(out.leaders).toEqual(leaders);
		expect(draws).toHaveLength(0);
	});

	it('roll ≥ 0.15 → casualty=false, leaders unchanged', () => {
		expect.assertions(2);
		const grid = buildGrid(openRect(7, 7));
		const host = unit('host', UnitType.LINE_INFANTRY, 0, { col: 3, row: 3 });
		const leaders: Leader[] = [{ id: 'L', attachedToUnitId: 'host', commandRadius: 2 }];
		const out = resolveLeaderCasualty('host', leaders, [host], grid, seqRng([0.15]));
		expect(out.result?.casualty).toBe(false);
		expect(out.leaders).toEqual(leaders);
	});

	it('roll < 0.15 → original removed, replacement attached to nearest leaderless friendly with radius-1', () => {
		expect.assertions(4);
		const grid = buildGrid(openRect(7, 7));
		const host = unit('host', UnitType.LINE_INFANTRY, 0, { col: 3, row: 3 });
		const near = unit('near', UnitType.LIGHT_INFANTRY, 0, { col: 4, row: 3 });
		const far = unit('far', UnitType.ARTILLERY, 0, { col: 6, row: 3 });
		const leaders: Leader[] = [{ id: 'L', attachedToUnitId: 'host', commandRadius: 3 }];
		const out = resolveLeaderCasualty('host', leaders, [host, near, far], grid, seqRng([0.1]));
		expect(out.result?.casualty).toBe(true);
		expect(out.result?.replacementAttachedToUnitId).toBe('near');
		expect(out.result?.replacementRadius).toBe(2);
		expect(out.leaders.find((l) => l.attachedToUnitId === 'near')).toBeDefined();
	});

	it('radius 1 leader killed → replacement radius clamps to 0', () => {
		expect.assertions(1);
		const grid = buildGrid(openRect(7, 7));
		const host = unit('host', UnitType.LINE_INFANTRY, 0, { col: 3, row: 3 });
		const other = unit('o', UnitType.LIGHT_INFANTRY, 0, { col: 4, row: 3 });
		const leaders: Leader[] = [{ id: 'L', attachedToUnitId: 'host', commandRadius: 1 }];
		const out = resolveLeaderCasualty('host', leaders, [host, other], grid, seqRng([0.1]));
		expect(out.result?.replacementRadius).toBe(0);
	});

	it('no leaderless friendly unit available → original removed, no replacement', () => {
		expect.assertions(3);
		const grid = buildGrid(openRect(7, 7));
		const host = unit('host', UnitType.LINE_INFANTRY, 0, { col: 3, row: 3 });
		const leaders: Leader[] = [{ id: 'L', attachedToUnitId: 'host', commandRadius: 2 }];
		const out = resolveLeaderCasualty('host', leaders, [host], grid, seqRng([0.05]));
		expect(out.result?.casualty).toBe(true);
		expect(out.result?.replacementLeaderId).toBeNull();
		expect(out.leaders).toEqual([]);
	});

	it('replacement id format follows -r1, -r2 on successive deaths', () => {
		expect.assertions(2);
		const grid = buildGrid(openRect(7, 7));
		const host = unit('host', UnitType.LINE_INFANTRY, 0, { col: 3, row: 3 });
		const sub = unit('sub', UnitType.LIGHT_INFANTRY, 0, { col: 4, row: 3 });
		const sub2 = unit('sub2', UnitType.ARTILLERY, 0, { col: 5, row: 3 });
		const leaders: Leader[] = [{ id: 'L', attachedToUnitId: 'host', commandRadius: 2 }];
		const first = resolveLeaderCasualty('host', leaders, [host, sub, sub2], grid, seqRng([0.1]));
		expect(first.result?.replacementLeaderId).toBe('L-r1');
		const second = resolveLeaderCasualty(
			'sub',
			first.leaders,
			[host, sub, sub2],
			grid,
			seqRng([0.1])
		);
		expect(second.result?.replacementLeaderId).toBe('L-r1-r2');
	});
});

describe('getAttachedLeader', () => {
	it('returns the leader for an attached unit', () => {
		expect.assertions(1);
		const leaders: Leader[] = [{ id: 'L', attachedToUnitId: 'host', commandRadius: 2 }];
		expect(getAttachedLeader('host', leaders)?.id).toBe('L');
	});

	it('returns null when no leader is attached', () => {
		expect.assertions(1);
		const leaders: Leader[] = [{ id: 'L', attachedToUnitId: 'host', commandRadius: 2 }];
		expect(getAttachedLeader('other', leaders)).toBeNull();
	});
});
