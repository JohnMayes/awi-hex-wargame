import { describe, expect, it } from 'vitest';
import {
	boundsFromCoords,
	edgeOf,
	emptyVictoryProgress,
	evaluateVictory,
	type VictoryCondition,
	type VictoryProgress,
	type VictorySnapshot
} from './victory';
import type { Player } from './types';

// --- Test fixtures & helpers ---

type SnapUnit = {
	id: string;
	player: Player;
	strengthPoints: number;
	coordinates: { col: number; row: number };
};

const u = (id: string, player: Player, sp: number, col: number, row: number): SnapUnit => ({
	id,
	player,
	strengthPoints: sp,
	coordinates: { col, row }
});

function snapshot(opts: {
	turn: number;
	turnLimit?: number | null;
	units: SnapUnit[];
	eliminated?: Record<Player, number>;
	bounds?: VictorySnapshot['bounds'];
	exitedThisTurn?: VictorySnapshot['exitedThisTurn'];
	burnedHexes?: number;
}): VictorySnapshot {
	return {
		turn: opts.turn,
		turnLimit: opts.turnLimit ?? null,
		units: opts.units,
		eliminatedByPlayer: opts.eliminated ?? ({ 0: 0, 1: 0 } as Record<Player, number>),
		bounds: opts.bounds ?? { minCol: 0, maxCol: 6, minRow: 0, maxRow: 8 },
		exitedThisTurn: opts.exitedThisTurn ?? [],
		burnedHexes: opts.burnedHexes ?? 0
	};
}

const progress = (p?: Partial<VictoryProgress>): VictoryProgress => ({
	...emptyVictoryProgress(),
	...p
});

// --- Helpers ---

describe('boundsFromCoords', () => {
	it('computes min/max col & row over a 7×9 field', () => {
		expect.assertions(1);
		const coords = [];
		for (let col = 0; col < 7; col++) for (let row = 0; row < 9; row++) coords.push({ col, row });
		expect(boundsFromCoords(coords)).toEqual({ minCol: 0, maxCol: 6, minRow: 0, maxRow: 8 });
	});
});

describe('edgeOf', () => {
	const bounds = { minCol: 0, maxCol: 6, minRow: 0, maxRow: 8 };
	it('classifies the four edges and interior', () => {
		expect.assertions(5);
		expect(edgeOf({ col: 3, row: 0 }, bounds)).toBe('north');
		expect(edgeOf({ col: 3, row: 8 }, bounds)).toBe('south');
		expect(edgeOf({ col: 0, row: 4 }, bounds)).toBe('west');
		expect(edgeOf({ col: 6, row: 4 }, bounds)).toBe('east');
		expect(edgeOf({ col: 3, row: 4 }, bounds)).toBeNull();
	});
});

// --- No-op contract ---

describe('evaluateVictory — no-op', () => {
	it('no conditions + no turn limit → progress unchanged, outcome null', () => {
		expect.assertions(2);
		const prog = progress();
		const r = evaluateVictory([], snapshot({ turn: 99, units: [u('a', 0, 4, 0, 0)] }), prog);
		expect(r.outcome).toBeNull();
		expect(r.progress).toBe(prog);
	});
});

// --- eliminate_units ---

describe('evaluateVictory — eliminate_units', () => {
	const cond: VictoryCondition = {
		kind: 'eliminate_units',
		id: 'elim-0',
		player: 0,
		description: 'kill 2',
		count: 2
	};
	it('below threshold → no outcome', () => {
		expect.assertions(1);
		const units = [u('a', 0, 4, 0, 0), u('e1', 1, 4, 5, 0)];
		const r = evaluateVictory(
			[cond],
			snapshot({ turn: 3, units, eliminated: { 0: 0, 1: 1 }, turnLimit: 15 }),
			progress()
		);
		expect(r.outcome).toBeNull();
	});

	it('at threshold → player 0 wins by condition', () => {
		expect.assertions(3);
		const units = [u('a', 0, 4, 0, 0)];
		const r = evaluateVictory(
			[cond],
			snapshot({ turn: 3, units, eliminated: { 0: 0, 1: 2 }, turnLimit: 15 }),
			progress()
		);
		expect(r.outcome?.status).toBe('won');
		expect(r.outcome?.winner).toBe(0);
		expect(r.outcome?.conditionId).toBe('elim-0');
	});

	it('above threshold still wins', () => {
		expect.assertions(1);
		const units = [u('a', 0, 4, 0, 0)];
		const r = evaluateVictory(
			[cond],
			snapshot({ turn: 5, units, eliminated: { 0: 0, 1: 3 }, turnLimit: 15 }),
			progress()
		);
		expect(r.outcome?.winner).toBe(0);
	});

	it('counts kills cumulatively, independent of the surviving roster', () => {
		expect.assertions(1);
		// The enemy still fields live units (e.g. reinforcements), but the kill tally
		// has reached the threshold — the current roster size is irrelevant.
		const units = [u('a', 0, 4, 0, 0), u('e1', 1, 4, 5, 0), u('e2', 1, 4, 5, 1)];
		const r = evaluateVictory(
			[cond],
			snapshot({ turn: 3, units, eliminated: { 0: 0, 1: 2 }, turnLimit: 15 }),
			progress()
		);
		expect(r.outcome?.winner).toBe(0);
	});
});

