import { describe, expect, it } from 'vitest';
import { runGame, randomPolicy } from './playout';
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
});
