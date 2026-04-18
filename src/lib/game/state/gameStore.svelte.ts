import type { MapDefinition } from '../data/maps';
import { Grid, type OffsetCoordinates } from 'honeycomb-grid';
import { HexCell, coordsEqual } from '../core/hex';
import { Phase, type Player, type Unit } from '../core/types';

class GameStore {

  units: Unit[] = $state([]);
  grid: Grid<HexCell> | undefined = $state();
  activePlayer: Player = $state(0);
  currentPhase: Phase = $state(Phase.MOVEMENT);
  turn: number = $state(1);
  selectedUnit = $derived(this.
    units.find(u => u.selected === true));

  constructor(units: Unit[], map: MapDefinition) {
    const newGrid = new Grid(
      HexCell,
      map.map(cell => HexCell.create({ col: cell.col, row: cell.row, terrain: cell.terrain }))
    );

    this.grid = newGrid;
    this.units = units;
  };

  // -- Helpers --
  takesCordsReturnsPos(cords: OffsetCoordinates) {
    const targetHex = this.grid?.getHex(cords);
    if (targetHex) {
      const { x, y } = targetHex;
      return { x, y };
    } else {
      console.log(`No hex found at ${cords}`)
    }
  };

  hexAt(cords: OffsetCoordinates) {
    return this.grid?.getHex(cords) ?? null;
  };

  unitAt(cords: OffsetCoordinates) {
    return this.units.find(u => coordsEqual(u.coordinates, cords)) ?? null;
  };

  #getUnit(id: string) {
    const u = this.units.find(u => u.id === id);
    if (!u) throw new Error(`Unit ${id} not found`);
    return u;
  };

  #clearUnitFlags() {
    this.units = this.units.map((u) => ({
      ...u,
      selected: false,
      hasMoved: false,
      activated: false
    }))
  }

  toggleUnit(unit: Unit) {
    if (unit.player !== this.activePlayer) return;
    const isSelected = this.selectedUnit?.id === unit.id;

    this.units = this.units.map((u) => ({
      ...u,
      selected: u.id === unit.id ? !isSelected : false
    }));
  }

  // -- Movement --

  moveUnit(newCords: OffsetCoordinates) {
    if (!this.selectedUnit || this.currentPhase !== Phase.MOVEMENT || this.selectedUnit.player !== this.activePlayer) return;

    this.units = this.units.map((u) => ({
      ...u,
      coordinates: u.id === this.selectedUnit?.id ? newCords : u.coordinates,
      hasMoved: u.id === this.selectedUnit?.id ? true : u.hasMoved
    }));
  }

  changeFacing(facing: number) {
    if (!this.selectedUnit || this.currentPhase !== Phase.MOVEMENT || this.selectedUnit.player !== this.activePlayer) return;

    this.units = this.units.map((u) => ({
      ...u,
      facing: u.id === this.selectedUnit?.id ? facing : u.facing
    }));
  }

  // -- Phase Management --
  advancePhase() {
    switch (this.currentPhase) {
      case Phase.MOVEMENT:
        this.currentPhase = Phase.SHOOTING;
        break;
      case Phase.SHOOTING:
        this.currentPhase = Phase.HAND_TO_HAND;
        break;
      case Phase.HAND_TO_HAND:
        this.currentPhase = Phase.ELIMINATION;
        break;
      case Phase.ELIMINATION:
        this.#clearUnitFlags();
        this.activePlayer = this.activePlayer === 0 ? 1 : 0;
        this.currentPhase = Phase.MOVEMENT;
        this.turn = this.turn += 1;
        break;
    }
  }

}

let gameStore: GameStore | null = null;

export function initGameStore(units: Unit[], map: MapDefinition) {
  if (!gameStore) {
    if (!units || !map) {
      throw new Error('GameStore must be initialized with units and map.')
    }
    gameStore = new GameStore(units, map);
  }

  return gameStore;
}

export function getGameStore() {
  if (!gameStore) {
    throw new Error('GameStore not initialized!')
  }
  return gameStore;
}

export function resetGameStore() {
  gameStore = null;
}
