// Headless self-play driver (M14). Drives an existing GameStore to a terminal
// outcome with no UI, so two automated policies can be pitted against each other
// for balance stats. Lives in sim/ (not core/) because it depends on the
// Svelte-runes GameStore; core/ stays Svelte-free.
import type { OffsetCoordinates } from 'honeycomb-grid';
import { GameStore } from '../state/gameStore.svelte';
import { ActivationStep, TerrainType, type MapEdge, type Player, type Unit } from '../core/types';
import type { Scenario } from '../core/scenario';
import type { VictoryOutcome } from '../core/victory';
import type { LogEvent } from '../core/log';
import { getValidMoveTargets, passableNeighbors, type MoveTarget } from '../core/movement';
import { getValidFireTargets, expectedFireDamage } from '../core/combat';
import { getValidChargeTargets } from '../core/charge';
import { getTerrainCoverModifier } from '../core/terrain';
import { unitDefinitions } from '../core/unitDefinitions';
import { getAttachedLeader } from '../core/command';
import { HexCell, hexDistance } from '../core/hex';

export type Action =
	| { kind: 'move'; unitId: string; coords: OffsetCoordinates; isExit?: boolean }
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

// A leader's host shepherds rather than bolting for the exit. If the leader leaves
// (its host exits, taking it off the board), the whole side falls out of command
// (§8.2): every subsequent activation rolls ~50% and a fail wastes the turn. So the
// leader stays with the pack — keeping its command radius over the escaping units —
// and leaves only once it is the last friendly unit standing. Measured: Washington's
// host exits ~turn 4, spiking blue command failure 10.6% → 50.3% for the rest of the game.
function isLeaderShepherd(store: GameStore, unit: Unit): boolean {
	if (!getAttachedLeader(unit.id, store.leaders)) return false;
	return store.units.some(
		(u) => u.player === unit.player && u.id !== unit.id && u.strengthPoints > 0
	);
}

// True when `unit`'s side wins (partly) by marching units off the map — gates the
// off-map exit action so scenarios without an exit objective are unaffected. The
// store only marks a MoveTarget `isExit` when getValidMoveTargets is passed allowExit,
// so this same flag also gates enumeration below. A shepherding leader never takes it.
const wantsExit = (store: GameStore, unit: Unit): boolean =>
	store.victoryConditions.some((c) => c.kind === 'exit_units' && c.player === unit.player) &&
	!isLeaderShepherd(store, unit);

