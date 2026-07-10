import { describe, expect, it } from 'vitest';
import {
	runGame,
	randomPolicy,
	heuristicPolicy,
	smartHeuristicPolicy,
	scoreAction,
	goalHexes,
	aggressionFor,
	DEFAULT_SMART_TUNING,
	type Action
} from './playout';
import { mechanicStats } from './report';
import { mulberry32 } from '../core/rng';
import { SCENARIOS, TEST_LEADERS, TEST_UNITS } from '../data/scenarios';
import { TEST_MAP } from '../data/maps';
import { GameStore } from '../state/gameStore.svelte';
import { TerrainType, type Unit } from '../core/types';

describe('runGame determinism', () => {
	it('same seed → identical outcome', () => {
		expect.assertions(1);
		const scenario = SCENARIOS['pitched-battle'];
		const a = runGame(scenario, randomPolicy, randomPolicy, mulberry32(42));
		const b = runGame(scenario, randomPolicy, randomPolicy, mulberry32(42));
		expect(a).toEqual(b);
	});
});

describe('runGame termination', () => {
	// Random-vs-random must always reach a terminal outcome within the turn limit
	// (the turnLimit tiebreak backstops; runGame throws if its activation cap is hit).
	it.each(Object.values(SCENARIOS))('$name always terminates', (scenario) => {
		expect.assertions(1);
		const results = Array.from({ length: 30 }, (_, seed) =>
			runGame(scenario, randomPolicy, randomPolicy, mulberry32(seed))
		);
		expect(
			results.every((r) => r.outcome !== null && r.turns >= 1 && r.turns <= scenario.turnLimit)
		).toBe(true);
	});

	it.each(Object.values(SCENARIOS))('$name terminates under heuristicPolicy too', (scenario) => {
		expect.assertions(1);
		const results = Array.from({ length: 30 }, (_, seed) =>
			runGame(scenario, heuristicPolicy, heuristicPolicy, mulberry32(seed))
		);
		expect(
			results.every((r) => r.outcome !== null && r.turns >= 1 && r.turns <= scenario.turnLimit)
		).toBe(true);
	});
});

describe('heuristicPolicy plays better than random', () => {
	// Sanity that the policy actually engages: heuristic-as-blue should out-damage
	// a random red on the symmetric scenario. Net surviving-SP swing, not win rate,
	// so it doesn't hinge on tiebreak quirks.
	it('out-damages random on the symmetric scenario', () => {
		expect.assertions(1);
		const scenario = SCENARIOS['pitched-battle'];
		let heuristicEdge = 0;
		for (let seed = 0; seed < 40; seed++) {
			const g = runGame(scenario, heuristicPolicy, randomPolicy, mulberry32(seed));
			heuristicEdge += g.survivingSpByPlayer[0] - g.survivingSpByPlayer[1];
		}
		expect(heuristicEdge).toBeGreaterThan(0);
	});
});

describe('scoreAction — elevated-defender charge protection', () => {
	// An elevated defender's charge protection is worth +1 (in SP units), so an
	// equal-SP charge the AI takes on flat ground must be gated out uphill.
	const chargeScore = (defenderCoords: { col: number; row: number }): number => {
		const units = structuredClone(TEST_UNITS) as Unit[];
		const attacker = units.find((u) => u.player === 0)!;
		const defender = units.find((u) => u.player === 1)!;
		attacker.strengthPoints = 4;
		defender.strengthPoints = 4;
		defender.coordinates = defenderCoords;
		const store = new GameStore(units, TEST_MAP, structuredClone(TEST_LEADERS));
		const a = store.units.find((u) => u.id === attacker.id)!;
		const action: Action = { kind: 'charge', unitId: a.id, targetId: defender.id };
		return scoreAction(store, a, action, DEFAULT_SMART_TUNING);
	};

	it('scores an equal-SP charge on OPEN ground (not gated)', () => {
		expect.assertions(1);
		expect(chargeScore({ col: 1, row: 1 })).toBeGreaterThan(-Infinity); // (1,1) is OPEN
	});

	it('gates the same charge into a HILLTOP defender', () => {
		expect.assertions(1);
		expect(chargeScore({ col: 2, row: 2 })).toBe(-Infinity); // (2,2) is HILLTOP
	});
});

