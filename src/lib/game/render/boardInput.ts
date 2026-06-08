import type { GameStore } from '$lib/game/state/gameStore.svelte';
import { pickHex, pickUnit, type Point } from './boardGeometry';

/**
 * Resolve a world-space board click/tap to a store action — the canvas analogue
 * of the SVG click branching in `+page.svelte`. Pure orchestration over the
 * store contract (reads `store.*`, calls `store.method()`); no game logic, no
 * engine import, so it is Node-testable. `engine.ts`'s `gameUpdate` calls this
 * with `mousePos` on `mouseWasPressed(0)`.
 *
 * Friendly-unit clicks (R4): first click selects; a second click on the already-
 * selected unit calls `beginAction('move')` (keeps select≠activate, so selection
 * never gambles the command check) — the temporary canvas trigger until R6's
 * Move button. Enemy-unit clicks (R5) route to fire/charge, fire taking priority
 * (only one set is non-empty per mode), mirroring `+page.svelte`.
 *
 * Fire-MODE entry is deferred to R6's Fire button (no clean pre-R6 tap gesture):
 * so on the canvas `validFireTargets` is currently always empty when the fire
 * branch is reached, and only charge is reachable. The `fireAt` routing is built
 * and unit-tested here; R6 lights it up by calling `beginAction('fire')`.
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
			if (store.selectedUnit?.id === unit.id) {
				store.beginAction('move', rng); // second click on the selected unit begins move
			} else {
				store.selectUnit(unit);
			}
		} else if (store.validFireTargets.some((t) => t.id === unit.id)) {
			store.fireAt(unit.id, rng);
		} else if (store.validChargeTargets.some((t) => t.id === unit.id)) {
			store.chargeAt(unit.id, rng);
		}
		return;
	}

	const hex = pickHex(world, store.grid);
	if (hex) store.moveUnit({ col: hex.col, row: hex.row }, rng);
}
