import type { GameStore } from '$lib/game/state/gameStore.svelte';
import { pickHex, pickUnit, type Point } from './boardGeometry';

/**
 * Resolve a world-space board click/tap to a store action. Pure orchestration
 * over the store contract (reads `store.*`, calls `store.method()`); no game
 * logic, no engine import, so it is Node-testable. `engine.ts`'s `gameUpdate`
 * calls this with `mousePos` on `mouseWasPressed(0)`.
 *
 * Tap-to-preview, tap-again-to-confirm. The store owns the arm/confirm logic so
 * the canvas gesture and the DOM bottom-bar buttons stay in lockstep:
 * - Friendly unit → `selectUnit` (free, non-committal preview; re-tap clears a
 *   pending action or deselects). The command check only fires on confirm.
 * - Enemy unit → `tapEnemy` (first tap arms fire/charge, second tap confirms).
 * - Empty hex → `tapHex` (first tap arms a move, second tap confirms; tapping a
 *   non-target hex clears the pending action).
 */
export function resolveBoardClick(
	world: Point,
	store: GameStore,
	rng: () => number = Math.random
): void {
	if (store.isGameOver || !store.grid) return;

	const unit = pickUnit(world, store.units, store.grid);
	if (unit) {
		if (unit.player === store.activePlayer) {
			store.selectUnit(unit);
		} else {
			store.tapEnemy(unit.id, rng);
		}
		return;
	}

	const hex = pickHex(world, store.grid);
	if (hex) store.tapHex({ col: hex.col, row: hex.row }, rng);
}