describe('goalHexes — objective saturation (phase 1)', () => {
	const HILL = { col: 3, row: 4 }; // Pitched Battle central hill (a control_hexes objective for both)
	const has = (goals: { col: number; row: number }[], c: { col: number; row: number }) =>
		goals.some((g) => g.col === c.col && g.row === c.row);

	it('a held objective is a goal only for its occupier', () => {
		expect.assertions(2);
		const store = GameStore.fromScenario(SCENARIOS['pitched-battle']);
		const blues = store.units.filter((u) => u.player === 0);
		blues[0].coordinates = { ...HILL }; // occupier dwells
		blues[1].coordinates = { col: 2, row: 8 }; // elsewhere → should not also head for the hill
		expect(has(goalHexes(store, blues[0], true, 1), HILL)).toBe(true);
		expect(has(goalHexes(store, blues[1], true, 1), HILL)).toBe(false);
	});

	it('an unheld objective is a goal only for the nearest claimant', () => {
		expect.assertions(2);
		const store = GameStore.fromScenario(SCENARIOS['pitched-battle']);
		const blues = store.units.filter((u) => u.player === 0);
		blues[0].coordinates = { col: 3, row: 5 }; // adjacent to the hill → the single nearest friendly
		expect(has(goalHexes(store, blues[0], true, 1), HILL)).toBe(true);
		expect(has(goalHexes(store, blues[1], true, 1), HILL)).toBe(false); // farther unit drops it
	});
});

describe('scoreAction — support/exposure + focus fire (phase 2)', () => {
	// Reposition TEST_UNITS onto the small TEST_MAP and build a store. Each test isolates one
	// new term by toggling only its weight, so every other term cancels in the comparison.
	const placed = (spec: Record<string, { col: number; row: number; sp?: number }>): GameStore => {
		const units = structuredClone(TEST_UNITS) as Unit[];
		for (const u of units) {
			const s = spec[u.id];
			if (!s) continue;
			u.coordinates = { col: s.col, row: s.row };
			if (s.sp !== undefined) u.strengthPoints = s.sp;
		}
		return new GameStore(units, TEST_MAP, structuredClone(TEST_LEADERS));
	};

	it('exposure lowers a move score when enemies can fire the destination', () => {
		expect.assertions(2);
		// Actor at (0,1); red artillery adjacent to the destination at (2,1) — dist 1 so LOS is
		// always clear — can fire (1,1) and is the goal drawing the advance, so the move to (1,1)
		// is closer (ungated) and threatened (exposure ≥ 1).
		const store = placed({
			'blue-line-inf': { col: 0, row: 1 },
			'blue-light-inf': { col: 0, row: 3 },
			'blue-dragoons': { col: 1, row: 3 },
			'red-artillery': { col: 2, row: 1 }
		});
		const u = store.units.find((x) => x.id === 'blue-line-inf')!;
		const move: Action = { kind: 'move', unitId: u.id, coords: { col: 1, row: 1 } };
		const base = scoreAction(store, u, move, { ...DEFAULT_SMART_TUNING, exposureWeight: 0 });
		const exposed = scoreAction(store, u, move, { ...DEFAULT_SMART_TUNING, exposureWeight: 1 });
		expect(base).toBeGreaterThan(-Infinity); // move is not gated
		expect(exposed).toBeLessThan(base);
	});

	it('mutual support raises a move score when a friendly covers the destination', () => {
		expect.assertions(1);
		const store = placed({
			'blue-line-inf': { col: 0, row: 1 },
			'blue-light-inf': { col: 0, row: 3 },
			'blue-dragoons': { col: 1, row: 2 }, // covers (1,1) at range 1, off the goal-LOS line
			'red-artillery': { col: 3, row: 1 } // goal so the move is closer/ungated
		});
		const u = store.units.find((x) => x.id === 'blue-line-inf')!;
		const move: Action = { kind: 'move', unitId: u.id, coords: { col: 1, row: 1 } };
		const noSup = scoreAction(store, u, move, { ...DEFAULT_SMART_TUNING, supportWeight: 0 });
		const withSup = scoreAction(store, u, move, { ...DEFAULT_SMART_TUNING, supportWeight: 1 });
		expect(withSup).toBeGreaterThan(noSup);
	});

	it('focus fire prefers a wounded target and one more friendlies can hit', () => {
		expect.assertions(2);
		const store = placed({
			'blue-line-inf': { col: 1, row: 1 },
			'blue-light-inf': { col: 1, row: 3 },
			'blue-dragoons': { col: 0, row: 3 },
			'red-horse': { col: 2, row: 1, sp: 1 }, // wounded target, adjacent
			'red-light-horse': { col: 0, row: 1 },
			'red-artillery': { col: 5, row: 3 }
		});
		const u = store.units.find((x) => x.id === 'blue-line-inf')!;
		const fire: Action = { kind: 'fire', unitId: u.id, targetId: 'red-horse' };
		const w0 = scoreAction(store, u, fire, { ...DEFAULT_SMART_TUNING, woundedWeight: 0 });
		const w1 = scoreAction(store, u, fire, { ...DEFAULT_SMART_TUNING, woundedWeight: 0.5 });
		expect(w1).toBeGreaterThan(w0); // wounded bonus
		const c0 = scoreAction(store, u, fire, { ...DEFAULT_SMART_TUNING, concentrationWeight: 0 });
		const c1 = scoreAction(store, u, fire, { ...DEFAULT_SMART_TUNING, concentrationWeight: 0.5 });
		expect(c1).toBeGreaterThan(c0); // concentration bonus (≥1 firer on target)
	});
});