// Legal actions for `unit`. For the unit already mid-activation we read the
// store's derived targets (they account for MP already spent / having fired);
// for a fresh unit we enumerate from core with its full allowance.
function legalActions(store: GameStore, unit: Unit, isActive: boolean): Action[] {
	const moves = isActive
		? store.validMoveTargets
		: getValidMoveTargets(unit, store.grid!, store.units, undefined, wantsExit(store, unit));
	const fires = isActive
		? store.validFireTargets
		: getValidFireTargets(unit, store.grid!, store.units);
	const charges = isActive
		? store.validChargeTargets
		: getValidChargeTargets(unit, store.grid!, store.units);
	return [
		...moves.map(
			(m): Action => ({
				kind: 'move',
				unitId: unit.id,
				coords: m.coordinates,
				isExit: m.isExit
			})
		),
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

// --- smartHeuristicPolicy tuning (target/position preferences) ---------------
// Additive refinements layered on the baseline scores above, chosen to break
// ties the baseline resolves by array order (which target, which destination).
// They are sized so a move's total stays below FIRE_MIN_EV — category priority
// (a real shot always outranks a step) is preserved by construction.
//
// Grouped into a tuning object (not bare constants) so a candidate tuning can be
// A/B'd against the default *in one process*: `makeSmartPolicy({ ...DEFAULT_SMART_TUNING,
// finishBonus: 0.7 })` plays the default head-to-head in the harness — no git
// gymnastics. Re-sweep the values via that A/B if the action set or combat math changes.
export type SmartTuning = {
	finishBonus: number; // fire likely to eliminate the target (ev >= its SP): removes it for good.
	leaderBonus: number; // target carries an attached leader: a casualty there disrupts enemy command.
	closestEps: number; // faint tiebreak toward the nearer fire target (EV already folds in range/cover).
	coverBonus: number; // move onto cover terrain (woods/town): reduces incoming fire.
	inRangeBonus: number; // move that brings an enemy within our firing range (a firing position).
	closerWeight: number; // prefer advancing nearer the goal; tiny so the move score stays < FIRE_MIN_EV.
	exitBonus: number; // take an off-map exit (exit_units objective): banks an irreversible win step.
};

export const DEFAULT_SMART_TUNING: SmartTuning = {
	finishBonus: 0.5,
	leaderBonus: 0.3,
	closestEps: 0.01,
	coverBonus: 0.02,
	inRangeBonus: 0.02,
	closerWeight: 0.002,
	exitBonus: 1.0 // above max fire EV (~0.76); swept in the A/B harness (Phase 3).
};

type ScoredAction = { action: Action; score: number };

// Hexes a unit should advance toward: every enemy (to engage) plus its own side's
// control/hold objective hexes. Nearest wins. When `objectiveAware` (smart policy
// only — baseline stays the fixed low-bar reference per its comment), it also folds
// in the two objective kinds that carry no hex list: exit_units (the declared exit
// hexes for our edge) and raze (still-standing TOWN hexes to torch). Torching needs
// no separate action — a unit on a TOWN goal has minGoalDist 0, so it never advances
// off and dwells there until the hex burns (per the scenario torchRule).
function goalHexes(store: GameStore, unit: Unit, objectiveAware: boolean): OffsetCoordinates[] {
	const conds = store.victoryConditions.filter((c) => c.player === unit.player);
	const objectives = conds
		.filter((c) => c.kind === 'control_hexes' || c.kind === 'hold_hexes')
		.flatMap((c) => (c as { hexes: OffsetCoordinates[] }).hexes);
	const enemies = store.units.filter((u) => u.player !== unit.player).map((u) => u.coordinates);
	if (!objectiveAware) return [...enemies, ...objectives];

	const exitEdges = new Set(
		conds.filter((c) => c.kind === 'exit_units').map((c) => (c as { edge: MapEdge }).edge)
	);
	const wantsRaze = conds.some((c) => c.kind === 'raze');
	const exitGoals: OffsetCoordinates[] = [];
	const townGoals: OffsetCoordinates[] = [];
	if ((exitEdges.size > 0 || wantsRaze) && store.grid) {
		for (const hex of store.grid) {
			if (hex.exitEdge && exitEdges.has(hex.exitEdge))
				exitGoals.push({ col: hex.col, row: hex.row });
			// ponytail: raze goals are all TOWN hexes; we trust torchRule.player == the raze
			// condition owner (true in current data — the store's torchRule has no getter).
			else if (wantsRaze && hex.terrain === TerrainType.TOWN)
				townGoals.push({ col: hex.col, row: hex.row });
		}
	}

	// An exit-objective side must run for the exit — enemies sit *behind* the fleeing
	// units (their pursuers), so including them as goals would drag units backward.
	// The exit dominates; the "break N" half of such objectives is met incidentally by
	// firing as they disengage. Raze/eliminate sides still chase enemies AND the town.
	if (exitGoals.length > 0) {
		// The leader shepherds: track the pack (nearest friendly) instead of the exit, so
		// its command radius stays over the escapers and it never clogs the exit hex.
		if (isLeaderShepherd(store, unit)) {
			const pack = store.units
				.filter((u) => u.player === unit.player && u.id !== unit.id && u.strengthPoints > 0)
				.map((u) => u.coordinates);
			return [...objectives, ...pack];
		}
		return [...objectives, ...exitGoals];
	}
	return [...enemies, ...objectives, ...townGoals];
}

// ponytail: straight-line cube distance, NOT terrain-aware path cost. The unit picks
// the neighbour that lowers this, with no idea a river/impassable hex blocks the route
// beyond — so it can walk into a dead-end (e.g. White Plains: the three river-blocked
// Colonials head straight north toward the exit and get trapped instead of routing
// around). Upgrade path if a scenario needs it: A* over movement.ts costs / the
// reachable set, keyed off the same goals. Deferred — see docs/ai-opponent-evaluation.md.
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

// Cube-key (`"q,r"`) → hex lookup, built once per grid. The grid is stable for a
// whole game, so a WeakMap keyed on it means passableNeighbors never rescans.
const cubeMapCache = new WeakMap<object, Map<string, HexCell>>();
function cubeMap(grid: NonNullable<GameStore['grid']>): Map<string, HexCell> {
	let m = cubeMapCache.get(grid);
	if (!m) {
		m = new Map();
		for (const h of grid) m.set(`${h.q},${h.r}`, h);
		cubeMapCache.set(grid, m);
	}
	return m;
}

// Terrain-aware replacement for minGoalDist, used only by the objective-aware smart
// policy (the baseline keeps straight-line, staying the dumb A/B incumbent). Shortest
// step count to the nearest reachable goal, routing around rivers/impassable terrain —
// so a river-blocked unit sees the real detour distance instead of walking crow-flies
// into a dead-end. Occupancy-blind (see passableNeighbors); Infinity if no goal is
// reachable. A plain BFS: every step costs 1, so breadth order == shortest path, and
// one sweep handles all goals at once (abstract-astar is point-to-point single-goal —
// running it per goal per candidate move timed out the A/B harness). The installed
// abstract-astar dep waits for the day steps carry unequal terrain cost.
function goalPathCost(
	store: GameStore,
	unit: Unit,
	coords: OffsetCoordinates,
	goals: OffsetCoordinates[]
): number {
	const grid = store.grid!;
	const hexMap = cubeMap(grid);
	const start = grid.getHex(coords)!;
	const goalKeys = new Set<string>();
	for (const g of goals) {
		const h = grid.getHex(g);
		if (h) goalKeys.add(`${h.q},${h.r}`);
	}
	const startKey = `${start.q},${start.r}`;
	if (goalKeys.has(startKey)) return 0; // dwell (e.g. a raze TOWN under the unit)

	const seen = new Set([startKey]);
	let frontier = [start];
	let dist = 0;
	while (frontier.length > 0) {
		dist++;
		const next: HexCell[] = [];
		for (const hex of frontier)
			for (const n of passableNeighbors(unit, hex, hexMap)) {
				const k = `${n.q},${n.r}`;
				if (seen.has(k)) continue;
				if (goalKeys.has(k)) return dist;
				seen.add(k);
				next.push(n);
			}
		frontier = next;
	}
	return Infinity;
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

	// Baseline is the fixed low-bar reference: objective-blind (no exit/raze pursuit),
	// so it stays a stable incumbent for the A/B harness and tests.
	const moves: MoveTarget[] = isActive
		? store.validMoveTargets
		: getValidMoveTargets(unit, grid, store.units);
	if (moves.length && MOVE_SCORE > best.score) {
		const goals = goalHexes(store, unit, false);
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

// --- smartHeuristicPolicy: baseline scores + target/position preferences -----
// Same greedy shape as bestAction, but scoring is factored into a pure
// scoreAction() so the tie-breaks are explicit and (see below) reusable by a
// future search.

/** Shared target-preference bonus (fire + charge): prefer hitting a led unit,
 *  since a casualty there can disrupt the enemy's command. Pure over the store. */
function targetValue(store: GameStore, target: Unit, tuning: SmartTuning): number {
	return store.leaders.some((l) => l.attachedToUnitId === target.id) ? tuning.leaderBonus : 0;
}

/** Hex distance from `coords` to the nearest enemy of `player` (Infinity if none). */
function nearestEnemyDist(store: GameStore, coords: OffsetCoordinates, player: Player): number {
	const from = store.grid!.getHex(coords)!;
	let best = Infinity;
	for (const u of store.units) {
		if (u.player === player) continue;
		best = Math.min(best, hexDistance(from, store.grid!.getHex(u.coordinates)!));
	}
	return best;
}

// TREE-SEARCH HOOK. Pure value of one concrete action from the current position.
// smartHeuristicPolicy takes the argmax of this over legalActions(); a future αβ
// search would reuse it UNCHANGED as its move-ordering key (expand highest-scored
// moves first → more cutoffs). Returns -Infinity for anything the baseline gates
// out (weak shot, unfavourable charge, non-advancing move) so it never beats a
// skip. The finish/leader/cover terms are deliberately the same vocabulary a leaf
// evalState(store, player) would use (material Σ own SP − enemy SP, objective
// control, cover) — so the eval and the ordering key can share one code path.
function scoreAction(store: GameStore, unit: Unit, action: Action, tuning: SmartTuning): number {
	const grid = store.grid!;
	switch (action.kind) {
		case 'fire': {
			const target = store.units.find((u) => u.id === action.targetId);
			if (!target) return -Infinity;
			const ev = expectedFireDamage(unit, target, grid);
			if (ev < FIRE_MIN_EV) return -Infinity; // baseline hold-fire gate
			const finish = ev >= target.strengthPoints ? tuning.finishBonus : 0; // likely kill
			const dist = hexDistance(grid.getHex(unit.coordinates)!, grid.getHex(target.coordinates)!);
			return ev + finish + targetValue(store, target, tuning) - tuning.closestEps * dist;
		}
		case 'charge': {
			const target = store.units.find((u) => u.id === action.targetId);
			if (!target) return -Infinity;
			// ponytail: same naive SP-edge gate as bestAction — no analytic opposed-roll EV.
			if (unit.strengthPoints < target.strengthPoints) return -Infinity;
			return (
				CHARGE_BASE +
				(unit.strengthPoints - target.strengthPoints) +
				targetValue(store, target, tuning)
			);
		}
		case 'move': {
			// Off-map exit banks an irreversible win step; score it above fire/charge and
			// skip the advance gate (an exit hex under the unit reads as "no closer").
			// Gated on wantsExit: only a side with the exit objective should leave (the
			// isExit flag is set scenario-wide, for either player).
			if (action.isExit && wantsExit(store, unit)) return tuning.exitBonus;
			const goals = goalHexes(store, unit, true);
			const here = goalPathCost(store, unit, unit.coordinates, goals);
			const there = goalPathCost(store, unit, action.coords, goals);
			// Only advance (terrain-aware path cost). Relaxing this to allow lateral/uphill
			// "unstick" steps was A/B'd and measurably lost (Bunker Hill −37 to −42, no White
			// Plains exit gain): a memoryless greedy escape just wanders/oscillates, and the
			// stalls it targeted are correct congestion-waiting. See docs/ai-opponent-evaluation.md.
			if (there >= here) return -Infinity;
			const hex = grid.getHex(action.coords);
			const cover = hex && getTerrainCoverModifier(hex.terrain) < 0 ? tuning.coverBonus : 0;
			const range = unitDefinitions[unit.type].firingRange;
			const inRange =
				range > 0 && nearestEnemyDist(store, action.coords, unit.player) <= range
					? tuning.inRangeBonus
					: 0;
			return MOVE_SCORE - tuning.closerWeight * there + cover + inRange;
		}
		case 'skip':
			return -Infinity;
	}
}

/** Best-scoring action for `unit` via scoreAction (defaults to skip). */
function bestSmartAction(
	store: GameStore,
	unit: Unit,
	isActive: boolean,
	tuning: SmartTuning
): ScoredAction {
	let best: ScoredAction = { action: { kind: 'skip', unitId: unit.id }, score: -Infinity };
	for (const action of legalActions(store, unit, isActive)) {
		const score = scoreAction(store, unit, action, tuning);
		if (score > best.score) best = { action, score };
	}
	return best;
}

// Shared activation scaffolding: continue the mid-activation unit (one shot per
// activation), else activate the fresh unit whose best action scores highest.
// `best` is the only thing that varies between policies — this is also where a
// searchPolicy would slot in (see the FUTURE note below).
function makePolicy(
	best: (store: GameStore, unit: Unit, isActive: boolean) => ScoredAction
): Policy {
	return (store) => {
		const active = store.activeUnitId;
		if (active !== null && store.activationStep === ActivationStep.ACTION) {
			const unit = store.units.find((u) => u.id === active)!;
			// One shot per activation: after firing, don't reposition — end it.
			if (unit.firedThisActivation) return { kind: 'skip', unitId: active };
			return best(store, unit, true).action;
		}
		const fresh = store.units.filter((u) => u.player === store.activePlayer && !u.activated);
		if (fresh.length === 0) return null;
		// Activate the unit with the most valuable available action first (shooters
		// with clear shots, then chargers, then units that can advance).
		let choice = best(store, fresh[0], false);
		for (let i = 1; i < fresh.length; i++) {
			const s = best(store, fresh[i], false);
			if (s.score > choice.score) choice = s;
		}
		return choice.action;
	};
}

// Naive greedy baseline: EV-max fire, SP-edge charge, nearest-goal move, ties by
// array order. Kept as the fixed low-bar opponent for the A/B harness and tests.
export const heuristicPolicy: Policy = makePolicy(bestAction);

/** Build a smart policy for a given tuning. `makeSmartPolicy(candidate)` can play
 *  `makeSmartPolicy()` head-to-head in the harness to sweep a tuning change. */
export function makeSmartPolicy(tuning: SmartTuning = DEFAULT_SMART_TUNING): Policy {
	return makePolicy((store, unit, isActive) => bestSmartAction(store, unit, isActive, tuning));
}

/** The default AI opponent (the game and headless driver both use this). */
export const smartHeuristicPolicy: Policy = makeSmartPolicy();

// FUTURE (tree search + αβ): add `searchPolicy = makePolicy(bestSearchAction)`,
// where bestSearchAction runs a depth-limited minimax over legalActions() (the
// move generator already used above), orders candidate moves by scoreAction()
// for pruning, and scores leaf positions with a new evalState(store, player)
// built from the same material/objective/cover terms scoreAction rewards here.
// The one piece still missing is apply/undo: search needs to explore actions on
// a throwaway copy of the position (GameStore.fromScenario + action replay, or a
// lighter make/unmake) since the live store mutates in place. RNG is already
// seed-threaded, so a fixed seed keeps search deterministic.

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
