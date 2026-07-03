// Headless self-play driver (M14). Drives an existing GameStore to a terminal
// outcome with no UI, so two automated policies can be pitted against each other
// for balance stats. Lives in sim/ (not core/) because it depends on the
// Svelte-runes GameStore; core/ stays Svelte-free.
import type { OffsetCoordinates } from 'honeycomb-grid';
import { GameStore } from '../state/gameStore.svelte';
import { ActivationStep, type Player, type Unit } from '../core/types';
import type { Scenario } from '../core/scenario';
import type { VictoryOutcome } from '../core/victory';
import { getValidMoveTargets } from '../core/movement';
import { getValidFireTargets } from '../core/combat';
import { getValidChargeTargets } from '../core/charge';

export type Action =
	| { kind: 'move'; unitId: string; coords: OffsetCoordinates }
	| { kind: 'fire'; unitId: string; targetId: string }
	| { kind: 'charge'; unitId: string; targetId: string }
	| { kind: 'skip'; unitId: string };

// A policy picks the active player's next action, or null to end the turn (no
// un-activated unit worth acting with remains). Called repeatedly; while a unit
// is mid-activation it should keep returning actions for that unit until done.
export type Policy = (store: GameStore, rng: () => number) => Action | null;

export type GameOutcome = {
	outcome: VictoryOutcome | null;
	turns: number;
	survivingSpByPlayer: [number, number];
};

const pick = <T>(xs: readonly T[], rng: () => number): T => xs[Math.floor(rng() * xs.length)];

// Legal actions for `unit`. For the unit already mid-activation we read the
// store's derived targets (they account for MP already spent / having fired);
// for a fresh unit we enumerate from core with its full allowance.
function legalActions(store: GameStore, unit: Unit, isActive: boolean): Action[] {
	const moves = isActive
		? store.validMoveTargets
		: getValidMoveTargets(unit, store.grid!, store.units);
	const fires = isActive
		? store.validFireTargets
		: getValidFireTargets(unit, store.grid!, store.units);
	const charges = isActive
		? store.validChargeTargets
		: getValidChargeTargets(unit, store.grid!, store.units);
	return [
		...moves.map((m): Action => ({ kind: 'move', unitId: unit.id, coords: m.coordinates })),
		...fires.map((t): Action => ({ kind: 'fire', unitId: unit.id, targetId: t.id })),
		...charges.map((t): Action => ({ kind: 'charge', unitId: unit.id, targetId: t.id }))
	];
}

// Uniform random over all legal actions plus "skip". Continues the current unit
// if one is mid-action; otherwise starts a random un-activated unit. Returns
// null when the active player has no un-activated units left.
export const randomPolicy: Policy = (store, rng) => {
	const active = store.activeUnitId;
	if (active !== null && store.activationStep === ActivationStep.ACTION) {
		const unit = store.units.find((u) => u.id === active)!;
		const options = [
			...legalActions(store, unit, true),
			{ kind: 'skip', unitId: active } as Action
		];
		return pick(options, rng);
	}
	const fresh = store.units.filter((u) => u.player === store.activePlayer && !u.activated);
	if (fresh.length === 0) return null;
	const unit = pick(fresh, rng);
	const options = [
		...legalActions(store, unit, false),
		{ kind: 'skip', unitId: unit.id } as Action
	];
	return pick(options, rng);
};

const sumSp = (units: readonly Unit[], player: Player) =>
	units.filter((u) => u.player === player).reduce((sum, u) => sum + u.strengthPoints, 0);

// Run one full game to a terminal outcome. The same `rng` is threaded into every
// store mutator so a fixed seed reproduces the game exactly.
export function runGame(
	scenario: Scenario,
	policyBlue: Policy,
	policyRed: Policy,
	rng: () => number
): GameOutcome {
	const store = GameStore.fromScenario(scenario);
	// ponytail: hard infinite-loop backstop. turnLimit guarantees termination, but
	// a policy bug that never makes progress would otherwise hang. Raise if a real
	// scenario legitimately needs more activations.
	const cap = scenario.turnLimit * (scenario.units.length + 1) * 8 + 100;
	let steps = 0;

	while (!store.isGameOver) {
		if (++steps > cap) throw new Error(`runGame(${scenario.id}) exceeded activation cap ${cap}`);
		const policy = store.activePlayer === 0 ? policyBlue : policyRed;
		const action = policy(store, rng);
		if (action === null) {
			store.endPlayerTurn();
			continue;
		}
		if (store.activeUnitId !== action.unitId) {
			store.activateUnit(action.unitId, rng);
			// Failed command check auto-finishes the activation (activeUnitId back to
			// null). Either way the unit can't act this turn — move on.
			if (store.activationStep !== ActivationStep.ACTION) {
				if (store.activeUnitId !== null) store.endActivation();
				continue;
			}
		}
		switch (action.kind) {
			case 'move':
				store.moveUnit(action.coords, rng);
				break;
			case 'fire':
				store.fireAt(action.targetId, rng);
				break;
			case 'charge':
				store.chargeAt(action.targetId, rng); // self-finishes the activation
				break;
			case 'skip':
				store.endActivation();
				break;
		}
	}

	return {
		outcome: store.victoryOutcome,
		turns: store.turn,
		survivingSpByPlayer: [sumSp(store.units, 0), sumSp(store.units, 1)]
	};
}
