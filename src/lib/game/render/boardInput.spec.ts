import { describe, expect, it } from 'vitest';
import { GameStore } from '$lib/game/state/gameStore.svelte';
import { TEST_LEADERS, TEST_UNITS } from '../data/scenarios';
import { TEST_MAP } from '../data/maps';
import type { OffsetCoordinates } from 'honeycomb-grid';
import type { Unit } from '../core/types';
import { hexPixelToWorld, type Point } from './boardGeometry';
import { resolveBoardClick } from './boardInput';

const makeStore = () =>
	new GameStore(structuredClone(TEST_UNITS), TEST_MAP, structuredClone(TEST_LEADERS));

/** Store with `id` repositioned to `coords` (parity with the gameStore.spec setups). */
const makeStoreWith = (placements: Record<string, OffsetCoordinates>) => {
	const units = structuredClone(TEST_UNITS) as Unit[];
	for (const [id, coords] of Object.entries(placements)) {
		units.find((u) => u.id === id)!.coordinates = coords;
	}
	return new GameStore(units, TEST_MAP, structuredClone(TEST_LEADERS));
};

/** Deterministic RNG cycling through `seq` (mirrors gameStore.spec's seqRng). */
const seqRng = (seq: number[]) => {
	let i = 0;
	return () => seq[i++];
};

/** World-space click point at a hex's center (inverse of how the engine draws). */
const worldAt = (store: GameStore, coords: OffsetCoordinates): Point =>
	hexPixelToWorld(store.takesCordsReturnsPos(coords)!);

const unit = (store: GameStore, id: string) => {
	const u = store.units.find((u) => u.id === id);
	if (!u) throw new Error(`Unit ${id} not found`);
	return u;
};

describe('resolveBoardClick', () => {
	it('selects a friendly (active-player) unit on first click', () => {
		const store = makeStore(); // firstPlayer defaults to 0 (blue)
		const blue = unit(store, 'blue-line-inf');
		resolveBoardClick(worldAt(store, blue.coordinates), store);
		expect(store.selectedUnit?.id).toBe('blue-line-inf');
	});

	it('arms (but does not yet commit) a move when a move-target hex is tapped', () => {
		const store = makeStore();
		const blue = unit(store, 'blue-line-inf');
		resolveBoardClick(worldAt(store, blue.coordinates), store); // select
		const target = store.validMoveTargets[0].coordinates;
		resolveBoardClick(worldAt(store, target), store); // arm move
		expect(store.pendingAction).toEqual(expect.objectContaining({ kind: 'move' }));
		expect(unit(store, 'blue-line-inf').coordinates).toEqual(blue.coordinates); // not moved yet
	});

	it('moves the unit when a move-target hex is tapped twice (arm + confirm)', () => {
		const store = makeStore();
		const blue = unit(store, 'blue-line-inf');
		resolveBoardClick(worldAt(store, blue.coordinates), store); // select
		const target = store.validMoveTargets[0].coordinates;
		resolveBoardClick(worldAt(store, target), store); // arm
		resolveBoardClick(worldAt(store, target), store); // confirm
		expect(unit(store, 'blue-line-inf').coordinates).toEqual(target);
	});

	it('ignores clicks on an enemy that is in no valid target set', () => {
		const store = makeStore(); // blue active, nothing activated → no targets
		const red = unit(store, 'red-light-horse');
		const before = red.strengthPoints;
		resolveBoardClick(worldAt(store, red.coordinates), store);
		expect(store.selectedUnit).toBeUndefined();
		expect(unit(store, 'red-light-horse').strengthPoints).toBe(before);
	});

	it('is a no-op for an off-grid click', () => {
		const store = makeStore();
		expect(() => resolveBoardClick({ x: 999999, y: 999999 }, store)).not.toThrow();
		expect(store.selectedUnit).toBeUndefined();
	});

	it('routes a second tap on a valid fire target to fireAt (arm then confirm)', () => {
		// blue-light-inf (4,0) adjacent to red-light-horse (5,0): in range, LOS clear.
		const store = makeStoreWith({ 'blue-light-inf': { col: 4, row: 0 } });
		store.activateUnit('blue-light-inf');
		expect(store.validFireTargets.some((t) => t.id === 'red-light-horse')).toBe(true);
		const before = unit(store, 'red-light-horse').strengthPoints;
		const enemyWorld = worldAt(store, unit(store, 'red-light-horse').coordinates);
		resolveBoardClick(enemyWorld, store); // arm fire (no rng consumed)
		// seq: hit(0) + no-double(0.5) + morale-pass(0)
		resolveBoardClick(enemyWorld, store, seqRng([0, 0.5, 0])); // confirm fire
		expect(unit(store, 'red-light-horse').strengthPoints).toBe(before - 1);
		expect(unit(store, 'blue-light-inf').firedThisActivation).toBe(true);
	});

	it('routes a second tap on a valid charge target to chargeAt', () => {
		// Player 1's Horse (3,1) adjacent to blue-line-inf (4,1): Horse can charge
		// but never fire, so the tap unambiguously arms a charge.
		const store = makeStoreWith({
			'red-horse': { col: 3, row: 1 },
			'blue-line-inf': { col: 4, row: 1 }
		});
		store.endPlayerTurn(); // → player 1
		store.activateUnit('red-horse');
		expect(store.validChargeTargets.some((t) => t.id === 'blue-line-inf')).toBe(true);
		const enemyWorld = worldAt(store, unit(store, 'blue-line-inf').coordinates);
		resolveBoardClick(enemyWorld, store); // arm charge
		// seq: winning charge roll
		resolveBoardClick(enemyWorld, store, seqRng([0.2, 0])); // confirm charge
		expect(store.activeUnitId).toBeNull(); // chargeAt ends the activation
	});
});
