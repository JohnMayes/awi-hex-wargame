import { describe, expect, it } from 'vitest';
import { runGame, randomPolicy, heuristicPolicy } from './playout';
import { mechanicStats } from './report';
import { mulberry32 } from '../core/rng';
import { SCENARIOS } from '../data/scenarios';

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
