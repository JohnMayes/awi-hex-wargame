import { describe, expect, it } from 'vitest';
import { GameStore } from '../state/gameStore.svelte';
import { BUNKER_HILL, SCENARIOS } from './scenarios';
import { canUnitEnterTerrain } from '../core/terrain';

// Data-coherence smoke tests for the Bunker Hill scenario: catch stacked units,
// units placed on terrain they cannot enter, off-map placement, and that the
// signature features (entrenchments + torchRule) are wired through to the grid.
describe('BUNKER_HILL scenario', () => {
	it('is registered and builds a GameStore without throwing', () => {
		expect.assertions(2);
		expect(SCENARIOS['bunker-hill']).toBe(BUNKER_HILL);
		const store = GameStore.fromScenario(BUNKER_HILL);
		expect(store.grid).toBeDefined();
	});

	it('places every starting unit on a distinct, on-map, enterable hex', () => {
		expect.assertions(BUNKER_HILL.units.length * 2 + 1);
		const store = GameStore.fromScenario(BUNKER_HILL);
		const seen = new Set<string>();
		for (const u of BUNKER_HILL.units) {
			const hex = store.hexAt(u.coordinates);
			expect(hex).toBeDefined();
			expect(canUnitEnterTerrain(u.type, hex!.terrain)).toBe(true);
			seen.add(`${u.coordinates.col},${u.coordinates.row}`);
		}
		expect(seen.size).toBe(BUNKER_HILL.units.length); // no two units stacked
	});

	it('carries entrenchments through to the grid (Breeds & Bunker hills)', () => {
		expect.assertions(2);
		const store = GameStore.fromScenario(BUNKER_HILL);
		let entrenched = 0;
		for (const hex of store.grid!) if (hex.entrenchedEdges.size > 0) entrenched += 1;
		expect(entrenched).toBe(6); // 2 Bunker + 4 Breeds-line hexes
		// Breeds Hill front hex is dug in toward the south (dirs 0/4/5).
		expect(store.hexAt({ col: 3, row: 4 })!.entrenchedEdges.has(5)).toBe(true);
	});

	it('enables town-burning for the British (torchRule) and reinforces on turn 3', () => {
		expect.assertions(3);
		expect(BUNKER_HILL.torchRule).toEqual({ dwellTurns: 2, player: 1 });
		expect(BUNKER_HILL.reinforcements?.every((g) => g.turn === 3)).toBe(true);
		// The optional Grenadier reinforcement is the one elite unit.
		const reinforcements = BUNKER_HILL.reinforcements!.flatMap((g) => g.units);
		expect(reinforcements.filter((u) => u.elite).map((u) => u.id)).toEqual(['brit-grenadier']);
	});
});
