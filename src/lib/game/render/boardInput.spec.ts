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

	it('begins the move action on a second click of the selected unit', () => {
		const store = makeStore();
		const blue = unit(store, 'blue-line-inf');
		const world = worldAt(store, blue.coordinates);
		resolveBoardClick(world, store); // select
		resolveBoardClick(world, store); // begin move
		expect(store.activeUnitId).toBe('blue-line-inf');
		expect(store.validMoveTargets.length).toBeGreaterThan(0);
	});

	it('moves the active unit when a valid move-target hex is clicked', () => {
		const store = makeStore();
		const blue = unit(store, 'blue-line-inf');
		const world = worldAt(store, blue.coordinates);
		resolveBoardClick(world, store); // select
		resolveBoardClick(world, store); // begin move
		const target = store.validMoveTargets[0].coordinates;
		resolveBoardClick(worldAt(store, target), store); // move
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

	it('routes a click on a valid fire target to fireAt', () => {
		// blue-light-inf (4,0) adjacent to red-light-horse (5,0): in range, LOS clear.
		const store = makeStoreWith({ 'blue-light-inf': { col: 4, row: 0 } });
		store.activateUnit('blue-light-inf');
		expect(store.validFireTargets.some((t) => t.id === 'red-light-horse')).toBe(true);
		const before = unit(store, 'red-light-horse').strengthPoints;
		// seq: hit(0) + no-double(0.5) + morale-pass(0)
		resolveBoardClick(
			worldAt(store, unit(store, 'red-light-horse').coordinates),
			store,
			seqRng([0, 0.5, 0])
		);
		expect(unit(store, 'red-light-horse').strengthPoints).toBe(before - 1);
		expect(unit(store, 'blue-light-inf').firedThisActivation).toBe(true);
	});

	it('routes a click on a valid charge target to chargeAt', () => {
		// blue-line-inf (3,1) adjacent to red-artillery (4,1); move mode so only
		// charge targets are populated (no fire/charge ambiguity).
		const store = makeStoreWith({
			'blue-line-inf': { col: 3, row: 1 },
			'red-artillery': { col: 4, row: 1 }
		});
		const li = unit(store, 'blue-line-inf');
		store.selectUnit(li);
		store.beginAction('move');
		expect(store.validChargeTargets.some((t) => t.id === 'red-artillery')).toBe(true);
		expect(store.validFireTargets).toHaveLength(0); // move mode → no fire ambiguity
		// seq: winning charge (mirrors gameStore.spec's Line-Inf-vs-Artillery advance)
		resolveBoardClick(
			worldAt(store, unit(store, 'red-artillery').coordinates),
			store,
			seqRng([0.2, 0])
		);
		expect(store.activeUnitId).toBeNull(); // chargeAt ends the activation
	});
});
