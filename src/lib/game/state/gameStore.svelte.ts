import type { MapDefinition } from '../data/maps';
import { Grid, type OffsetCoordinates } from 'honeycomb-grid';
import { HexCell, coordsEqual } from '../core/hex';
import type { LogEvent } from '../core/log';
import {
	getValidMoveTargets,
	requiresDifficultTerrainCheck,
	rollDifficultTerrainCheck,
	type MoveResult,
	type MoveTarget
} from '../core/movement';
import { getValidFireTargets, resolveFireAction, type FireResult } from '../core/combat';
import { getValidChargeTargets, resolveCharge, type ChargeResult } from '../core/charge';
import {
	getAttachedLeader,
	isInCommand,
	resolveCommandCheck,
	resolveLeaderCasualty,
	type CommandCheckResult,
	type Leader,
	type LeaderCasualtyResult
} from '../core/command';
import { applyEliminations } from '../core/elimination';
import { checkMorale, type MoraleResult } from '../core/morale';
import type {
	ReinforcementGroup,
	ReinforcementUnitSpec,
	Scenario,
	TorchRule
} from '../core/scenario';
import { canUnitEnterTerrain } from '../core/terrain';
import {
	ActionType,
	ActivationStep,
	TerrainType,
	type Player,
	type Unit,
	type UnitType
} from '../core/types';
import { getUnitDefinition } from '../core/unitDefinitions';
import {
	boundsFromCoords,
	emptyVictoryProgress,
	evaluateVictory,
	type MapEdge,
	type VictoryCondition,
	type VictoryOutcome,
	type VictoryProgress,
	type VictorySnapshot
} from '../core/victory';

export type PendingAction =
	| { kind: 'move'; coords: OffsetCoordinates; cost: number }
	| { kind: 'fire'; targetId: string }
	| { kind: 'charge'; targetId: string };

/** Display-only progress toward a single victory condition, for the objectives dialog. */
export type VictoryConditionStatus = {
	id: string;
	player: Player;
	description: string;
	/** Human-readable progress, e.g. "2 / 4" or "1 / 3 turns". */
	text: string;
	/** Progress fraction in [0, 1] for a progress bar. */
	fraction: number;
	met: boolean;
};

export type GameStoreConfig = {
	firstPlayer?: Player;
	turnLimit?: number | null;
	victoryConditions?: VictoryCondition[];
	turnLimitWinner?: Player;
	reinforcements?: ReinforcementGroup[];
	torchRule?: TorchRule;
};

/** A single reinforcement unit awaiting deployment, flattened from its group. */
type PendingReinforcement = { turn: number; player: Player; spec: ReinforcementUnitSpec };

