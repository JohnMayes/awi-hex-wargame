import { describe, expect, it } from 'vitest';
import { runGame, randomPolicy, heuristicPolicy } from './playout';
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
