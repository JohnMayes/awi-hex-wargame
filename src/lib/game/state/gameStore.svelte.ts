import type { MapDefinition } from '../data/maps';
import { Grid, type OffsetCoordinates } from 'honeycomb-grid';
import { HexCell, coordsEqual } from '../core/hex';
import { facingStepsBetween } from '../core/facing';
import {
	getValidMoveTargets,
	requiresDifficultTerrainCheck,
	rollDifficultTerrainCheck,
	type MoveTarget
} from '../core/movement';
import { getValidFireTargets, resolveFireAction, type FireResult } from '../core/combat';
import { ActionType, ActivationStep, HexFacing, type Player, type Unit } from '../core/types';
import { getUnitDefinition } from '../core/unitDefinitions';

export type ActionMode = 'move' | 'fire' | 'rotate';

export class GameStore {
	units: Unit[] = $state([]);
	grid: Grid<HexCell> | undefined = $state();
	activePlayer: Player = $state(0);
	activationStep: ActivationStep = $state(ActivationStep.AWAITING_ACTIVATION);
	activeUnitId: string | null = $state(null);
	actionMode: ActionMode | null = $state(null);
	turn: number = $state(1);
	selectedUnit = $derived(this.units.find((u) => u.selected === true));
	validMoveTargets: MoveTarget[] = $derived.by(() => {
		if (this.activeUnitId === null) return [];
		if (this.activationStep !== ActivationStep.ACTION) return [];
		if (this.actionMode === 'fire' || this.actionMode === 'rotate') return [];
		if (!this.grid) return [];
		const active = this.units.find((u) => u.id === this.activeUnitId);
		if (!active) return [];
		const def = getUnitDefinition(active.type);
		if (def.actionType === ActionType.MOVE_OR_FIRE && active.firedThisActivation) return [];
		if (active.movementPointsUsed >= def.movementAllowance) return [];
		if (active.facingStepsUsed >= 2) return [];
		const remainingMP = def.movementAllowance - active.movementPointsUsed;
		return getValidMoveTargets(active, this.grid, this.units, remainingMP);
	});
	validFireTargets: Unit[] = $derived.by(() => {
		if (this.activeUnitId === null) return [];
		if (this.activationStep !== ActivationStep.ACTION) return [];
		if (this.actionMode === 'move' || this.actionMode === 'rotate') return [];
		if (!this.grid) return [];
		const active = this.units.find((u) => u.id === this.activeUnitId);
		if (!active) return [];
		const def = getUnitDefinition(active.type);
		if (def.firingRange === 0) return [];
		if (active.firedThisActivation) return [];
		if (def.actionType === ActionType.MOVE_OR_FIRE) {
			if (active.movementPointsUsed > 0) return [];
			if (active.facingStepsUsed > 0) return [];
		}
		return getValidFireTargets(active, this.grid, this.units);
	});

	constructor(units: Unit[], map: MapDefinition) {
		const newGrid = new Grid(
			HexCell,
			map.map((cell) => HexCell.create({ col: cell.col, row: cell.row, terrain: cell.terrain }))
		);

		this.grid = newGrid;
		this.units = units;
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

	#clearActivatedFlags() {
		this.units = this.units.map((u) => ({
			...u,
			selected: false,
			movementPointsUsed: 0,
			facingStepsUsed: 0,
			firedThisActivation: false,
			activated: false
		}));
	}

