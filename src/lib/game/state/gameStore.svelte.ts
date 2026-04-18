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
import { ActivationStep, HexFacing, type Player, type Unit } from '../core/types';
import { getUnitDefinition } from '../core/unitDefinitions';

export class GameStore {
	units: Unit[] = $state([]);
	grid: Grid<HexCell> | undefined = $state();
	activePlayer: Player = $state(0);
	activationStep: ActivationStep = $state(ActivationStep.AWAITING_ACTIVATION);
	activeUnitId: string | null = $state(null);
	turn: number = $state(1);
	selectedUnit = $derived(this.units.find((u) => u.selected === true));
	validMoveTargets: MoveTarget[] = $derived.by(() => {
		if (this.activeUnitId === null) return [];
		if (this.activationStep !== ActivationStep.ACTION) return [];
		if (!this.grid) return [];
		const active = this.units.find((u) => u.id === this.activeUnitId);
		if (!active) return [];
		const def = getUnitDefinition(active.type);
		if (active.movementPointsUsed >= def.movementAllowance) return [];
		if (active.facingStepsUsed >= 2) return [];
		const remainingMP = def.movementAllowance - active.movementPointsUsed;
		return getValidMoveTargets(active, this.grid, this.units, remainingMP);
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
			activated: false
		}));
	}

	toggleUnit(unit: Unit) {
		if (this.activeUnitId !== null) return;
		if (unit.player !== this.activePlayer) return;
		if (unit.activated) return;

		const isSelected = this.selectedUnit?.id === unit.id;

		this.units = this.units.map((u) => ({
			...u,
			selected: u.id === unit.id ? !isSelected : false
		}));
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

	// -- Activation lifecycle --

	activateUnit(id: string) {
		if (this.activationStep !== ActivationStep.AWAITING_ACTIVATION) return;
		const unit = this.#getUnit(id);
		if (unit.player !== this.activePlayer) return;
		if (unit.activated) return;

		this.activeUnitId = id;
		this.units = this.units.map((u) => ({
			...u,
			selected: u.id === id
		}));
		this.activationStep = ActivationStep.COMMAND_CHECK;
		// Stub: command check auto-passes
		this.activationStep = ActivationStep.ACTION;
	}

	completeAction() {
		if (this.activationStep !== ActivationStep.ACTION) return;

		this.activationStep = ActivationStep.CHARGE_RESOLUTION;
		// Stub: charge resolution auto-completes
		this.activationStep = ActivationStep.MORALE_CHECK;
		// Stub: morale check auto-passes
		this.activationStep = ActivationStep.ACTIVATION_COMPLETE;
	}

	endActivation() {
		if (this.activationStep !== ActivationStep.ACTIVATION_COMPLETE) return;
		if (this.activeUnitId === null) return;

		const activeId = this.activeUnitId;
		this.units = this.units.map((u) => ({
			...u,
			activated: u.id === activeId ? true : u.activated,
			movementPointsUsed: u.id === activeId ? 0 : u.movementPointsUsed,
			facingStepsUsed: u.id === activeId ? 0 : u.facingStepsUsed,
			selected: u.id === activeId ? false : u.selected
		}));
		this.activeUnitId = null;
		this.activationStep = ActivationStep.AWAITING_ACTIVATION;
	}

	endPlayerTurn() {
		if (this.activationStep !== ActivationStep.AWAITING_ACTIVATION) return;

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