describe('aggression scaling (phase 3)', () => {
	it('aggressionFor: behind with the clock running out presses; ahead as the timeout winner holds', () => {
		expect.assertions(2);
		// (a) blue far behind on SP, clock spent, red wins on timeout → blue must press (> 1).
		const behind = structuredClone(TEST_UNITS) as Unit[];
		behind.filter((u) => u.player === 0).forEach((u) => (u.strengthPoints = 1));
		const sA = new GameStore(behind, TEST_MAP, [], { turnLimit: 5, turnLimitWinner: 1 });
		sA.turn = 5;
		expect(aggressionFor(sA, 0)).toBeGreaterThan(1);
		// (b) blue well ahead, clock spent, blue wins on timeout → blue holds/stalls (< 1).
		const ahead = structuredClone(TEST_UNITS) as Unit[];
		ahead.filter((u) => u.player === 1).forEach((u) => (u.strengthPoints = 1));
		const sB = new GameStore(ahead, TEST_MAP, [], { turnLimit: 5, turnLimitWinner: 0 });
		sB.turn = 5;
		expect(aggressionFor(sB, 0)).toBeLessThan(1);
	});

	it('aggression opens a marginal charge (unit weaker by 1) that neutral play gates', () => {
		expect.assertions(2);
		const units = structuredClone(TEST_UNITS) as Unit[];
		const actor = units.find((u) => u.player === 0)!;
		actor.strengthPoints = 3;
		const target = units.find((u) => u.player === 1)!;
		target.strengthPoints = 4;
		target.coordinates = { col: 1, row: 1 }; // OPEN — not elevated
		const store = new GameStore(units, TEST_MAP, structuredClone(TEST_LEADERS));
		const a = store.units.find((u) => u.id === actor.id)!;
		const charge: Action = { kind: 'charge', unitId: a.id, targetId: target.id };
		expect(scoreAction(store, a, charge, DEFAULT_SMART_TUNING, 1)).toBe(-Infinity); // neutral: gated (3 < 4)
		expect(scoreAction(store, a, charge, DEFAULT_SMART_TUNING, 1.8)).toBeGreaterThan(-Infinity); // press: allowed
	});
});