	#activate(id: string) {
		this.activeUnitId = id;
		this.units = this.units.map((u) => ({
			...u,
			selected: u.id === id
		}));
		this.activationStep = ActivationStep.COMMAND_CHECK;
		// Stub: command check auto-passes
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
			facingStepsUsed: u.id === activeId ? 0 : u.facingStepsUsed,
			firedThisActivation: u.id === activeId ? false : u.firedThisActivation,
			selected: u.id === activeId ? false : u.selected
		}));
		this.activeUnitId = null;
		this.actionMode = null;
		this.activationStep = ActivationStep.AWAITING_ACTIVATION;
	}

	// -- Selection / activation --

	selectUnit(unit: Unit) {
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

	beginAction(mode: ActionMode) {
		const sel = this.selectedUnit;
		if (!sel) return;
		if (sel.player !== this.activePlayer) return;
		if (sel.activated) return;

		const def = getUnitDefinition(sel.type);

		// Static eligibility checks
		if (mode === 'fire' && def.firingRange === 0) return;
		if (mode === 'rotate' && !def.hasFacing) return;

		// Per-unit current eligibility (mirrors the derives' final guards)
		if (mode === 'fire') {
			if (sel.firedThisActivation) return;
			if (def.actionType === ActionType.MOVE_OR_FIRE) {
				if (sel.movementPointsUsed > 0 || sel.facingStepsUsed > 0) return;
			}
		}
		if (mode === 'move') {
			if (def.actionType === ActionType.MOVE_OR_FIRE && sel.firedThisActivation) return;
			if (sel.movementPointsUsed >= def.movementAllowance && sel.facingStepsUsed >= 2) return;
		}
		if (mode === 'rotate') {
			if (def.actionType === ActionType.MOVE_OR_FIRE && sel.firedThisActivation) return;
			if (sel.facingStepsUsed >= 2) return;
		}

		// Mode-switch committal lock for MOVE_OR_FIRE units
		if (this.actionMode !== null && def.actionType === ActionType.MOVE_OR_FIRE) {
			const currentSide = this.actionMode === 'fire' ? 'fire' : 'move';
			const newSide = mode === 'fire' ? 'fire' : 'move';
			if (currentSide !== newSide) return;
		}

		// Activate if not yet
		if (this.activeUnitId !== sel.id) {
			this.#activate(sel.id);
		}
		this.actionMode = mode;
	}

	// -- Movement --

	moveUnit(newCords: OffsetCoordinates, rng: () => number = Math.random) {
		if (this.activeUnitId === null) return;
		if (this.activationStep !== ActivationStep.ACTION) return;
		if (this.selectedUnit?.id !== this.activeUnitId) return;
		if (this.selectedUnit.player !== this.activePlayer) return;
		if (!this.grid) return;

		const target = this.validMoveTargets.find((t) => coordsEqual(t.coordinates, newCords));
		if (!target) return;

		const def = getUnitDefinition(this.selectedUnit.type);
		const activeId = this.activeUnitId;

		if (requiresDifficultTerrainCheck(this.selectedUnit, this.grid)) {
			const passed = rollDifficultTerrainCheck(rng);
			if (!passed) {
				this.units = this.units.map((u) =>
					u.id === activeId ? { ...u, movementPointsUsed: def.movementAllowance } : u
				);
				return;
			}
		}

		this.units = this.units.map((u) => ({
			...u,
			coordinates: u.id === activeId ? newCords : u.coordinates,
			movementPointsUsed:
				u.id === activeId ? u.movementPointsUsed + target.cost : u.movementPointsUsed
		}));
	}

	changeFacing(facing: HexFacing) {
		if (this.activeUnitId === null) return;
		if (this.activationStep !== ActivationStep.ACTION) return;
		if (this.selectedUnit?.id !== this.activeUnitId) return;
		if (this.selectedUnit.player !== this.activePlayer) return;

		const def = getUnitDefinition(this.selectedUnit.type);
		if (def.actionType === ActionType.MOVE_OR_FIRE && this.selectedUnit.firedThisActivation) {
			return;
		}

		const current = this.selectedUnit.facing;
		const steps = facingStepsBetween(current, facing);
		if (steps === 0) return;
		const maxAllowed = this.selectedUnit.movementPointsUsed > 0 ? 1 : 2;
		if (this.selectedUnit.facingStepsUsed + steps > maxAllowed) return;

		const activeId = this.activeUnitId;
		this.units = this.units.map((u) => ({
			...u,
			facing: u.id === activeId ? facing : u.facing,
			facingStepsUsed: u.id === activeId ? u.facingStepsUsed + steps : u.facingStepsUsed
		}));
	}

	// -- Firing --

	fireAt(targetId: string, rng: () => number = Math.random): FireResult | null {
		if (this.activeUnitId === null) return null;
		if (this.activationStep !== ActivationStep.ACTION) return null;
		if (this.selectedUnit?.id !== this.activeUnitId) return null;
		if (this.selectedUnit.player !== this.activePlayer) return null;
		if (!this.grid) return null;

		const target = this.validFireTargets.find((u) => u.id === targetId);
		if (!target) return null;

		const result = resolveFireAction(this.selectedUnit, target, this.grid, rng);
		const activeId = this.activeUnitId;
		this.units = this.units.map((u) => {
			if (u.id === activeId) return { ...u, firedThisActivation: true };
			if (u.id === targetId && result.damage > 0) {
				return { ...u, strengthPoints: Math.max(0, u.strengthPoints - result.damage) };
			}
			return u;
		});
		return result;
	}

	// -- Activation lifecycle --

	activateUnit(id: string) {
		if (this.activeUnitId !== null) return;
		const unit = this.#getUnit(id);
		if (unit.player !== this.activePlayer) return;
		if (unit.activated) return;
		this.#activate(id);
	}

	endActivation() {
		this.#finishActivation();
	}

	endPlayerTurn() {
		if (this.activeUnitId !== null) {
			this.#finishActivation();
		}

		if (this.activePlayer === 0) {
			this.activePlayer = 1;
		} else {
			this.activePlayer = 0;
			this.turn = this.turn + 1;
			this.#clearActivatedFlags();
		}
	}
}

let gameStore: GameStore | null = null;

export function initGameStore(units: Unit[], map: MapDefinition) {
	if (!gameStore) {
		if (!units || !map) {
			throw new Error('GameStore must be initialized with units and map.');
		}
		gameStore = new GameStore(units, map);
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