// --- control_hexes ---

describe('evaluateVictory — control_hexes (atTurn null)', () => {
	const base = {
		kind: 'control_hexes' as const,
		id: 'ctrl-0',
		player: 0 as Player,
		description: 'hold',
		atTurn: null
	};

	it('friendly unit on the hex → win', () => {
		expect.assertions(2);
		const cond: VictoryCondition = { ...base, hexes: [{ col: 3, row: 4 }], requireAll: true };
		const units = [u('a', 0, 4, 3, 4)];
		const r = evaluateVictory([cond], snapshot({ turn: 2, units, turnLimit: 15 }), progress());
		expect(r.outcome?.status).toBe('won');
		expect(r.outcome?.winner).toBe(0);
	});

	it('enemy on the hex → no control', () => {
		expect.assertions(1);
		const cond: VictoryCondition = { ...base, hexes: [{ col: 3, row: 4 }], requireAll: true };
		const units = [u('e', 1, 4, 3, 4)];
		const r = evaluateVictory([cond], snapshot({ turn: 2, units, turnLimit: 15 }), progress());
		expect(r.outcome).toBeNull();
	});

	it('empty hex → no control', () => {
		expect.assertions(1);
		const cond: VictoryCondition = { ...base, hexes: [{ col: 3, row: 4 }], requireAll: true };
		const units = [u('a', 0, 4, 0, 0)];
		const r = evaluateVictory([cond], snapshot({ turn: 2, units, turnLimit: 15 }), progress());
		expect(r.outcome).toBeNull();
	});

	it('requireAll true → needs every hex', () => {
		expect.assertions(2);
		const cond: VictoryCondition = {
			...base,
			hexes: [
				{ col: 3, row: 4 },
				{ col: 4, row: 4 }
			],
			requireAll: true
		};
		const partial = [u('a', 0, 4, 3, 4)];
		expect(
			evaluateVictory([cond], snapshot({ turn: 2, units: partial, turnLimit: 15 }), progress())
				.outcome
		).toBeNull();
		const both = [u('a', 0, 4, 3, 4), u('b', 0, 4, 4, 4)];
		expect(
			evaluateVictory([cond], snapshot({ turn: 2, units: both, turnLimit: 15 }), progress()).outcome
				?.winner
		).toBe(0);
	});

	it('requireAll false → any hex suffices', () => {
		expect.assertions(1);
		const cond: VictoryCondition = {
			...base,
			hexes: [
				{ col: 3, row: 4 },
				{ col: 4, row: 4 }
			],
			requireAll: false
		};
		const units = [u('a', 0, 4, 4, 4)];
		expect(
			evaluateVictory([cond], snapshot({ turn: 2, units, turnLimit: 15 }), progress()).outcome
				?.winner
		).toBe(0);
	});
});

describe('evaluateVictory — control_hexes (atTurn 15)', () => {
	const cond: VictoryCondition = {
		kind: 'control_hexes',
		id: 'ctrl-0',
		player: 0,
		description: 'hold at 15',
		hexes: [{ col: 3, row: 4 }],
		requireAll: true,
		atTurn: 15
	};

	it('controlled but before the target turn → not decisive', () => {
		expect.assertions(1);
		const units = [u('a', 0, 4, 3, 4)];
		const r = evaluateVictory([cond], snapshot({ turn: 14, units, turnLimit: 15 }), progress());
		expect(r.outcome).toBeNull();
	});

	it('controlled at the target turn → win', () => {
		expect.assertions(2);
		const units = [u('a', 0, 4, 3, 4)];
		const r = evaluateVictory([cond], snapshot({ turn: 15, units, turnLimit: 15 }), progress());
		expect(r.outcome?.reason).toBe('condition_met');
		expect(r.outcome?.winner).toBe(0);
	});
});

