import { describe, expect, it } from 'vitest';
import { GameStore } from '../state/gameStore.svelte';
import { BUNKER_HILL, SCENARIOS, WHITE_PLAINS } from './scenarios';
import { canUnitEnterTerrain } from '../core/terrain';
import { riverBlocks } from '../core/hex';

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

// The Bronx River winds diagonally, sealing the west bank (Chatterton's Hill + NW
// corner) from the connected east bank, crossable only at the (1,7)-(2,7) bridge.
// Guards the generated barrier + the hand-reasoned offset geometry.
describe('WHITE_PLAINS Bronx River (hex-side)', () => {
	it('is registered and builds a GameStore without throwing', () => {
		expect.assertions(2);
		expect(SCENARIOS['white-plains']).toBe(WHITE_PLAINS);
		expect(GameStore.fromScenario(WHITE_PLAINS).grid).toBeDefined();
	});

	it('dams every west/east crossing except the bridge', () => {
		expect.assertions(5);
		const store = GameStore.fromScenario(WHITE_PLAINS);
		const hex = (col: number, row: number) => store.hexAt({ col, row })!;
		// Plain river edges block the crossing both ways (upper col-2/3, lower col-1/2)...
		expect(riverBlocks(hex(2, 0), hex(3, 0))).toBe(true);
		expect(riverBlocks(hex(1, 5), hex(2, 5))).toBe(true);
		expect(riverBlocks(hex(2, 5), hex(1, 5))).toBe(true);
		// ...but the bridged (1,7)-(2,7) edge, which the west road uses, is passable both ways.
		expect(riverBlocks(hex(1, 7), hex(2, 7))).toBe(false);
		expect(riverBlocks(hex(2, 7), hex(1, 7))).toBe(false);
	});

	it('veers west to exit the west edge in the lower-left', () => {
		expect.assertions(2);
		const store = GameStore.fromScenario(WHITE_PLAINS);
		const hex = (col: number, row: number) => store.hexAt({ col, row })!;
		// The river turns west across col 0 (~row 8) and exits — it no longer reaches
		// the bottom edge, so the bottom-left corner is reunited with the east bank.
		expect(riverBlocks(hex(0, 8), hex(0, 9))).toBe(true); // westward exit segment
		expect(riverBlocks(hex(1, 9), hex(2, 9))).toBe(false); // bottom-left now east, not dammed
	});

	it('keeps the east bank connected (former river column is open ground)', () => {
		expect.assertions(2);
		const store = GameStore.fromScenario(WHITE_PLAINS);
		const hex = (col: number, row: number) => store.hexAt({ col, row })!;
		// Lower col 2 is now east-bank open ground the British can freely traverse.
		expect(canUnitEnterTerrain(WHITE_PLAINS.units[0].type, hex(2, 9).terrain)).toBe(true);
		expect(riverBlocks(hex(2, 9), hex(3, 9))).toBe(false); // no river between two east hexes
	});
});
