import { describe, expect, it } from 'vitest';
import type { OffsetCoordinates } from 'honeycomb-grid';
import { applyEliminations } from './elimination';
import type { Leader } from './command';
import { UnitType, type Player, type Unit } from './types';
import { unitDefinitions } from './unitDefinitions';

function unit(
	id: string,
	player: Player,
	coordinates: OffsetCoordinates,
	overrides: Partial<Unit> = {}
): Unit {
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
		elite: false,
		...overrides
	};
}

describe('applyEliminations', () => {
	it('no SP-0 units → returns copies with empty id lists', () => {
		expect.assertions(4);
		const units = [unit('a', 0, { col: 0, row: 0 }), unit('b', 1, { col: 1, row: 0 })];
		const leaders: Leader[] = [{ id: 'L', attachedToUnitId: 'a', commandRadius: 2 }];
		const out = applyEliminations(units, leaders);
		expect(out.units).toEqual(units);
		expect(out.leaders).toEqual(leaders);
		expect(out.result.eliminatedUnitIds).toEqual([]);
		expect(out.result.eliminatedLeaderIds).toEqual([]);
	});

	it('one unit at 0 SP, no leaders → removed; eliminatedUnitIds has its id', () => {
		expect.assertions(3);
		const dead = unit('dead', 0, { col: 0, row: 0 }, { strengthPoints: 0 });
		const alive = unit('alive', 0, { col: 1, row: 0 });
		const out = applyEliminations([dead, alive], []);
		expect(out.units.map((u) => u.id)).toEqual(['alive']);
		expect(out.result.eliminatedUnitIds).toEqual(['dead']);
		expect(out.result.eliminatedLeaderIds).toEqual([]);
	});

	it('eliminated unit with attached leader → both removed, both ids surfaced', () => {
		expect.assertions(3);
		const dead = unit('dead', 0, { col: 0, row: 0 }, { strengthPoints: 0 });
		const leaders: Leader[] = [{ id: 'L', attachedToUnitId: 'dead', commandRadius: 2 }];
		const out = applyEliminations([dead], leaders);
		expect(out.units).toEqual([]);
		expect(out.leaders).toEqual([]);
		expect(out.result).toEqual({
			eliminatedUnitIds: ['dead'],
			eliminatedLeaderIds: ['L']
		});
	});

	it('eliminated unit but leader is attached to a different live unit → only the dead unit goes', () => {
		expect.assertions(2);
		const dead = unit('dead', 0, { col: 0, row: 0 }, { strengthPoints: 0 });
		const alive = unit('alive', 0, { col: 1, row: 0 });
		const leaders: Leader[] = [{ id: 'L', attachedToUnitId: 'alive', commandRadius: 2 }];
		const out = applyEliminations([dead, alive], leaders);
		expect(out.leaders).toEqual(leaders);
		expect(out.result.eliminatedLeaderIds).toEqual([]);
	});

	it('multiple eliminations with mixed leader attachment → all ids surface in input order', () => {
		expect.assertions(2);
		const a = unit('a', 0, { col: 0, row: 0 }, { strengthPoints: 0 });
		const b = unit('b', 0, { col: 1, row: 0 });
		const c = unit('c', 0, { col: 2, row: 0 }, { strengthPoints: 0 });
		const leaders: Leader[] = [
			{ id: 'La', attachedToUnitId: 'a', commandRadius: 2 },
			{ id: 'Lc', attachedToUnitId: 'c', commandRadius: 2 }
		];
		const out = applyEliminations([a, b, c], leaders);
		expect(out.result.eliminatedUnitIds).toEqual(['a', 'c']);
		expect(out.result.eliminatedLeaderIds).toEqual(['La', 'Lc']);
	});

	it('leader whose host is missing from the units array → leader removed defensively', () => {
		expect.assertions(2);
		const a = unit('a', 0, { col: 0, row: 0 });
		const leaders: Leader[] = [
			{ id: 'L', attachedToUnitId: 'ghost', commandRadius: 2 },
			{ id: 'La', attachedToUnitId: 'a', commandRadius: 2 }
		];
		const out = applyEliminations([a], leaders);
		expect(out.leaders.map((l) => l.id)).toEqual(['La']);
		expect(out.result.eliminatedLeaderIds).toEqual(['L']);
	});

	it('does not mutate input arrays', () => {
		expect.assertions(2);
		const dead = unit('dead', 0, { col: 0, row: 0 }, { strengthPoints: 0 });
		const alive = unit('alive', 0, { col: 1, row: 0 });
		const units: Unit[] = [dead, alive];
		const leaders: Leader[] = [{ id: 'L', attachedToUnitId: 'dead', commandRadius: 2 }];
		const unitsSnapshot = [...units];
		const leadersSnapshot = [...leaders];
		applyEliminations(units, leaders);
		expect(units).toEqual(unitsSnapshot);
		expect(leaders).toEqual(leadersSnapshot);
	});

	it('idempotent: second call on clean state yields empty id lists', () => {
		expect.assertions(2);
		const dead = unit('dead', 0, { col: 0, row: 0 }, { strengthPoints: 0 });
		const alive = unit('alive', 0, { col: 1, row: 0 });
		const first = applyEliminations([dead, alive], []);
		const second = applyEliminations(first.units, first.leaders);
		expect(second.result.eliminatedUnitIds).toEqual([]);
		expect(second.result.eliminatedLeaderIds).toEqual([]);
	});
});