// --- hold_hexes ---

describe('evaluateVictory — hold_hexes', () => {
	const cond: VictoryCondition = {
		kind: 'hold_hexes',
		id: 'hold-0',
		player: 0,
		description: 'hold 3 turns',
		hexes: [{ col: 3, row: 4 }],
		requireAll: true,
		consecutiveTurns: 3
	};
	const held = [u('a', 0, 4, 3, 4)];
	const lost = [u('a', 0, 4, 0, 0)];

	it('streak increments while controlled, no win before threshold', () => {
		expect.assertions(2);
		const r1 = evaluateVictory(
			[cond],
			snapshot({ turn: 1, units: held, turnLimit: 15 }),
			progress()
		);
		expect(r1.progress.holdStreaks['hold-0']).toBe(1);
		const r2 = evaluateVictory(
			[cond],
			snapshot({ turn: 2, units: held, turnLimit: 15 }),
			r1.progress
		);
		expect(r2.outcome).toBeNull();
	});

	it('resets on a gap', () => {
		expect.assertions(1);
		const r1 = evaluateVictory(
			[cond],
			snapshot({ turn: 1, units: held, turnLimit: 15 }),
			progress()
		);
		const r2 = evaluateVictory(
			[cond],
			snapshot({ turn: 2, units: lost, turnLimit: 15 }),
			r1.progress
		);
		expect(r2.progress.holdStreaks['hold-0']).toBe(0);
	});

	it('wins on the third consecutive held turn', () => {
		expect.assertions(2);
		let prog = progress();
		let last;
		for (let turn = 1; turn <= 3; turn++) {
			last = evaluateVictory([cond], snapshot({ turn, units: held, turnLimit: 15 }), prog);
			prog = last.progress;
		}
		expect(last!.outcome?.winner).toBe(0);
		expect(last!.progress.holdStreaks['hold-0']).toBe(3);
	});
});

// --- exit_units ---

describe('evaluateVictory — exit_units', () => {
	const cond: VictoryCondition = {
		kind: 'exit_units',
		id: 'exit-0',
		player: 0,
		description: 'exit 2 east',
		edge: 'east',
		count: 2
	};

	it('accumulates exits across turns and wins at the count', () => {
		expect.assertions(3);
		const r1 = evaluateVictory(
			[cond],
			snapshot({
				turn: 1,
				units: [],
				turnLimit: 15,
				exitedThisTurn: [{ unitId: 'a', player: 0, edge: 'east' }]
			}),
			progress()
		);
		expect(r1.progress.exitedCounts['exit-0']).toBe(1);
		expect(r1.outcome).toBeNull();
		const r2 = evaluateVictory(
			[cond],
			snapshot({
				turn: 2,
				units: [],
				turnLimit: 15,
				exitedThisTurn: [{ unitId: 'b', player: 0, edge: 'east' }]
			}),
			r1.progress
		);
		expect(r2.outcome?.winner).toBe(0);
	});

	it('ignores exits by the wrong player or wrong edge', () => {
		expect.assertions(1);
		const r = evaluateVictory(
			[cond],
			snapshot({
				turn: 1,
				units: [],
				turnLimit: 15,
				exitedThisTurn: [
					{ unitId: 'x', player: 1, edge: 'east' },
					{ unitId: 'y', player: 0, edge: 'west' }
				]
			}),
			progress()
		);
		expect(r.progress.exitedCounts['exit-0']).toBe(0);
	});
});

// --- turn-limit tiebreak ---

