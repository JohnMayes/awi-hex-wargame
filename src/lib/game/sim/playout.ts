// Headless self-play driver (M14). Drives an existing GameStore to a terminal
// outcome with no UI, so two automated policies can be pitted against each other
// for balance stats. Lives in sim/ (not core/) because it depends on the
// Svelte-runes GameStore; core/ stays Svelte-free.
import type { OffsetCoordinates } from 'honeycomb-grid';
import { GameStore } from '../state/gameStore.svelte';
import { ActivationStep, type Player, type Unit } from '../core/types';
import type { Scenario } from '../core/scenario';
import type { VictoryOutcome } from '../core/victory';
import type { LogEvent } from '../core/log';
import { getValidMoveTargets, type MoveTarget } from '../core/movement';
import { getValidFireTargets, expectedFireDamage } from '../core/combat';
import { getValidChargeTargets } from '../core/charge';
import { hexDistance } from '../core/hex';

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
	/** Full event log of the game, for mechanic-level metrics (see report.ts). */
	log: LogEvent[];
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

// --- heuristicPolicy ---------------------------------------------------------
// A rule-based opponent synthesised from the two reference hex wargames (see
// docs/ai-opponent-reference-implementations.md): CAPH's role priority + the
// JS project's odds-gated attack and goal-seeking movement. No search. Each
// candidate action gets a comparable score; the highest wins, both for picking
// the next unit and for the active unit's next step. Greedy per activation —
// the repeated-call model gives "move toward the enemy, then shoot" for free.

// Fitted by paired-seed variant-vs-baseline sweep (1000 games/variant). Strength
// is FLAT across a wide band, so these mid-band values are as good as any — the
// only findings that beat noise were the failure cliffs, noted below. Re-sweep
// only if the action set or combat math changes.
const FIRE_MIN_EV = 0.3; // don't fire below this expected SP damage; close instead.
// ^ safe in [0, 0.45]; >=0.6 badly weakens play (holds fire, never closes the deal).
const CHARGE_BASE = 0.5; // a favourable charge's floor score; +SP-edge on top.
// ^ safe in [0, 0.5]; >=0.9 saturates above max fire EV (~0.76) → over-charges, weaker.
const MOVE_SCORE = 0.05; // advancing beats idling. Pure ordering tiebreak: any 0 < x < FIRE_MIN_EV works.

type ScoredAction = { action: Action; score: number };

// Hexes a unit should advance toward: every enemy (to engage) plus its own
// side's control/hold objective hexes. Nearest wins.
function goalHexes(store: GameStore, unit: Unit): OffsetCoordinates[] {
	const enemies = store.units.filter((u) => u.player !== unit.player).map((u) => u.coordinates);
	const objectives = store.victoryConditions
		.filter(
			(c) => c.player === unit.player && (c.kind === 'control_hexes' || c.kind === 'hold_hexes')
		)
		.flatMap((c) => (c as { hexes: OffsetCoordinates[] }).hexes);
	return [...enemies, ...objectives];
}

function minGoalDist(
	store: GameStore,
	coords: OffsetCoordinates,
	goals: OffsetCoordinates[]
): number {
	const from = store.grid!.getHex(coords)!;
	let best = Infinity;
	for (const g of goals) best = Math.min(best, hexDistance(from, store.grid!.getHex(g)!));
	return best;
}

// Best single action for `unit` this step (defaults to skip). `isActive` reads
// the store's derived targets, which already account for MP spent / having fired.
function bestAction(store: GameStore, unit: Unit, isActive: boolean): ScoredAction {
	const grid = store.grid!;
	let best: ScoredAction = { action: { kind: 'skip', unitId: unit.id }, score: -Infinity };

	const fires = isActive ? store.validFireTargets : getValidFireTargets(unit, grid, store.units);
	for (const t of fires) {
		const ev = expectedFireDamage(unit, t, grid);
		if (ev >= FIRE_MIN_EV && ev > best.score)
			best = { action: { kind: 'fire', unitId: unit.id, targetId: t.id }, score: ev };
	}

	const charges = isActive
		? store.validChargeTargets
		: getValidChargeTargets(unit, grid, store.units);
	for (const d of charges) {
		// ponytail: naive gate — charge only with an SP edge, no analytic opposed-roll EV.
		if (unit.strengthPoints < d.strengthPoints) continue;
		const score = CHARGE_BASE + (unit.strengthPoints - d.strengthPoints);
		if (score > best.score)
			best = { action: { kind: 'charge', unitId: unit.id, targetId: d.id }, score };
	}

	const moves: MoveTarget[] = isActive
		? store.validMoveTargets
		: getValidMoveTargets(unit, grid, store.units);
	if (moves.length && MOVE_SCORE > best.score) {
		const goals = goalHexes(store, unit);
		let target: MoveTarget | null = null;
		let bestDist = minGoalDist(store, unit.coordinates, goals); // only move if strictly closer
		for (const m of moves) {
			const d = minGoalDist(store, m.coordinates, goals);
			if (d < bestDist) {
				bestDist = d;
				target = m;
			}
		}
		if (target)
			best = {
				action: { kind: 'move', unitId: unit.id, coords: target.coordinates },
				score: MOVE_SCORE
			};
	}

	return best;
}

export const heuristicPolicy: Policy = (store) => {
	const active = store.activeUnitId;
	if (active !== null && store.activationStep === ActivationStep.ACTION) {
		const unit = store.units.find((u) => u.id === active)!;
		// One shot per activation: after firing, don't reposition — end it.
		if (unit.firedThisActivation) return { kind: 'skip', unitId: active };
		return bestAction(store, unit, true).action;
	}
	const fresh = store.units.filter((u) => u.player === store.activePlayer && !u.activated);
	if (fresh.length === 0) return null;
	// Activate the unit with the most valuable available action first (shooters
	// with clear shots, then chargers, then units that can advance).
	let choice = bestAction(store, fresh[0], false);
	for (let i = 1; i < fresh.length; i++) {
		const s = bestAction(store, fresh[i], false);
		if (s.score > choice.score) choice = s;
	}
	return choice.action;
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
		stepPolicy(store, store.activePlayer === 0 ? policyBlue : policyRed, rng);
	}

	return {
		outcome: store.victoryOutcome,
		turns: store.turn,
		survivingSpByPlayer: [sumSp(store.units, 0), sumSp(store.units, 1)],
		log: store.log
	};
}

// Applies one policy decision to `store`. Returns false when the policy ended the
// player's turn (endPlayerTurn), true otherwise. Extracted from runGame's loop so
// the live GameScreen AI effect drives turns through the exact same code path.
export function stepPolicy(store: GameStore, policy: Policy, rng: () => number): boolean {
	const action = policy(store, rng);
	if (action === null) {
		store.endPlayerTurn();
		return false;
	}
	if (store.activeUnitId !== action.unitId) {
		store.activateUnit(action.unitId, rng);
		// Failed command check auto-finishes the activation (activeUnitId back to
		// null). Either way the unit can't act this turn — move on.
		if (store.activationStep !== ActivationStep.ACTION) {
			if (store.activeUnitId !== null) store.endActivation();
			return true;
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
	return true;
}