describe('smartHeuristicPolicy', () => {
	it.each(Object.values(SCENARIOS))('$name terminates under smartHeuristicPolicy', (scenario) => {
		expect.assertions(1);
		const results = Array.from({ length: 30 }, (_, seed) =>
			runGame(scenario, smartHeuristicPolicy, smartHeuristicPolicy, mulberry32(seed))
		);
		expect(
			results.every((r) => r.outcome !== null && r.turns >= 1 && r.turns <= scenario.turnLimit)
		).toBe(true);
	});

	// The objective-aware policy must not regress strength. Paired-mirror A/B (smart and
	// baseline each play each side on the same seed, cancelling scenario side-bias),
	// aggregated across every scenario so one map's noise can't flip the sign. We count
	// WINS, not surviving SP: on an escape scenario (White Plains) correct play sacrifices
	// SP to run for the exit, so an SP metric penalises the right move (see the
	// objective-aware section in docs/ai-opponent-evaluation.md). Smart must win strictly
	// more games than the baseline across the suite.
	it('does not regress vs the baseline (net wins across scenarios)', () => {
		expect.assertions(1);
		let edge = 0;
		const tally = (g: ReturnType<typeof runGame>, smartPlayer: 0 | 1) => {
			if (g.outcome?.status === 'won' && g.outcome.winner !== null)
				edge += g.outcome.winner === smartPlayer ? 1 : -1;
		};
		for (const scenario of Object.values(SCENARIOS)) {
			for (let seed = 0; seed < 30; seed++) {
				tally(runGame(scenario, smartHeuristicPolicy, heuristicPolicy, mulberry32(seed)), 0);
				tally(runGame(scenario, heuristicPolicy, smartHeuristicPolicy, mulberry32(seed)), 1);
			}
		}
		expect(edge).toBeGreaterThan(0);
	});
});

describe('objective-aware goal-seeking', () => {
	// raze: British dwell on the Charlestown TOWN hexes until the torchRule burns
	// them — no explicit action, emergent from goalHexes targeting TOWN + the "only
	// advance" rule holding a unit on a zero-distance goal. A batch must show burns.
	it('smart torches Charlestown on Bunker Hill', () => {
		expect.assertions(1);
		const scenario = SCENARIOS['bunker-hill'];
		const games = Array.from({ length: 20 }, (_, seed) =>
			runGame(scenario, smartHeuristicPolicy, smartHeuristicPolicy, mulberry32(seed))
		);
		expect(mechanicStats(games).hexesRazed).toBeGreaterThan(0);
	});

	// exit: Colonials run for the north exit and leave the board. The scenario is not
	// Colonial-winnable (single exit hex + no terrain-aware routing — see
	// docs/ai-opponent-evaluation.md), so we assert pursuit (exits happen), not a win.
	it('smart marches Colonials off the map on White Plains', () => {
		expect.assertions(1);
		const scenario = SCENARIOS['white-plains'];
		const games = Array.from({ length: 20 }, (_, seed) =>
			runGame(scenario, smartHeuristicPolicy, smartHeuristicPolicy, mulberry32(seed))
		);
		expect(mechanicStats(games).unitsExited).toBeGreaterThan(0);
	});
});

describe('mechanicStats (log-derived metrics)', () => {
	// The heuristic engages, so a batch must show fire happening with a sane hit
	// rate, and every counted stat must be internally consistent with its parts.
	it('aggregates the game log into consistent mechanic totals', () => {
		expect.assertions(6);
		const scenario = SCENARIOS['pitched-battle'];
		const games = Array.from({ length: 20 }, (_, seed) =>
			runGame(scenario, heuristicPolicy, heuristicPolicy, mulberry32(seed))
		);
		const s = mechanicStats(games);

		expect(s.fire.shots).toBeGreaterThan(0); // the policy actually fires
		expect(s.fire.hits).toBeLessThanOrEqual(s.fire.shots); // hits are a subset of shots
		expect(s.morale.breaks).toBeLessThanOrEqual(s.morale.checks);
		expect(s.command.failures).toBeLessThanOrEqual(s.command.checks);
		// Charge outcomes partition the total.
		const c = s.charge;
		expect(c.defenderEliminated + c.defenderRetreats + c.defenderHolds + c.attackerRepulsed).toBe(
			c.count
		);
		// Every activation logs a command check, so there's at least one per game.
		expect(s.command.checks).toBeGreaterThanOrEqual(games.length);
	});
});