describe('evaluateVictory — turn-limit tiebreak', () => {
	const cond: VictoryCondition = {
		kind: 'eliminate_units',
		id: 'elim-0',
		player: 0,
		description: 'kill 6',
		count: 6
	};

	it('no winner at the limit → more SP wins', () => {
		expect.assertions(3);
		const units = [u('a', 0, 4, 0, 0), u('b', 0, 3, 0, 1), u('e', 1, 2, 5, 0)];
		const r = evaluateVictory(
			[cond],
			snapshot({
				turn: 15,
				units,
				turnLimit: 15,
				eliminated: { 0: 0, 1: 1 } as Record<Player, number>
			}),
			progress()
		);
		expect(r.outcome?.status).toBe('won');
		expect(r.outcome?.winner).toBe(0);
		expect(r.outcome?.reason).toBe('turn_limit_tiebreak');
	});

	it('equal SP at the limit → draw', () => {
		expect.assertions(3);
		const units = [u('a', 0, 4, 0, 0), u('e', 1, 4, 5, 0)];
		const r = evaluateVictory(
			[cond],
			snapshot({
				turn: 15,
				units,
				turnLimit: 15,
				eliminated: { 0: 0, 1: 0 } as Record<Player, number>
			}),
			progress()
		);
		expect(r.outcome?.status).toBe('draw');
		expect(r.outcome?.winner).toBeNull();
		expect(r.outcome?.reason).toBe('turn_limit_draw');
	});

	it('before the limit with no winner → game continues', () => {
		expect.assertions(1);
		const units = [u('a', 0, 4, 0, 0), u('e', 1, 1, 5, 0)];
		const r = evaluateVictory([cond], snapshot({ turn: 14, units, turnLimit: 15 }), progress());
		expect(r.outcome).toBeNull();
	});
});

// --- mutual satisfaction ---

describe('evaluateVictory — mutual satisfaction', () => {
	it('both sides satisfy a condition → resolved by tiebreak, not active player', () => {
		expect.assertions(2);
		const conds: VictoryCondition[] = [
			{ kind: 'eliminate_units', id: 'elim-0', player: 0, description: '', count: 1 },
			{ kind: 'eliminate_units', id: 'elim-1', player: 1, description: '', count: 1 }
		];
		// Each side has scored one kill (both satisfy count 1); player 1 has more SP.
		const units = [u('a', 0, 1, 0, 0), u('e', 1, 4, 5, 0)];
		const r = evaluateVictory(
			conds,
			snapshot({ turn: 5, units, eliminated: { 0: 1, 1: 1 }, turnLimit: 15 }),
			progress()
		);
		expect(r.outcome?.reason).toBe('turn_limit_tiebreak');
		expect(r.outcome?.winner).toBe(1);
	});
});

describe('evaluateVictory — raze', () => {
	const razeCond: VictoryCondition = {
		kind: 'raze',
		id: 'raze-0',
		player: 1,
		description: '',
		count: 2
	};

	it('wins when burned hexes reach the count', () => {
		expect.assertions(2);
		const r = evaluateVictory(
			[razeCond],
			snapshot({ turn: 4, units: [u('a', 0, 3, 0, 0)], burnedHexes: 2 }),
			progress()
		);
		expect(r.outcome?.status).toBe('won');
		expect(r.outcome?.winner).toBe(1);
	});

	it('does not win below the count', () => {
		expect.assertions(1);
		const r = evaluateVictory(
			[razeCond],
			snapshot({ turn: 4, units: [u('a', 0, 3, 0, 0)], burnedHexes: 1 }),
			progress()
		);
		expect(r.outcome).toBeNull();
	});
});

describe('evaluateVictory — grouped conditions (AND)', () => {
	// British (player 1) win requires BOTH: burn ≥1 hex AND break ≥4 Colonials.
	const britWin: VictoryCondition[] = [
		{ kind: 'raze', id: 'r', player: 1, group: 'brit', description: '', count: 1 },
		{ kind: 'eliminate_units', id: 'e', player: 1, group: 'brit', description: '', count: 4 }
	];
	const survivor = [u('a', 0, 3, 0, 0)];

	it('wins only when every member of the group is satisfied', () => {
		expect.assertions(2);
		const r = evaluateVictory(
			britWin,
			snapshot({ turn: 4, units: survivor, eliminated: { 0: 4, 1: 0 }, burnedHexes: 1 }),
			progress()
		);
		expect(r.outcome?.status).toBe('won');
		expect(r.outcome?.winner).toBe(1);
	});

	it('does not win when only the raze half is met', () => {
		expect.assertions(1);
		const r = evaluateVictory(
			britWin,
			snapshot({ turn: 4, units: survivor, eliminated: { 0: 2, 1: 0 }, burnedHexes: 1 }),
			progress()
		);
		expect(r.outcome).toBeNull();
	});

	it('does not win when only the eliminate half is met (no hex burned)', () => {
		expect.assertions(1);
		const r = evaluateVictory(
			britWin,
			snapshot({ turn: 4, units: survivor, eliminated: { 0: 4, 1: 0 }, burnedHexes: 0 }),
			progress()
		);
		expect(r.outcome).toBeNull();
	});
});
