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
import type { Scenario } from '../core/scenario';
import { ActionType, ActivationStep, type Player, type Unit } from '../core/types';
import { getUnitDefinition } from '../core/unitDefinitions';
import {
	boundsFromCoords,
	emptyVictoryProgress,
	evaluateVictory,
	type VictoryCondition,
	type VictoryOutcome,
	type VictoryProgress,
	type VictorySnapshot
} from '../core/victory';

export type ActionMode = 'move' | 'fire';

export type GameStoreConfig = {
	firstPlayer?: Player;
	turnLimit?: number | null;
	victoryConditions?: VictoryCondition[];
};

export class GameStore {
	units: Unit[] = $state([]);
	leaders: Leader[] = $state([]);
	grid: Grid<HexCell> | undefined = $state();
	activePlayer: Player = $state(0);
	activationStep: ActivationStep = $state(ActivationStep.AWAITING_ACTIVATION);
	activeUnitId: string | null = $state(null);
	actionMode: ActionMode | null = $state(null);
	turn: number = $state(1);
	turnLimit: number | null = $state(null);
	lastCommandCheck: CommandCheckResult | null = $state(null);
	log: LogEvent[] = $state([]);
	victoryConditions: VictoryCondition[] = $state([]);
	victoryProgress: VictoryProgress = $state(emptyVictoryProgress());
	victoryOutcome: VictoryOutcome | null = $state(null);
	isGameOver = $derived(this.victoryOutcome !== null);
	selectedUnit = $derived(this.units.find((u) => u.selected === true));
	validMoveTargets: MoveTarget[] = $derived.by(() => {
		if (this.activeUnitId === null) return [];
		if (this.activationStep !== ActivationStep.ACTION) return [];
		if (this.actionMode === 'fire') return [];
		if (!this.grid) return [];
		const active = this.units.find((u) => u.id === this.activeUnitId);
		if (!active) return [];
		const def = getUnitDefinition(active.type);
		if (def.actionType === ActionType.MOVE_OR_FIRE && active.firedThisActivation) return [];
		if (active.movementPointsUsed >= def.movementAllowance) return [];
		const remainingMP = def.movementAllowance - active.movementPointsUsed;
		return getValidMoveTargets(active, this.grid, this.units, remainingMP);
	});
	validFireTargets: Unit[] = $derived.by(() => {
		if (this.activeUnitId === null) return [];
		if (this.activationStep !== ActivationStep.ACTION) return [];
		if (this.actionMode === 'move') return [];
		if (!this.grid) return [];
		const active = this.units.find((u) => u.id === this.activeUnitId);
		if (!active) return [];
		const def = getUnitDefinition(active.type);
		if (def.firingRange === 0) return [];
		if (active.firedThisActivation) return [];
		if (def.actionType === ActionType.MOVE_OR_FIRE) {
			if (active.movementPointsUsed > 0) return [];
		}
		return getValidFireTargets(active, this.grid, this.units);
	});
	validChargeTargets: Unit[] = $derived.by(() => {
		if (this.activeUnitId === null) return [];
		if (this.activationStep !== ActivationStep.ACTION) return [];
		if (this.actionMode === 'fire') return [];
		if (!this.grid) return [];
		const active = this.units.find((u) => u.id === this.activeUnitId);
		if (!active) return [];
		return getValidChargeTargets(active, this.grid, this.units);
	});

	// Immutable scenario context, set once at construction.
	#bounds: VictorySnapshot['bounds'];
	#startingUnitsByPlayer: Record<Player, number>;

