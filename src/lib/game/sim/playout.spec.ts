import { describe, expect, it } from 'vitest';
import {
	runGame,
	randomPolicy,
	heuristicPolicy,
	smartHeuristicPolicy,
	scoreAction,
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
