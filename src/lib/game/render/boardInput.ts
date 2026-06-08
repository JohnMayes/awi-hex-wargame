import type { GameStore } from '$lib/game/state/gameStore.svelte';
import { pickHex, pickUnit, type Point } from './boardGeometry';

/**
 * Resolve a world-space board click/tap to a store action — the canvas analogue
 * of the SVG click branching in `+page.svelte`. Pure orchestration over the
 * store contract (reads `store.*`, calls `store.method()`); no game logic, no
 * engine import, so it is Node-testable. `engine.ts`'s `gameUpdate` calls this
 * with `mousePos` on `mouseWasPressed(0)`.
 *
 * R4 scope is selection + movement only. Until R6 adds the DOM Move button, the
 * canvas trigger for `beginAction('move')` is a second click on the already-
 * selected unit (keeps select≠activate, so selection never gambles the command
 * check). Enemy-counter clicks (fire/charge) arrive in R5.
 */
export function resolveBoardClick(
	world: Point,
	store: GameStore,
	rng: () => number = Math.random
): void {
	if (store.isGameOver || !store.grid) return;

	const unit = pickUnit(world, store.units, store.grid);
	if (unit) {
		if (unit.player !== store.activePlayer) return; // enemy: fire/charge is R5
		if (store.selectedUnit?.id === unit.id) {
			store.beginAction('move', rng); // second click on the selected unit begins move
		} else {
			store.selectUnit(unit);
		}
		return;
	}

	const hex = pickHex(world, store.grid);
	if (hex) store.moveUnit({ col: hex.col, row: hex.row }, rng);
}