export class GameStore {
	units: Unit[] = $state([]);
	leaders: Leader[] = $state([]);
	grid: Grid<HexCell> | undefined = $state();
	activePlayer: Player = $state(0);
	activationStep: ActivationStep = $state(ActivationStep.AWAITING_ACTIVATION);
	activeUnitId: string | null = $state(null);
	pendingAction: PendingAction | null = $state(null);
	turn: number = $state(1);
	turnLimit: number | null = $state(null);
	lastCommandCheck: CommandCheckResult | null = $state(null);
	log: LogEvent[] = $state([]);
	victoryConditions: VictoryCondition[] = $state([]);
	victoryProgress: VictoryProgress = $state(emptyVictoryProgress());
	victoryOutcome: VictoryOutcome | null = $state(null);
	isGameOver = $derived(this.victoryOutcome !== null);
	selectedUnit = $derived(this.units.find((u) => u.selected === true));
	// Valid actions for the focus unit (the active unit mid-activation, else the
	// merely-selected unit). Computed once via #targetsFor so the preview shown
	// on selection and the auto-end check can never drift. A selected-but-not-yet-
	// activated unit previews all of move + fire + charge simultaneously.
	focusTargets = $derived.by(() => {
		const focus = this.#focusUnit();
		if (!focus) return { move: [] as MoveTarget[], fire: [] as Unit[], charge: [] as Unit[] };
		return this.#targetsFor(focus);
	});
	validMoveTargets: MoveTarget[] = $derived(this.focusTargets.move);
	validFireTargets: Unit[] = $derived(this.focusTargets.fire);
	validChargeTargets: Unit[] = $derived(this.focusTargets.charge);
	// Whether the selected unit would pass its command check for free (in radius
	// of a friendly leader). null when nothing is selected. Lets the UI show the
	// gamble before the user commits to an action. Display-only — no roll.
	selectedInCommand = $derived.by(() => {
		const sel = this.selectedUnit;
		if (!sel || !this.grid) return null;
		return isInCommand(sel, this.leaders, this.units, this.grid);
	});
	// Display-only progress toward each victory condition, for the objectives
	// dialog. Mirrors evaluateVictory's per-kind logic against live state, but
	// produces human-readable strings rather than a decision.
	victoryStatus: VictoryConditionStatus[] = $derived.by(() =>
		this.victoryConditions.map((c) => this.#conditionStatus(c))
	);

	// Immutable scenario context, set once at construction.
	#bounds: VictorySnapshot['bounds'];
	// Running tally of units eliminated per player, for eliminate_units victory.
	// A cumulative kill count, independent of the starting roster and reinforcements.
	#eliminatedByPlayer: Record<Player, number> = $state({ 0: 0, 1: 0 });
	// Reinforcements not yet deployed: scheduled-but-not-arrived plus any deferred
	// because their entry hex was blocked. Flattened per-unit so a partly-blocked
	// group can arrive piecemeal. Not reactive — no UI reads it.
	#pendingReinforcements: PendingReinforcement[];
	// Town-burning rule, if the scenario enables it (Bunker Hill). Null otherwise.
	#torchRule: TorchRule | null;
	// The side that activates first each game turn. A full game turn completes when
	// play returns to this player (both sides have acted) — the trigger for turn
	// rollover and victory evaluation. Stored so the boundary is correct whether the
	// first player is 0 or 1 (a firstPlayer-1 scenario's opening solo segment must
	// not be mistaken for a whole game turn).
	#firstPlayer: Player;
	// Default winner at the turn limit (asymmetric scenarios); null → SP tiebreak.
	#turnLimitWinner: Player | null;
	// Whether any victory condition is exit_units. Gates the off-map exit action so
	// scenarios without an exit objective (Bunker Hill's north road stubs) are unaffected.
	#exitEnabled: boolean;
	// Units that have exited the board since the last victory evaluation, fed as
	// `exitedThisTurn` once per full game turn and then cleared. Not reactive.
	#exitedSinceEval: { unitId: string; player: Player; edge: MapEdge }[] = [];
	// Per-TOWN-hex count of consecutive game turns held by the torch player. Reset to
	// 0 whenever the hex is vacated; at #torchRule.dwellTurns the hex is razed. Not reactive.
	#torchDwell: Map<string, number> = new Map();

	constructor(units: Unit[], map: MapDefinition, leaders: Leader[], config: GameStoreConfig = {}) {
		const newGrid = new Grid(
			HexCell,
			map.map((cell) =>
				HexCell.create({
					col: cell.col,
					row: cell.row,
					terrain: cell.terrain,
					entrenchedEdges: cell.entrenchedEdges,
					roadEdges: cell.roadEdges,
					riverEdges: cell.riverEdges,
					crossingEdges: cell.crossingEdges,
					exitEdge: cell.exitEdge,
					objective: cell.objective
				})
			)
		);

		this.grid = newGrid;
		this.units = units;
		this.leaders = leaders;
		this.#firstPlayer = config.firstPlayer ?? 0;
		this.activePlayer = this.#firstPlayer;
		this.turnLimit = config.turnLimit ?? null;
		this.victoryConditions = config.victoryConditions ?? [];
		this.#bounds = boundsFromCoords(map);
		this.#torchRule = config.torchRule ?? null;
		this.#turnLimitWinner = config.turnLimitWinner ?? null;
		this.#exitEnabled = (config.victoryConditions ?? []).some((c) => c.kind === 'exit_units');
		// Clone so the store never mutates the caller's scenario data.
		this.#pendingReinforcements = structuredClone(config.reinforcements ?? []).flatMap((g) =>
			g.units.map((spec) => ({ turn: g.turn, player: g.player, spec }))
		);
		// Deploy anything due for the first player's turn 1 (they are already active).
		this.#processReinforcements();
	}

	static fromScenario(scenario: Scenario): GameStore {
		return new GameStore(
			structuredClone(scenario.units),
			scenario.map,
			structuredClone(scenario.leaders),
			{
				firstPlayer: scenario.firstPlayer,
				turnLimit: scenario.turnLimit,
				victoryConditions: scenario.victoryConditions,
				turnLimitWinner: scenario.turnLimitWinner,
				reinforcements: scenario.reinforcements,
				torchRule: scenario.torchRule
			}
		);
	}

	// -- Helpers --
	takesCordsReturnsPos(cords: OffsetCoordinates) {
		const targetHex = this.grid?.getHex(cords);
		if (targetHex) {
			const { x, y } = targetHex;
			return { x, y };
		} else {
			console.log(`No hex found at ${cords}`);
		}
	}

	hexAt(cords: OffsetCoordinates) {
		return this.grid?.getHex(cords) ?? null;
	}

	unitAt(cords: OffsetCoordinates) {
		return this.units.find((u) => coordsEqual(u.coordinates, cords)) ?? null;
	}