	constructor(units: Unit[], map: MapDefinition, leaders: Leader[], config: GameStoreConfig = {}) {
		const newGrid = new Grid(
			HexCell,
			map.map((cell) => HexCell.create({ col: cell.col, row: cell.row, terrain: cell.terrain }))
		);

		this.grid = newGrid;
		this.units = units;
		this.leaders = leaders;
		this.activePlayer = config.firstPlayer ?? 0;
		this.turnLimit = config.turnLimit ?? null;
		this.victoryConditions = config.victoryConditions ?? [];
		this.#bounds = boundsFromCoords(map);
		this.#startingUnitsByPlayer = {
			0: units.filter((u) => u.player === 0).length,
			1: units.filter((u) => u.player === 1).length
		};
	}

	static fromScenario(scenario: Scenario): GameStore {
		return new GameStore(
			structuredClone(scenario.units),
			scenario.map,
			structuredClone(scenario.leaders),
			{
				firstPlayer: scenario.firstPlayer,
				turnLimit: scenario.turnLimit,
				victoryConditions: scenario.victoryConditions
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

	#emit(event: LogEvent) {
		this.log = [...this.log, event];
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
			startingUnitsByPlayer: this.#startingUnitsByPlayer,
			bounds: this.#bounds,
			exitedThisTurn: [] // exit action deferred; evaluator supports it for future use
		};
		const { progress, outcome } = evaluateVictory(
			this.victoryConditions,
			snapshot,
			this.victoryProgress
		);
		this.victoryProgress = progress;
		if (outcome) {
			this.victoryOutcome = outcome;
			this.#emit({ kind: 'game_over', turn: this.turn, outcome });
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
			// Wasted activation: the unit cannot move/fire/charge this game turn.
			// Flow through the remaining lifecycle steps so observers see the
			// transition and the activated flag gets set.
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
		this.actionMode = null;
		this.activationStep = ActivationStep.AWAITING_ACTIVATION;
		this.#emit({
			kind: 'activation_ended',
			turn: this.turn,
			player: this.activePlayer,
			unitId: activeId
		});
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

		// If the unit is already activated (re-clicking the active unit), no-op.
		if (this.activeUnitId === unit.id) return;

		const isSelected = this.selectedUnit?.id === unit.id;
		this.units = this.units.map((u) => ({
			...u,
			selected: u.id === unit.id ? !isSelected : false
		}));
	}

	beginAction(mode: ActionMode, rng: () => number = Math.random) {
		if (this.victoryOutcome) return;
		const sel = this.selectedUnit;
		if (!sel) return;
		if (sel.player !== this.activePlayer) return;
		if (sel.activated) return;

		const def = getUnitDefinition(sel.type);

		// Static eligibility checks
		if (mode === 'fire' && def.firingRange === 0) return;

		// Per-unit current eligibility (mirrors the derives' final guards)
		if (mode === 'fire') {
			if (sel.firedThisActivation) return;
			if (def.actionType === ActionType.MOVE_OR_FIRE) {
				if (sel.movementPointsUsed > 0) return;
			}
		}
		if (mode === 'move') {
			if (def.actionType === ActionType.MOVE_OR_FIRE && sel.firedThisActivation) return;
			if (sel.movementPointsUsed >= def.movementAllowance) return;
		}

		// Mode-switch committal lock for MOVE_OR_FIRE units
		if (this.actionMode !== null && this.actionMode !== mode) {
			if (def.actionType === ActionType.MOVE_OR_FIRE) return;
		}

		// Activate if not yet
		if (this.activeUnitId !== sel.id) {
			this.#activate(sel.id, rng);
			// A failed command check ends the activation immediately.
			if (this.activeUnitId === null) return;
		}
		this.actionMode = mode;
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
			result: fireResult
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
			result: chargeResult
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

		const prevTurn = this.turn;
		const prevPlayer = this.activePlayer;

		if (this.activePlayer === 0) {
			this.activePlayer = 1;
		} else {
			this.activePlayer = 0;
			this.turn = this.turn + 1;
			this.#clearActivatedFlags();
		}

		this.#emit({
			kind: 'player_turn_ended',
			turn: prevTurn,
			player: prevPlayer,
			nextTurn: this.turn,
			nextPlayer: this.activePlayer
		});

		// A full game turn completes when the second player (1) hands back to 0.
		if (prevPlayer === 1) {
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
