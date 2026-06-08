import { describe, expect, it } from 'vitest';
import { GameStore } from '$lib/game/state/gameStore.svelte';
import { TEST_LEADERS, TEST_UNITS } from '../data/scenarios';
import { TEST_MAP } from '../data/maps';
import type { OffsetCoordinates } from 'honeycomb-grid';
import { hexPixelToWorld, type Point } from './boardGeometry';
import { resolveBoardClick } from './boardInput';

const makeStore = () =>
	new GameStore(structuredClone(TEST_UNITS), TEST_MAP, structuredClone(TEST_LEADERS));

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

	it('ignores clicks on enemy units (fire/charge is R5)', () => {
		const store = makeStore(); // blue active
		const red = unit(store, 'red-light-horse');
		resolveBoardClick(worldAt(store, red.coordinates), store);
		expect(store.selectedUnit).toBeUndefined();
	});

	it('is a no-op for an off-grid click', () => {
		const store = makeStore();
		expect(() => resolveBoardClick({ x: 999999, y: 999999 }, store)).not.toThrow();
		expect(store.selectedUnit).toBeUndefined();
	});
});