	#getUnit(id: string) {
		const u = this.units.find((u) => u.id === id);
		if (!u) throw new Error(`Unit ${id} not found`);
		return u;
	}

	// The unit whose actions are previewed/driven: the active unit during an
	// activation, otherwise the merely-selected unit.
	#focusUnit(): Unit | undefined {
		const id = this.activeUnitId ?? this.selectedUnit?.id;
		if (!id) return undefined;
		return this.units.find((u) => u.id === id);
	}

	// The currently-legal move/fire/charge targets for a unit, honoring the
	// per-unit action-type gates (MOVE_OR_FIRE exclusivity, MP exhaustion,
	// fired-this-activation). The single source of truth shared by the
	// focusTargets derive and #maybeAutoEnd, so preview and auto-end agree.
	#targetsFor(unit: Unit): { move: MoveTarget[]; fire: Unit[]; charge: Unit[] } {
		if (!this.grid) return { move: [], fire: [], charge: [] };
		const def = getUnitDefinition(unit.type);

		let move: MoveTarget[] = [];
		const canMove =
			!(def.actionType === ActionType.MOVE_OR_FIRE && unit.firedThisActivation) &&
			unit.movementPointsUsed < def.movementAllowance;
		if (canMove) {
			const remainingMP = def.movementAllowance - unit.movementPointsUsed;
			move = getValidMoveTargets(unit, this.grid, this.units, remainingMP, this.#exitEnabled);
		}

		let fire: Unit[] = [];
		const canFire =
			def.firingRange > 0 &&
			!unit.firedThisActivation &&
			!(def.actionType === ActionType.MOVE_OR_FIRE && unit.movementPointsUsed > 0);
		if (canFire) {
			fire = getValidFireTargets(unit, this.grid, this.units);
		}

		// getValidChargeTargets gates canCharge / firedThisActivation / MP internally.
		const charge = getValidChargeTargets(unit, this.grid, this.units);

		return { move, fire, charge };
	}

	#pendingIsValid(p: PendingAction): boolean {
		if (p.kind === 'move') {
			return this.validMoveTargets.some((t) => coordsEqual(t.coordinates, p.coords));
		}
		if (p.kind === 'fire') {
			return this.validFireTargets.some((u) => u.id === p.targetId);
		}
		return this.validChargeTargets.some((u) => u.id === p.targetId);
	}

	#emit(event: LogEvent) {
		this.log = [...this.log, event];
	}

	// Add the just-eliminated units to the per-player kill tally. `before` is the
	// pre-elimination array (still containing the dead) so their player is known.
	#recordEliminations(before: readonly Unit[], eliminatedUnitIds: readonly string[]) {
		if (eliminatedUnitIds.length === 0) return;
		const tally = { ...this.#eliminatedByPlayer };
		for (const id of eliminatedUnitIds) {
			const player = before.find((u) => u.id === id)?.player;
			if (player !== undefined) tally[player] += 1;
		}
		this.#eliminatedByPlayer = tally;
	}

	// Evaluate victory at the end of a full game turn. Pure core decides; the
	// store applies the new progress and, only on a decision, records the
	// outcome and emits a game_over event. With no conditions and no turn limit
	// this is a no-op that emits nothing.
	#evaluateVictory() {
		const snapshot: VictorySnapshot = {
			turn: this.turn,
			turnLimit: this.turnLimit,
			units: this.units.map((u) => ({
				id: u.id,
				player: u.player,
				strengthPoints: u.strengthPoints,
				coordinates: u.coordinates
			})),
			eliminatedByPlayer: this.#eliminatedByPlayer,
			bounds: this.#bounds,
			exitedThisTurn: this.#exitedSinceEval,
			burnedHexes: this.#countBurnedHexes()
		};
		const { progress, outcome } = evaluateVictory(
			this.victoryConditions,
			snapshot,
			this.victoryProgress,
			this.#turnLimitWinner
		);
		this.#exitedSinceEval = []; // consumed; accumulate afresh next round
		this.victoryProgress = progress;
		if (outcome) {
			this.victoryOutcome = outcome;
			this.#emit({ kind: 'game_over', turn: this.turn, outcome });
		}
	}

	/** Count hexes currently razed (BURNED) — drives the raze_and_eliminate victory. */
	#countBurnedHexes(): number {
		if (!this.grid) return 0;
		let n = 0;
		for (const hex of this.grid) if (hex.terrain === TerrainType.BURNED) n += 1;
		return n;
	}

	/**
	 * Town-burning (scenario torchRule): a TOWN hex held by the torch player for
	 * `dwellTurns` consecutive game turns is razed to BURNED. Called once per full game
	 * turn from `endPlayerTurn`, before victory is evaluated. Mutating `hex.terrain` is
	 * picked up live by the renderer and by combat/LOS (a burned town loses its cover
	 * and LOS block). No-op unless the scenario set a torchRule.
	 */
	#processTorch() {
		const rule = this.#torchRule;
		if (!rule || !this.grid) return;
		const occupantAt = new Map<string, Unit>();
		for (const u of this.units) {
			if (u.strengthPoints <= 0) continue;
			occupantAt.set(`${u.coordinates.col},${u.coordinates.row}`, u);
		}
		for (const hex of this.grid) {
			if (hex.terrain !== TerrainType.TOWN) continue;
			const key = `${hex.col},${hex.row}`;
			const occupant = occupantAt.get(key);
			if (!occupant || occupant.player !== rule.player) {
				this.#torchDwell.delete(key); // vacated (or held by the wrong side) → reset
				continue;
			}
			const held = (this.#torchDwell.get(key) ?? 0) + 1;
			if (held >= rule.dwellTurns) {
				hex.terrain = TerrainType.BURNED;
				this.#torchDwell.delete(key);
				this.#emit({
					kind: 'hex_burned',
					turn: this.turn,
					player: rule.player,
					coordinates: { col: hex.col, row: hex.row }
				});
			} else {
				this.#torchDwell.set(key, held);
			}
		}
	}

	// Live progress for one victory condition (display only). Reuses the captured
	// starting counts and cross-turn accumulators; never decides the game.
	#conditionStatus(c: VictoryCondition): VictoryConditionStatus {
		const frac = (n: number, d: number) => (d <= 0 ? 0 : Math.min(1, Math.max(0, n / d)));
		const base = { id: c.id, player: c.player, description: c.description };

		switch (c.kind) {
			case 'eliminate_units': {
				const enemy: Player = c.player === 0 ? 1 : 0;
				const destroyed = this.#eliminatedByPlayer[enemy];
				return {
					...base,
					text: `${destroyed} / ${c.count}`,
					fraction: frac(destroyed, c.count),
					met: destroyed >= c.count
				};
			}
			case 'control_hexes': {
				const controls = (h: OffsetCoordinates) =>
					this.units.some(
						(u) => u.player === c.player && u.strengthPoints > 0 && coordsEqual(u.coordinates, h)
					);
				const controlled = c.requireAll ? c.hexes.every(controls) : c.hexes.some(controls);
				const turnNote = c.atTurn !== null ? ` (turn ${c.atTurn})` : '';
				return {
					...base,
					text: (controlled ? 'Held' : 'Not held') + turnNote,
					fraction: controlled ? 1 : 0,
					met: controlled && (c.atTurn === null || this.turn === c.atTurn)
				};
			}
			case 'hold_hexes': {
				const streak = this.victoryProgress.holdStreaks[c.id] ?? 0;
				return {
					...base,
					text: `${streak} / ${c.consecutiveTurns} turns`,
					fraction: frac(streak, c.consecutiveTurns),
					met: streak >= c.consecutiveTurns
				};
			}
			case 'exit_units': {
				const exited = this.victoryProgress.exitedCounts[c.id] ?? 0;
				return {
					...base,
					text: `${exited} / ${c.count}`,
					fraction: frac(exited, c.count),
					met: exited >= c.count
				};
			}
			case 'raze': {
				const burned = this.#countBurnedHexes();
				return {
					...base,
					text: `${burned} / ${c.count} razed`,
					fraction: frac(burned, c.count),
					met: burned >= c.count
				};
			}
		}
	}

	clearLog() {
		this.log = [];
	}

	#clearActivatedFlags() {
		this.units = this.units.map((u) => ({
			...u,
			selected: false,
			movementPointsUsed: 0,
			firedThisActivation: false,
			activated: false
		}));
	}

	// An entry hex is available iff it is on the map, the unit type may enter its
	// terrain, and no unit (friend or foe) occupies it. A blocked hex defers the
	// reinforcement to the owner's next turn.
	#entryHexAvailable(type: UnitType, coords: OffsetCoordinates): boolean {
		const hex = this.hexAt(coords);
		if (!hex) return false;
		if (!canUnitEnterTerrain(type, hex.terrain)) return false;
		return this.unitAt(coords) === null;
	}

	// Expand a reinforcement spec into a full Unit with the standard runtime
	// defaults; arrives ready to act (activated: false).
	#expandReinforcement(spec: ReinforcementUnitSpec, player: Player): Unit {
		const def = getUnitDefinition(spec.type);
		return {
			id: spec.id,
			type: spec.type,
			player,
			coordinates: spec.coordinates,
			strengthPoints: spec.strengthPoints ?? def.defaultStrengthPoints,
			maxStrengthPoints: spec.maxStrengthPoints ?? def.defaultStrengthPoints,
			selected: false,
			movementPointsUsed: 0,
			firedThisActivation: false,
			activated: false,
			elite: spec.elite ?? false
		};
	}

	// Deploy every pending reinforcement that is due (its scheduled turn reached)
	// for the currently-active player and whose entry hex is free. Units that are
	// not yet due, or due-but-blocked, stay pending and are retried on the owner's
	// next turn. Called from the constructor (first player's turn 1) and after the
	// player flip in endPlayerTurn (every later player segment).
	#processReinforcements() {
		if (!this.grid || this.#pendingReinforcements.length === 0) return;
		const arrived: Unit[] = [];
		const stillPending: PendingReinforcement[] = [];
		for (const r of this.#pendingReinforcements) {
			const due = r.player === this.activePlayer && this.turn >= r.turn;
			if (due && this.#entryHexAvailable(r.spec.type, r.spec.coordinates)) {
				arrived.push(this.#expandReinforcement(r.spec, r.player));
			} else {
				stillPending.push(r);
			}
		}
		this.#pendingReinforcements = stillPending;
		if (arrived.length === 0) return;
		this.units = [...this.units, ...arrived];
		this.#emit({
			kind: 'reinforcements_arrived',
			turn: this.turn,
			player: this.activePlayer,
			units: arrived.map((u) => ({ id: u.id, type: u.type, coordinates: u.coordinates }))
		});
	}

	#activate(id: string, rng: () => number = Math.random) {
		if (!this.grid) return;
		const unit = this.units.find((u) => u.id === id);
		if (!unit) return;

		this.activeUnitId = id;
		this.units = this.units.map((u) => ({ ...u, selected: u.id === id }));
		this.activationStep = ActivationStep.COMMAND_CHECK;

		const check = resolveCommandCheck(unit, this.leaders, this.units, this.grid, rng);
		this.lastCommandCheck = check;
		this.#emit({
			kind: 'activation_started',
			turn: this.turn,
			player: this.activePlayer,
			unitId: id,
			commandCheck: check
		});

		if (!check.passed) {
			// Wasted activation: the unit cannot move/fire/charge this game turn. The
			// failure is surfaced from the activation_started event already emitted
			// above (the render FX layer renders it); flow through the remaining
			// lifecycle steps so observers see the transition and `activated` gets set.
			this.#finishActivation();
			return;
		}

		this.activationStep = ActivationStep.ACTION;
	}

	#finishActivation() {
		if (this.activeUnitId === null) return;
		// Stub: charge resolution and morale check auto-complete
		this.activationStep = ActivationStep.CHARGE_RESOLUTION;
		this.activationStep = ActivationStep.MORALE_CHECK;
		this.activationStep = ActivationStep.ACTIVATION_COMPLETE;

		const activeId = this.activeUnitId;
		this.units = this.units.map((u) => ({
			...u,
			activated: u.id === activeId ? true : u.activated,
			movementPointsUsed: u.id === activeId ? 0 : u.movementPointsUsed,
			firedThisActivation: u.id === activeId ? false : u.firedThisActivation,
			selected: u.id === activeId ? false : u.selected
		}));
		this.activeUnitId = null;
		this.pendingAction = null;
		this.activationStep = ActivationStep.AWAITING_ACTIVATION;
		this.#emit({
			kind: 'activation_ended',
			turn: this.turn,
			player: this.activePlayer,
			unitId: activeId
		});
	}

	// Auto-end the activation when the active unit has no legal action left, so
	// the user never has to manually dismiss a spent unit. Charges already
	// self-finish (activeUnitId is null), so this is a no-op after them.
	#maybeAutoEnd() {
		if (this.activeUnitId === null) return;
		const active = this.units.find((u) => u.id === this.activeUnitId);
		if (!active) return;
		const t = this.#targetsFor(active);
		if (t.move.length === 0 && t.fire.length === 0 && t.charge.length === 0) {
			this.#finishActivation();
		}
	}

	// -- Selection / activation --

	selectUnit(unit: Unit) {
		if (this.victoryOutcome) return;
		if (unit.player !== this.activePlayer) return;
		if (unit.activated) return;

		// Auto-end any in-progress activation on a foreign-friendly click.
		if (this.activeUnitId !== null && this.activeUnitId !== unit.id) {
			this.#finishActivation();
		}

		// Re-tapping the active unit mid-activation is a no-op.
		if (this.activeUnitId === unit.id) return;

		// Re-tapping the already-selected (not-yet-activated) unit: clear an armed
		// pending action if there is one, otherwise deselect.
		if (this.selectedUnit?.id === unit.id) {
			if (this.pendingAction) {
				this.pendingAction = null;
			} else {
				this.units = this.units.map((u) => ({ ...u, selected: false }));
			}
			return;
		}

		// Selecting a different unit: clear any pending action and select it.
		this.pendingAction = null;
		this.units = this.units.map((u) => ({ ...u, selected: u.id === unit.id }));
	}

	// -- Arm / confirm (tap-to-preview, tap-again-to-confirm) --

	// First tap on a valid move hex arms it; a second tap on the same hex
	// confirms. A tap on any non-move-target hex clears the pending action.
	tapHex(coords: OffsetCoordinates, rng: () => number = Math.random) {
		if (this.victoryOutcome) return;
		const p = this.pendingAction;
		if (p && p.kind === 'move' && coordsEqual(p.coords, coords)) {
			this.confirmAction(rng);
			return;
		}
		const target = this.validMoveTargets.find((t) => coordsEqual(t.coordinates, coords));
		if (target) {
			this.pendingAction = { kind: 'move', coords: target.coordinates, cost: target.cost };
		} else {
			this.cancelAction();
		}
	}

	// First tap on an enemy arms fire (preferred) or charge; a second tap on the
	// same enemy confirms. A tap on a non-target enemy is a no-op.
	tapEnemy(unitId: string, rng: () => number = Math.random) {
		if (this.victoryOutcome) return;
		const p = this.pendingAction;
		if (p && (p.kind === 'fire' || p.kind === 'charge') && p.targetId === unitId) {
			this.confirmAction(rng);
			return;
		}
		if (this.validFireTargets.some((u) => u.id === unitId)) {
			this.pendingAction = { kind: 'fire', targetId: unitId };
		} else if (this.validChargeTargets.some((u) => u.id === unitId)) {
			this.pendingAction = { kind: 'charge', targetId: unitId };
		}
	}

	// Switch an armed combat action between fire and charge (the bottom-bar radio
	// for units that can do both to the same enemy). Ignored unless the target is
	// currently a valid target of the requested kind.
	setPendingCombatKind(kind: 'fire' | 'charge') {
		const p = this.pendingAction;
		if (!p || (p.kind !== 'fire' && p.kind !== 'charge')) return;
		if (p.kind === kind) return;
		const valid =
			kind === 'fire'
				? this.validFireTargets.some((u) => u.id === p.targetId)
				: this.validChargeTargets.some((u) => u.id === p.targetId);
		if (valid) this.pendingAction = { kind, targetId: p.targetId };
	}

	cancelAction() {
		this.pendingAction = null;
	}

	// Execute the armed pending action. The first action of an activation lazily
	// rolls the command check (a failure ends the activation; the failure is
	// emitted on the activation_started event for the UI); subsequent actions
	// never re-roll. After the action resolves, the activation auto-ends if
	// nothing legal remains.
	confirmAction(rng: () => number = Math.random) {
		if (this.victoryOutcome) return;
		const p = this.pendingAction;
		if (!p) return;
		const sel = this.selectedUnit;
		if (!sel) return;

		// Self-heal: drop a pending action that state changes have invalidated.
		if (!this.#pendingIsValid(p)) {
			this.cancelAction();
			return;
		}

		if (this.activeUnitId === null) {
			this.#activate(sel.id, rng);
			// A failed command check ends the activation immediately.
			if (this.activeUnitId === null) {
				this.pendingAction = null;
				return;
			}
		}

		if (p.kind === 'move') this.moveUnit(p.coords, rng);
		else if (p.kind === 'fire') this.fireAt(p.targetId, rng);
		else if (p.kind === 'charge') this.chargeAt(p.targetId, rng);

		this.pendingAction = null;
		this.#maybeAutoEnd();
	}

	// -- Movement --

	moveUnit(newCords: OffsetCoordinates, rng: () => number = Math.random): MoveResult | null {
		if (this.victoryOutcome) return null;
		if (this.activeUnitId === null) return null;
		if (this.activationStep !== ActivationStep.ACTION) return null;
		if (this.selectedUnit?.id !== this.activeUnitId) return null;
		if (this.selectedUnit.player !== this.activePlayer) return null;
		if (!this.grid) return null;

		const target = this.validMoveTargets.find((t) => coordsEqual(t.coordinates, newCords));
		if (!target) return null;

		const def = getUnitDefinition(this.selectedUnit.type);
		const activeId = this.activeUnitId;
		const from = this.selectedUnit.coordinates;

		// Off-map exit: the unit leaves the board via a declared exit hex. Remove it and
		// record the exit for the exit_units victory instead of repositioning. The edge
		// comes from the hex's own `exitEdge` declaration (not geometry). Exiting is not
		// a kill, so #eliminatedByPlayer is untouched.
		if (target.isExit) {
			const borderHex = this.grid.getHex(newCords);
			const edge = borderHex?.exitEdge ?? null;
			const player = this.activePlayer;
			this.units = this.units.filter((u) => u.id !== activeId);
			if (edge) {
				this.#exitedSinceEval = [...this.#exitedSinceEval, { unitId: activeId, player, edge }];
				this.#emit({
					kind: 'unit_exited',
					turn: this.turn,
					player,
					unitId: activeId,
					edge,
					coordinates: newCords
				});
			}
			this.#finishActivation();
			return {
				unitId: activeId,
				from,
				to: from,
				cost: target.cost,
				moved: true,
				difficultTerrainCheck: null
			};
		}

		let dtCheck: { passed: boolean } | null = null;
		let to: OffsetCoordinates = newCords;
		let cost = target.cost;
		let moved = true;

		if (requiresDifficultTerrainCheck(this.selectedUnit, this.grid)) {
			const passed = rollDifficultTerrainCheck(rng);
			dtCheck = { passed };
			if (!passed) {
				to = from;
				cost = 0;
				moved = false;
				this.units = this.units.map((u) =>
					u.id === activeId ? { ...u, movementPointsUsed: def.movementAllowance } : u
				);
			}
		}

		if (moved) {
			this.units = this.units.map((u) => ({
				...u,
				coordinates: u.id === activeId ? to : u.coordinates,
				movementPointsUsed: u.id === activeId ? u.movementPointsUsed + cost : u.movementPointsUsed
			}));
		}

		const result: MoveResult = {
			unitId: activeId,
			from,
			to,
			cost,
			moved,
			difficultTerrainCheck: dtCheck
		};
		this.#emit({
			kind: 'move_action',
			turn: this.turn,
			player: this.activePlayer,
			result
		});
		return result;
	}

	// -- Firing --

	fireAt(targetId: string, rng: () => number = Math.random): FireResult | null {
		if (this.victoryOutcome) return null;
		if (this.activeUnitId === null) return null;
		if (this.activationStep !== ActivationStep.ACTION) return null;
		if (this.selectedUnit?.id !== this.activeUnitId) return null;
		if (this.selectedUnit.player !== this.activePlayer) return null;
		if (!this.grid) return null;

		const target = this.validFireTargets.find((u) => u.id === targetId);
		if (!target) return null;

		const result = resolveFireAction(this.selectedUnit, target, this.grid, rng);
		const activeId = this.activeUnitId;
		const attackerOrigin = this.selectedUnit.coordinates;

		let leaderCasualty: LeaderCasualtyResult | null = null;
		let postCasualtyLeaders: Leader[] = this.leaders;
		let morale: MoraleResult | null = null;

		if (result.damage > 0) {
			const postHitSP = Math.max(0, target.strengthPoints - result.damage);
			if (postHitSP > 0) {
				const projectedUnits = this.units.map((u) =>
					u.id === targetId ? { ...u, strengthPoints: postHitSP } : u
				);
				const projectedTarget = { ...target, strengthPoints: postHitSP };

				// Leader casualty fires BEFORE morale; morale sees post-casualty state.
				const casualty = resolveLeaderCasualty(
					targetId,
					this.leaders,
					projectedUnits,
					this.grid,
					rng
				);
				leaderCasualty = casualty.result;
				postCasualtyLeaders = casualty.leaders;

				morale = checkMorale(
					projectedTarget,
					attackerOrigin,
					this.grid,
					projectedUnits,
					{
						leaderAttached: getAttachedLeader(targetId, postCasualtyLeaders) !== null,
						outOfCommand: !isInCommand(
							projectedTarget,
							postCasualtyLeaders,
							projectedUnits,
							this.grid
						)
					},
					rng
				);
			}
		}

		const totalDamage = result.damage + (morale && !morale.passed ? morale.additionalDamage : 0);
		const moraleRetreat = morale && !morale.passed ? morale.retreatTo : null;

		const updated = this.units.map((u) => {
			if (u.id === activeId) return { ...u, firedThisActivation: true };
			if (u.id === targetId && totalDamage > 0) {
				return {
					...u,
					strengthPoints: Math.max(0, u.strengthPoints - totalDamage),
					coordinates: moraleRetreat ?? u.coordinates
				};
			}
			return u;
		});
		const elim = applyEliminations(updated, postCasualtyLeaders);
		this.#recordEliminations(updated, elim.result.eliminatedUnitIds);
		this.units = elim.units;
		this.leaders = elim.leaders;
		const fireResult: FireResult = {
			...result,
			leaderCasualty,
			morale,
			eliminatedUnitIds: elim.result.eliminatedUnitIds,
			eliminatedLeaderIds: elim.result.eliminatedLeaderIds
		};
		this.#emit({
			kind: 'fire_action',
			turn: this.turn,
			player: this.activePlayer,
			result: fireResult,
			targetCoords: target.coordinates
		});
		return fireResult;
	}

	// -- Charge --

	chargeAt(targetId: string, rng: () => number = Math.random): ChargeResult | null {
		if (this.victoryOutcome) return null;
		if (this.activeUnitId === null) return null;
		if (this.activationStep !== ActivationStep.ACTION) return null;
		if (this.selectedUnit?.id !== this.activeUnitId) return null;
		if (this.selectedUnit.player !== this.activePlayer) return null;
		if (!this.grid) return null;

		const target = this.validChargeTargets.find((u) => u.id === targetId);
		if (!target) return null;

		const attacker = this.selectedUnit;
		const attackerOrigin = attacker.coordinates;
		const def = getUnitDefinition(attacker.type);

		// Difficult-terrain check on leaving the attacker's hex, parity with moveUnit.
		if (requiresDifficultTerrainCheck(attacker, this.grid)) {
			const passed = rollDifficultTerrainCheck(rng);
			if (!passed) {
				const activeId = this.activeUnitId;
				this.units = this.units.map((u) =>
					u.id === activeId ? { ...u, movementPointsUsed: def.movementAllowance } : u
				);
				this.#finishActivation();
				return null;
			}
		}

		const result = resolveCharge(attacker, target, attackerOrigin, this.grid, this.units, rng);

		const attackerId = attacker.id;
		const defenderId = target.id;
		const attackerNewCoords: OffsetCoordinates = result.attackerAdvances
			? target.coordinates
			: attackerOrigin;
		const defenderPostChargeCoords: OffsetCoordinates =
			result.defenderRetreatTo ?? target.coordinates;
		const defenderPostChargeSP = Math.max(0, target.strengthPoints - result.defenderDamage);
		const attackerPostChargeSP = Math.max(0, attacker.strengthPoints - result.attackerDamage);

		// Project post-charge state once; reused by casualty rolls and morale.
		const projectedUnits = this.units.map((u) => {
			if (u.id === attackerId) {
				return { ...u, strengthPoints: attackerPostChargeSP, coordinates: attackerNewCoords };
			}
			if (u.id === defenderId) {
				return {
					...u,
					strengthPoints: defenderPostChargeSP,
					coordinates: defenderPostChargeCoords
				};
			}
			return u;
		});

		let leadersAfterCasualty: Leader[] = this.leaders;
		let defenderLeaderCasualty: LeaderCasualtyResult | null = null;
		let attackerLeaderCasualty: LeaderCasualtyResult | null = null;

		// Defender casualty: only if defender took hits and survives.
		if (result.defenderDamage > 0 && defenderPostChargeSP > 0) {
			const out = resolveLeaderCasualty(
				defenderId,
				leadersAfterCasualty,
				projectedUnits,
				this.grid,
				rng
			);
			defenderLeaderCasualty = out.result;
			leadersAfterCasualty = out.leaders;
		}

		// Attacker casualty: only on attacker_repulsed (attacker_damage>0 ⇒ attacker survives in
		// current rules, since attacker SP is at most reduced by 1 from full).
		if (result.attackerDamage > 0 && attackerPostChargeSP > 0) {
			const out = resolveLeaderCasualty(
				attackerId,
				leadersAfterCasualty,
				projectedUnits,
				this.grid,
				rng
			);
			attackerLeaderCasualty = out.result;
			leadersAfterCasualty = out.leaders;
		}

		let morale: MoraleResult | null = null;
		const moraleEligible =
			result.defenderDamage > 0 &&
			defenderPostChargeSP > 0 &&
			(result.outcome === 'defender_retreats' || result.outcome === 'defender_holds');

		if (moraleEligible) {
			const projectedDefender: Unit = {
				...target,
				strengthPoints: defenderPostChargeSP,
				coordinates: defenderPostChargeCoords
			};
			morale = checkMorale(
				projectedDefender,
				attackerNewCoords,
				this.grid,
				projectedUnits,
				{
					leaderAttached: getAttachedLeader(defenderId, leadersAfterCasualty) !== null,
					outOfCommand: !isInCommand(
						projectedDefender,
						leadersAfterCasualty,
						projectedUnits,
						this.grid
					)
				},
				rng
			);
		}

		const defenderTotalDamage =
			result.defenderDamage + (morale && !morale.passed ? morale.additionalDamage : 0);
		const defenderFinalCoords: OffsetCoordinates =
			morale && !morale.passed && morale.retreatTo ? morale.retreatTo : defenderPostChargeCoords;

		const updated = this.units.map((u) => {
			if (u.id === attackerId) {
				return {
					...u,
					strengthPoints: Math.max(0, u.strengthPoints - result.attackerDamage),
					coordinates: attackerNewCoords,
					movementPointsUsed: def.movementAllowance
				};
			}
			if (u.id === defenderId) {
				return {
					...u,
					strengthPoints: Math.max(0, u.strengthPoints - defenderTotalDamage),
					coordinates: defenderFinalCoords
				};
			}
			return u;
		});

		// M11: §10 elimination — remove units at 0 SP and orphaned leaders (no replacement).
		const elim = applyEliminations(updated, leadersAfterCasualty);
		this.#recordEliminations(updated, elim.result.eliminatedUnitIds);
		this.units = elim.units;
		this.leaders = elim.leaders;

		const chargeResult: ChargeResult = {
			...result,
			attackerLeaderCasualty,
			defenderLeaderCasualty,
			morale,
			eliminatedUnitIds: elim.result.eliminatedUnitIds,
			eliminatedLeaderIds: elim.result.eliminatedLeaderIds
		};
		this.#emit({
			kind: 'charge_action',
			turn: this.turn,
			player: this.activePlayer,
			result: chargeResult,
			attackerCoords: attackerOrigin,
			defenderCoords: target.coordinates
		});
		this.#finishActivation();
		return chargeResult;
	}

	// -- Activation lifecycle --

	activateUnit(id: string, rng: () => number = Math.random) {
		if (this.victoryOutcome) return;
		if (this.activeUnitId !== null) return;
		const unit = this.#getUnit(id);
		if (unit.player !== this.activePlayer) return;
		if (unit.activated) return;
		this.#activate(id, rng);
	}

	endActivation() {
		if (this.victoryOutcome) return;
		this.#finishActivation();
	}

	endPlayerTurn() {
		if (this.victoryOutcome) return;
		if (this.activeUnitId !== null) {
			this.#finishActivation();
		}
		// A merely-selected (never-activated) unit isn't touched by #finishActivation,
		// so clear its selection + preview here or its highlights bleed into the next
		// player's turn.
		this.units = this.units.map((u) => (u.selected ? { ...u, selected: false } : u));
		this.pendingAction = null;

		const prevTurn = this.turn;
		const prevPlayer = this.activePlayer;
		const nextPlayer: Player = prevPlayer === 0 ? 1 : 0;
		this.activePlayer = nextPlayer;

		// A full game turn completes when play returns to the first player — both
		// sides have now activated once. (With firstPlayer 0 this is the 1→0 handback,
		// as before; with firstPlayer 1 it is the 0→1 handback, so the opening solo
		// segment is not mistaken for a whole turn.)
		const gameTurnComplete = nextPlayer === this.#firstPlayer;
		if (gameTurnComplete) {
			this.turn = this.turn + 1;
			this.#clearActivatedFlags();
		}

		// Deploy reinforcements for the player now taking their turn (after the flip
		// and flag clear, so arrivals land with activated: false and survive).
		this.#processReinforcements();

		this.#emit({
			kind: 'player_turn_ended',
			turn: prevTurn,
			player: prevPlayer,
			nextTurn: this.turn,
			nextPlayer: this.activePlayer
		});

		if (gameTurnComplete) {
			this.#processTorch(); // resolve town-burning before victory reads burned hexes
			this.#evaluateVictory();
		}
	}
}

let gameStore: GameStore | null = null;

export function initGameStore(scenario: Scenario) {
	if (!gameStore) {
		if (!scenario) {
			throw new Error('GameStore must be initialized with a scenario.');
		}
		gameStore = GameStore.fromScenario(scenario);
	}

	return gameStore;
}

export function getGameStore() {
	if (!gameStore) {
		throw new Error('GameStore not initialized!');
	}
	return gameStore;
}

export function resetGameStore() {
	gameStore = null;
}
