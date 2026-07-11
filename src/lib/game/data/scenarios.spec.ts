import { describe, expect, it } from 'vitest';
import { GameStore } from '../state/gameStore.svelte';
import { BUNKER_HILL, PAOLI, PITCHED_BATTLE, SCENARIOS, WHITE_PLAINS } from './scenarios';
import { canUnitEnterTerrain } from '../core/terrain';
import { riverBlocks } from '../core/hex';
import { emptyVictoryProgress, evaluateVictory, type VictorySnapshot } from '../core/victory';
import { TerrainType, type Player } from '../core/types';

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

// Paoli: British night assault. Coherence + the asymmetric victory (British kill 3
// Colonials in 6 turns, else the Colonials win via turnLimitWinner).
describe('PAOLI scenario', () => {
	it('is registered and builds a GameStore without throwing', () => {
		expect.assertions(2);
		expect(SCENARIOS['paoli']).toBe(PAOLI);
		expect(GameStore.fromScenario(PAOLI).grid).toBeDefined();
	});

	it('places every starting unit on a distinct, on-map, enterable hex', () => {
		expect.assertions(PAOLI.units.length * 2 + 1);
		const store = GameStore.fromScenario(PAOLI);
		const seen = new Set<string>();
		for (const u of PAOLI.units) {
			const hex = store.hexAt(u.coordinates);
			expect(hex).toBeDefined();
			expect(canUnitEnterTerrain(u.type, hex!.terrain)).toBe(true);
			seen.add(`${u.coordinates.col},${u.coordinates.row}`);
		}
		expect(seen.size).toBe(PAOLI.units.length); // no two units stacked
	});

	it('opens the camp: (4,2) is OPEN so the Colonial camp is not woods-sealed', () => {
		expect.assertions(2);
		const store = GameStore.fromScenario(PAOLI);
		expect(store.hexAt({ col: 4, row: 2 })!.terrain).toBe(TerrainType.OPEN);
		// The camp hexes themselves are open ground.
		expect(store.hexAt({ col: 4, row: 3 })!.terrain).toBe(TerrainType.OPEN);
	});

	it('reinforces 2 Colonials on turn 4 onto enterable south-edge hexes', () => {
		expect.assertions(3);
		const store = GameStore.fromScenario(PAOLI);
		expect(PAOLI.reinforcements?.every((g) => g.turn === 4 && g.player === 0)).toBe(true);
		for (const u of PAOLI.reinforcements!.flatMap((g) => g.units)) {
			expect(canUnitEnterTerrain(u.type, store.hexAt(u.coordinates)!.terrain)).toBe(true);
		}
	});

	const snapshot = (turn: number, colonialsKilled: number): VictorySnapshot => ({
		turn,
		turnLimit: PAOLI.turnLimit,
		units: [],
		// British are player 1; they win by eliminating Colonial (player 0) units.
		eliminatedByPlayer: { 0: colonialsKilled, 1: 0 } as Record<Player, number>,
		bounds: { minCol: 0, maxCol: 6, minRow: 0, maxRow: 8 },
		exitedThisTurn: [],
		burnedHexes: 0
	});

	it('gives the British the win when 3 Colonials are eliminated', () => {
		expect.assertions(2);
		const { outcome } = evaluateVictory(
			PAOLI.victoryConditions,
			snapshot(3, 3),
			emptyVictoryProgress(),
			PAOLI.turnLimitWinner ?? null
		);
		expect(outcome?.winner).toBe(1);
		expect(outcome?.conditionId).toBe('brit-kill-3');
	});

	it('gives the Colonials the win at the turn limit if fewer than 3 fell', () => {
		expect.assertions(2);
		const { outcome } = evaluateVictory(
			PAOLI.victoryConditions,
			snapshot(6, 2),
			emptyVictoryProgress(),
			PAOLI.turnLimitWinner ?? null
		);
		expect(outcome?.winner).toBe(0);
		expect(outcome?.reason).toBe('turn_limit_default');
	});
});

// The Bronx River winds diagonally, sealing the west bank (Chatterton's Hill + NW
// corner) from the connected east bank, crossable only at the (1,6)-(2,6) bridge.
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
		expect(riverBlocks(hex(1, 4), hex(2, 4))).toBe(true);
		expect(riverBlocks(hex(2, 4), hex(1, 4))).toBe(true);
		// ...but the bridged (1,6)-(2,6) edge, which the west road uses, is passable both ways.
		expect(riverBlocks(hex(1, 6), hex(2, 6))).toBe(false);
		expect(riverBlocks(hex(2, 6), hex(1, 6))).toBe(false);
	});

	it('veers west to exit the west edge in the lower-left', () => {
		expect.assertions(2);
		const store = GameStore.fromScenario(WHITE_PLAINS);
		const hex = (col: number, row: number) => store.hexAt({ col, row })!;
		// The river turns west across col 0 (~row 7) and exits — it no longer reaches
		// the bottom edge, so the bottom-left corner is reunited with the east bank.
		expect(riverBlocks(hex(0, 7), hex(0, 8))).toBe(true); // westward exit segment
		expect(riverBlocks(hex(1, 8), hex(2, 8))).toBe(false); // bottom-left now east, not dammed
	});

	it('keeps the east bank connected (former river column is open ground)', () => {
		expect.assertions(2);
		const store = GameStore.fromScenario(WHITE_PLAINS);
		const hex = (col: number, row: number) => store.hexAt({ col, row })!;
		// Lower col 2 is now east-bank open ground the British can freely traverse.
		expect(canUnitEnterTerrain(WHITE_PLAINS.units[0].type, hex(2, 8).terrain)).toBe(true);
		expect(riverBlocks(hex(2, 8), hex(3, 8))).toBe(false); // no river between two east hexes
	});
});

// Exit hexes are an intentional declaration, not derived from roads. The only exit
// is (3,0) north; the west/south road stubs run off-map but are NOT exits.
describe('WHITE_PLAINS exit hexes (decoupled from roads)', () => {
	it('declares (3,0) as the sole north exit', () => {
		expect.assertions(1);
		const store = GameStore.fromScenario(WHITE_PLAINS);
		expect(store.hexAt({ col: 3, row: 0 })!.exitEdge).toBe('north');
	});

	it('does not treat the off-map road stubs (0,6)/(0,7)/(4,8) as exits', () => {
		expect.assertions(3);
		const store = GameStore.fromScenario(WHITE_PLAINS);
		for (const [col, row] of [
			[0, 6],
			[0, 7],
			[4, 8]
		]) {
			expect(store.hexAt({ col, row })!.exitEdge).toBeNull();
		}
	});
});

// Objective markers (cosmetic stars) are placed on exactly the intended hexes.
describe('objective markers', () => {
	const markedHexes = (scenario: typeof WHITE_PLAINS) => {
		const store = GameStore.fromScenario(scenario);
		const marked = new Set<string>();
		for (const hex of store.grid!) if (hex.objective) marked.add(`${hex.col},${hex.row}`);
		return marked;
	};

	it('White Plains marks the exit hex (3,0)', () => {
		expect.assertions(1);
		expect(markedHexes(WHITE_PLAINS)).toEqual(new Set(['3,0']));
	});

	it('Bunker Hill marks the two Charlestown town hexes', () => {
		expect.assertions(1);
		expect(markedHexes(BUNKER_HILL)).toEqual(new Set(['1,6', '1,7']));
	});

	it('Pitched Battle marks the central objective hill (3,4)', () => {
		expect.assertions(1);
		expect(markedHexes(PITCHED_BATTLE)).toEqual(new Set(['3,4']));
	});
});
