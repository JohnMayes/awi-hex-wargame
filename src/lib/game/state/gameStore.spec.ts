import { describe, expect, it } from 'vitest';
import { GameStore, type ActionMode } from './gameStore.svelte';
import { ActivationStep, HexFacing, type Unit } from '../core/types';
import { TEST_UNITS } from '../data/scenarios';
import { TEST_MAP } from '../data/maps';
import { getUnitDefinition } from '../core/unitDefinitions';

const makeStore = () => new GameStore(structuredClone(TEST_UNITS), TEST_MAP);

// Blue-line-inf at (0,0) facing SE has no legal front-arc moves on the test
// map (all front neighbors fall off-map). For tests that exercise a valid
// move, give it facing N so that direction 0 lands on (1, 0).
const makeStoreForLineInfMove = () => {
	const units = structuredClone(TEST_UNITS) as Unit[];
	const lineInf = units.find((u) => u.id === 'blue-line-inf');
	if (lineInf) lineInf.facing = HexFacing.N;
	return new GameStore(units, TEST_MAP);
};

const select = (store: GameStore, id: string) => {
	const unit = store.units.find((u) => u.id === id);
	if (!unit) throw new Error(`Unit ${id} not found`);
	store.selectUnit(unit);
};

// Convenience: select + beginAction. Defaults to a mode the unit can use.
const begin = (store: GameStore, id: string, mode?: ActionMode) => {
	const unit = store.units.find((u) => u.id === id);
	if (!unit) throw new Error(`Unit ${id} not found`);
	store.selectUnit(unit);
	const def = getUnitDefinition(unit.type);
	const m: ActionMode = mode ?? (def.firingRange > 0 ? 'move' : 'move');
	store.beginAction(m);
};

const BLUE_IDS = ['blue-line-inf', 'blue-light-inf', 'blue-dragoons'];
const RED_IDS = ['red-light-horse', 'red-horse', 'red-artillery'];

describe('GameStore initial state', () => {
	it('starts with activePlayer 0', () => {
		expect.assertions(1);
		const store = makeStore();
		expect(store.activePlayer).toBe(0);
	});

	it('starts on turn 1', () => {
		expect.assertions(1);
		const store = makeStore();
		expect(store.turn).toBe(1);
	});

	it('starts in AWAITING_ACTIVATION', () => {
		expect.assertions(1);
		const store = makeStore();
		expect(store.activationStep).toBe(ActivationStep.AWAITING_ACTIVATION);
	});

	it('starts with no active unit', () => {
		expect.assertions(1);
		const store = makeStore();
		expect(store.activeUnitId).toBeNull();
	});

	it('starts with no actionMode', () => {
		expect.assertions(1);
		const store = makeStore();
		expect(store.actionMode).toBeNull();
	});

	it('starts with all units unactivated', () => {
		expect.assertions(1);
		const store = makeStore();
		expect(store.units.every((u) => u.activated === false)).toBe(true);
	});

	it('starts with all units at movementPointsUsed 0', () => {
		expect.assertions(1);
		const store = makeStore();
		expect(store.units.every((u) => u.movementPointsUsed === 0)).toBe(true);
	});

	it('starts with no units selected', () => {
		expect.assertions(1);
		const store = makeStore();
		expect(store.units.every((u) => u.selected === false)).toBe(true);
	});
});

describe('activateUnit', () => {
	it('sets activeUnitId to the activated unit', () => {
		expect.assertions(1);
		const store = makeStore();
		store.activateUnit('blue-line-inf');
		expect(store.activeUnitId).toBe('blue-line-inf');
	});

	it('auto-advances through COMMAND_CHECK to ACTION', () => {
		expect.assertions(1);
		const store = makeStore();
		store.activateUnit('blue-line-inf');
		expect(store.activationStep).toBe(ActivationStep.ACTION);
	});

	it('marks the activated unit selected', () => {
		expect.assertions(1);
		const store = makeStore();
		store.activateUnit('blue-line-inf');
		const unit = store.units.find((u) => u.id === 'blue-line-inf');
		expect(unit?.selected).toBe(true);
	});

	it('clears selected on all other units', () => {
		expect.assertions(1);
		const store = makeStore();
		store.activateUnit('blue-line-inf');
		const others = store.units.filter((u) => u.id !== 'blue-line-inf');
		expect(others.every((u) => u.selected === false)).toBe(true);
	});

	it('is a no-op when already mid-activation', () => {
		expect.assertions(2);
		const store = makeStore();
		store.activateUnit('blue-line-inf');
		store.activateUnit('blue-light-inf');
		expect(store.activeUnitId).toBe('blue-line-inf');
		expect(store.activationStep).toBe(ActivationStep.ACTION);
	});

	it('is a no-op for the non-active player', () => {
		expect.assertions(2);
		const store = makeStore();
		store.activateUnit('red-light-horse');
		expect(store.activeUnitId).toBeNull();
		expect(store.activationStep).toBe(ActivationStep.AWAITING_ACTIVATION);
	});

	it('is a no-op for a unit that already activated this turn', () => {
		expect.assertions(2);
		const store = makeStore();
		store.activateUnit('blue-line-inf');
		store.endActivation();
		store.activateUnit('blue-line-inf');
		expect(store.activeUnitId).toBeNull();
		expect(store.activationStep).toBe(ActivationStep.AWAITING_ACTIVATION);
	});

	it('throws on unknown unit id', () => {
		expect.assertions(1);
		const store = makeStore();
		expect(() => store.activateUnit('no-such-unit')).toThrow();
	});
});

describe('selectUnit', () => {
	it('selects an active-player, non-activated unit', () => {
		expect.assertions(1);
		const store = makeStore();
		select(store, 'blue-line-inf');
		const after = store.units.find((u) => u.id === 'blue-line-inf');
		expect(after?.selected).toBe(true);
	});

	it('toggles deselect on a second click of the same unit (when not activated)', () => {
		expect.assertions(1);
		const store = makeStore();
		const unit = store.units.find((u) => u.id === 'blue-line-inf')!;
		store.selectUnit(unit);
		// re-fetch a fresh reference (units array is replaced on each mutation)
		const fresh = store.units.find((u) => u.id === 'blue-line-inf')!;
		store.selectUnit(fresh);
		const after = store.units.find((u) => u.id === 'blue-line-inf');
		expect(after?.selected).toBe(false);
	});

	it('is a no-op for an opposing-player unit', () => {
		expect.assertions(1);
		const store = makeStore();
		select(store, 'red-horse');
		const after = store.units.find((u) => u.id === 'red-horse');
		expect(after?.selected).toBe(false);
	});

	it('is a no-op on an already-activated unit', () => {
		expect.assertions(1);
		const store = makeStore();
		store.activateUnit('blue-line-inf');
		store.endActivation();
		select(store, 'blue-line-inf');
		const after = store.units.find((u) => u.id === 'blue-line-inf');
		expect(after?.selected).toBe(false);
	});

	it('auto-ends prior activation when clicking a different friendly unit', () => {
		expect.assertions(5);
		const store = makeStore();
		begin(store, 'blue-line-inf', 'move');
		// Switch to a different friendly unit mid-activation.
		select(store, 'blue-light-inf');
		const prior = store.units.find((u) => u.id === 'blue-line-inf')!;
		const fresh = store.units.find((u) => u.id === 'blue-light-inf')!;
		expect(prior.activated).toBe(true);
		expect(prior.selected).toBe(false);
		expect(fresh.selected).toBe(true);
		expect(store.activeUnitId).toBeNull();
		expect(store.actionMode).toBeNull();
	});
});

describe('beginAction', () => {
	it('activates and sets actionMode', () => {
		expect.assertions(3);
		const store = makeStore();
		select(store, 'blue-line-inf');
		store.beginAction('move');
		expect(store.activeUnitId).toBe('blue-line-inf');
		expect(store.activationStep).toBe(ActivationStep.ACTION);
		expect(store.actionMode).toBe('move');
	});

	it('is a no-op when no unit is selected', () => {
		expect.assertions(2);
		const store = makeStore();
		store.beginAction('move');
		expect(store.activeUnitId).toBeNull();
		expect(store.actionMode).toBeNull();
	});

	it('rejects fire mode for a unit with firingRange 0 (cavalry)', () => {
		expect.assertions(2);
		const store = makeStore();
		store.endPlayerTurn(); // switch to player 1
		select(store, 'red-light-horse');
		store.beginAction('fire');
		expect(store.activeUnitId).toBeNull();
		expect(store.actionMode).toBeNull();
	});

	it('rejects rotate mode for a unit without facing (light infantry)', () => {
		expect.assertions(2);
		const store = makeStore();
		select(store, 'blue-light-inf');
		store.beginAction('rotate');
		expect(store.activeUnitId).toBeNull();
		expect(store.actionMode).toBeNull();
	});

	it('locks fire vs. move/rotate for MOVE_OR_FIRE units (fire then move rejected)', () => {
		expect.assertions(2);
		const store = makeStore();
		begin(store, 'blue-line-inf', 'fire');
		store.beginAction('move');
		expect(store.actionMode).toBe('fire');
		expect(store.activeUnitId).toBe('blue-line-inf');
	});

	it('locks fire vs. move/rotate for MOVE_OR_FIRE units (move then fire rejected)', () => {
		expect.assertions(1);
		const store = makeStore();
		begin(store, 'blue-line-inf', 'move');
		store.beginAction('fire');
		expect(store.actionMode).toBe('move');
	});

	it('allows move ↔ rotate switching for MOVE_OR_FIRE units (rotate then move)', () => {
		expect.assertions(1);
		const store = makeStore();
		begin(store, 'blue-line-inf', 'rotate');
		store.beginAction('move');
		expect(store.actionMode).toBe('move');
	});

	it('allows move ↔ rotate switching for MOVE_OR_FIRE units (move then rotate)', () => {
		expect.assertions(1);
		const store = makeStore();
		begin(store, 'blue-line-inf', 'move');
		store.beginAction('rotate');
		expect(store.actionMode).toBe('rotate');
	});

	it('rejects fire after rotate for MOVE_OR_FIRE units', () => {
		expect.assertions(1);
		const store = makeStore();
		begin(store, 'blue-line-inf', 'rotate');
		store.beginAction('fire');
		expect(store.actionMode).toBe('rotate');
	});

	it('allows free mode switching for FIRE_AND_MOVE units (move then fire)', () => {
		expect.assertions(1);
		const store = makeStore();
		begin(store, 'blue-light-inf', 'move');
		store.beginAction('fire');
		expect(store.actionMode).toBe('fire');
	});

	it('does not activate the unit when mode is rejected', () => {
		expect.assertions(2);
		const store = makeStore();
		store.endPlayerTurn();
		select(store, 'red-light-horse');
		store.beginAction('fire');
		// fire was rejected; nothing else activates either
		expect(store.activeUnitId).toBeNull();
		const u = store.units.find((u) => u.id === 'red-light-horse')!;
		expect(u.selected).toBe(true); // selection persists, just no activation
	});
});

describe('endActivation', () => {
	it('marks the unit activated', () => {
		expect.assertions(1);
		const store = makeStore();
		store.activateUnit('blue-line-inf');
		store.endActivation();
		const unit = store.units.find((u) => u.id === 'blue-line-inf');
		expect(unit?.activated).toBe(true);
	});

	it('clears movementPointsUsed on the active unit', () => {
		expect.assertions(1);
		const store = makeStoreForLineInfMove();
		store.activateUnit('blue-line-inf');
		store.moveUnit({ col: 1, row: 0 });
		store.endActivation();
		const unit = store.units.find((u) => u.id === 'blue-line-inf');
		expect(unit?.movementPointsUsed).toBe(0);
	});

	it('clears selected on the active unit', () => {
		expect.assertions(1);
		const store = makeStore();
		store.activateUnit('blue-line-inf');
		store.endActivation();
		const unit = store.units.find((u) => u.id === 'blue-line-inf');
		expect(unit?.selected).toBe(false);
	});

	it('clears activeUnitId', () => {
		expect.assertions(1);
		const store = makeStore();
		store.activateUnit('blue-line-inf');
		store.endActivation();
		expect(store.activeUnitId).toBeNull();
	});

	it('clears actionMode', () => {
		expect.assertions(1);
		const store = makeStore();
		begin(store, 'blue-line-inf', 'move');
		store.endActivation();
		expect(store.actionMode).toBeNull();
	});

	it('returns to AWAITING_ACTIVATION', () => {
		expect.assertions(1);
		const store = makeStore();
		store.activateUnit('blue-line-inf');
		store.endActivation();
		expect(store.activationStep).toBe(ActivationStep.AWAITING_ACTIVATION);
	});

	it('finishes the activation when called from ACTION step', () => {
		expect.assertions(2);
		const store = makeStore();
		store.activateUnit('blue-line-inf');
		store.endActivation();
		expect(store.activationStep).toBe(ActivationStep.AWAITING_ACTIVATION);
		expect(store.activeUnitId).toBeNull();
	});

	it('is a no-op when there is no active unit', () => {
		expect.assertions(1);
		const store = makeStore();
		store.endActivation();
		expect(store.activationStep).toBe(ActivationStep.AWAITING_ACTIVATION);
	});
});

describe('once-per-turn enforcement', () => {
	it('allows other player-0 units to activate after one completes', () => {
		expect.assertions(2);
		const store = makeStore();
		store.activateUnit('blue-line-inf');
		store.endActivation();
		store.activateUnit('blue-light-inf');
		expect(store.activeUnitId).toBe('blue-light-inf');
		expect(store.activationStep).toBe(ActivationStep.ACTION);
	});
});

describe('endPlayerTurn — player switch', () => {
	it('switches activePlayer 0 → 1', () => {
		expect.assertions(1);
		const store = makeStore();
		store.endPlayerTurn();
		expect(store.activePlayer).toBe(1);
	});

	it('keeps turn at 1 when switching from player 0', () => {
		expect.assertions(1);
		const store = makeStore();
		store.endPlayerTurn();
		expect(store.turn).toBe(1);
	});

	it('preserves activated flags on player-0 units after switch', () => {
		expect.assertions(1);
		const store = makeStore();
		store.activateUnit('blue-line-inf');
		store.endActivation();
		store.endPlayerTurn();
		const unit = store.units.find((u) => u.id === 'blue-line-inf');
		expect(unit?.activated).toBe(true);
	});

	it('allows a player-1 unit to activate after switch', () => {
		expect.assertions(2);
		const store = makeStore();
		store.endPlayerTurn();
		store.activateUnit('red-horse');
		expect(store.activeUnitId).toBe('red-horse');
		expect(store.activationStep).toBe(ActivationStep.ACTION);
	});

	it('blocks a player-0 unit from activating after switch', () => {
		expect.assertions(1);
		const store = makeStore();
		store.endPlayerTurn();
		store.activateUnit('blue-light-inf');
		expect(store.activeUnitId).toBeNull();
	});
});

describe('endPlayerTurn — game turn advance', () => {
	it('switches activePlayer 1 → 0', () => {
		expect.assertions(1);
		const store = makeStore();
		store.endPlayerTurn();
		store.endPlayerTurn();
		expect(store.activePlayer).toBe(0);
	});

	it('increments turn to 2', () => {
		expect.assertions(1);
		const store = makeStore();
		store.endPlayerTurn();
		store.endPlayerTurn();
		expect(store.turn).toBe(2);
	});

	it('clears activated flag on all units at game-turn rollover', () => {
		expect.assertions(1);
		const store = makeStore();
		store.activateUnit('blue-line-inf');
		store.endActivation();
		store.endPlayerTurn();
		store.activateUnit('red-horse');
		store.endActivation();
		store.endPlayerTurn();
		expect(store.units.every((u) => u.activated === false)).toBe(true);
	});

	it('allows a previously-activated unit to activate again after rollover', () => {
		expect.assertions(1);
		const store = makeStore();
		store.activateUnit('blue-line-inf');
		store.endActivation();
		store.endPlayerTurn();
		store.endPlayerTurn();
		store.activateUnit('blue-line-inf');
		expect(store.activeUnitId).toBe('blue-line-inf');
	});
});

describe('endPlayerTurn — auto-finish mid-activation', () => {
	it('auto-finishes the active unit and advances the player', () => {
		expect.assertions(4);
		const store = makeStore();
		store.activateUnit('blue-line-inf');
		store.endPlayerTurn();
		const u = store.units.find((u) => u.id === 'blue-line-inf')!;
		expect(u.activated).toBe(true);
		expect(store.activePlayer).toBe(1);
		expect(store.activationStep).toBe(ActivationStep.AWAITING_ACTIVATION);
		expect(store.activeUnitId).toBeNull();
	});
});

describe('moveUnit gating', () => {
	it('is a no-op in AWAITING_ACTIVATION', () => {
		expect.assertions(1);
		const store = makeStore();
		const before = store.units.find((u) => u.id === 'blue-line-inf')!.coordinates;
		store.moveUnit({ col: 4, row: 4 });
		const after = store.units.find((u) => u.id === 'blue-line-inf')!.coordinates;
		expect(after).toEqual(before);
	});

	it('moves the active unit during ACTION', () => {
		expect.assertions(1);
		const store = makeStoreForLineInfMove();
		store.activateUnit('blue-line-inf');
		store.moveUnit({ col: 1, row: 0 });
		const unit = store.units.find((u) => u.id === 'blue-line-inf');
		expect(unit?.coordinates).toEqual({ col: 1, row: 0 });
	});

	it('increments movementPointsUsed after a move', () => {
		expect.assertions(1);
		const store = makeStoreForLineInfMove();
		store.activateUnit('blue-line-inf');
		store.moveUnit({ col: 1, row: 0 });
		const unit = store.units.find((u) => u.id === 'blue-line-inf');
		expect(unit?.movementPointsUsed).toBe(1);
	});

	it('does not move any other unit', () => {
		expect.assertions(1);
		const store = makeStore();
		const beforeOthers = store.units
			.filter((u) => u.id !== 'blue-line-inf')
			.map((u) => ({ id: u.id, coordinates: u.coordinates }));
		store.activateUnit('blue-line-inf');
		store.moveUnit({ col: 1, row: 0 });
		const afterOthers = store.units
			.filter((u) => u.id !== 'blue-line-inf')
			.map((u) => ({ id: u.id, coordinates: u.coordinates }));
		expect(afterOthers).toEqual(beforeOthers);
	});

	it('is a no-op after the activation has ended', () => {
		expect.assertions(1);
		const store = makeStore();
		store.activateUnit('blue-line-inf');
		store.endActivation();
		const before = store.units.find((u) => u.id === 'blue-line-inf')!.coordinates;
		store.moveUnit({ col: 4, row: 4 });
		const after = store.units.find((u) => u.id === 'blue-line-inf')!.coordinates;
		expect(after).toEqual(before);
	});

	it('is a no-op when actionMode is fire', () => {
		expect.assertions(1);
		const store = makeStoreForLineInfMove();
		begin(store, 'blue-line-inf', 'fire');
		store.moveUnit({ col: 1, row: 0 });
		const unit = store.units.find((u) => u.id === 'blue-line-inf');
		expect(unit?.coordinates).toEqual({ col: 0, row: 0 });
	});
});

describe('changeFacing gating', () => {
	it('is a no-op in AWAITING_ACTIVATION', () => {
		expect.assertions(1);
		const store = makeStore();
		const before = store.units.find((u) => u.id === 'blue-line-inf')!.facing;
		store.changeFacing(0);
		const after = store.units.find((u) => u.id === 'blue-line-inf')!.facing;
		expect(after).toBe(before);
	});

	it('changes facing of the active unit during ACTION', () => {
		expect.assertions(1);
		const store = makeStore();
		store.activateUnit('blue-line-inf');
		store.changeFacing(0);
		const unit = store.units.find((u) => u.id === 'blue-line-inf');
		expect(unit?.facing).toBe(0);
	});

	it('is a no-op after the activation has ended', () => {
		expect.assertions(1);
		const store = makeStore();
		store.activateUnit('blue-line-inf');
		store.endActivation();
		const before = store.units.find((u) => u.id === 'blue-line-inf')!.facing;
		store.changeFacing(0);
		const after = store.units.find((u) => u.id === 'blue-line-inf')!.facing;
		expect(after).toBe(before);
	});
});

describe('moveUnit — validation (M5)', () => {
	it('rejects a target that is not in validMoveTargets', () => {
		expect.assertions(2);
		const store = makeStoreForLineInfMove();
		store.activateUnit('blue-line-inf');
		const before = store.units.find((u) => u.id === 'blue-line-inf')!.coordinates;
		store.moveUnit({ col: 4, row: 3 });
		const after = store.units.find((u) => u.id === 'blue-line-inf')!;
		expect(after.coordinates).toEqual(before);
		expect(after.movementPointsUsed).toBe(0);
	});

	it('rejects a move after MP is exhausted (1-MP unit)', () => {
		expect.assertions(1);
		const store = makeStoreForLineInfMove();
		store.activateUnit('blue-line-inf');
		store.moveUnit({ col: 1, row: 0 });
		// validMoveTargets is now empty (movementPointsUsed === allowance), so rejected
		store.moveUnit({ col: 0, row: 0 });
		const after = store.units.find((u) => u.id === 'blue-line-inf')!;
		expect(after.coordinates).toEqual({ col: 1, row: 0 });
	});

	it('validMoveTargets is empty in AWAITING_ACTIVATION', () => {
		expect.assertions(1);
		const store = makeStoreForLineInfMove();
		expect(store.validMoveTargets).toHaveLength(0);
	});

	it('validMoveTargets is non-empty for a freshly-activated unit', () => {
		expect.assertions(1);
		const store = makeStoreForLineInfMove();
		store.activateUnit('blue-line-inf');
		expect(store.validMoveTargets.length).toBeGreaterThan(0);
	});

	it('validMoveTargets clears after a successful move', () => {
		expect.assertions(1);
		const store = makeStoreForLineInfMove();
		store.activateUnit('blue-line-inf');
		store.moveUnit({ col: 1, row: 0 });
		expect(store.validMoveTargets).toHaveLength(0);
	});

	it('validMoveTargets is empty after endActivation', () => {
		expect.assertions(1);
		const store = makeStoreForLineInfMove();
		store.activateUnit('blue-line-inf');
		store.endActivation();
		expect(store.validMoveTargets).toHaveLength(0);
	});

	it('validMoveTargets is empty when actionMode is fire', () => {
		expect.assertions(1);
		const store = makeStoreForLineInfMove();
		begin(store, 'blue-line-inf', 'fire');
		expect(store.validMoveTargets).toHaveLength(0);
	});

	it('validMoveTargets is empty when actionMode is rotate', () => {
		expect.assertions(1);
		const store = makeStoreForLineInfMove();
		begin(store, 'blue-line-inf', 'rotate');
		expect(store.validMoveTargets).toHaveLength(0);
	});
});

describe('moveUnit — difficult terrain check (M5)', () => {
	// Custom setup: Line Infantry on HILLTOP at (2,2) facing N.
	const makeHilltopStore = () => {
		const units = structuredClone(TEST_UNITS) as Unit[];
		const lineInf = units.find((u) => u.id === 'blue-line-inf')!;
		lineInf.coordinates = { col: 2, row: 2 };
		lineInf.facing = HexFacing.N;
		return new GameStore(units, TEST_MAP);
	};

	it('Line Infantry on HILLTOP escapes when RNG ≥ 0.5', () => {
		expect.assertions(2);
		const store = makeHilltopStore();
		store.activateUnit('blue-line-inf');
		const target = store.validMoveTargets[0];
		expect(target).toBeDefined();
		store.moveUnit(target.coordinates, () => 0.9);
		const after = store.units.find((u) => u.id === 'blue-line-inf')!;
		expect(after.coordinates).toEqual(target.coordinates);
	});

	it('Line Infantry on HILLTOP stays put when RNG < 0.5, consuming the action', () => {
		expect.assertions(2);
		const store = makeHilltopStore();
		store.activateUnit('blue-line-inf');
		const target = store.validMoveTargets[0];
		store.moveUnit(target.coordinates, () => 0.1);
		const after = store.units.find((u) => u.id === 'blue-line-inf')!;
		expect(after.coordinates).toEqual({ col: 2, row: 2 });
		expect(after.movementPointsUsed).toBe(1); // allowance exhausted despite no movement
	});

	it('Light Infantry on HILLTOP moves without a check even when RNG < 0.5', () => {
		expect.assertions(1);
		const units = structuredClone(TEST_UNITS) as Unit[];
		const lightInf = units.find((u) => u.id === 'blue-light-inf')!;
		lightInf.coordinates = { col: 2, row: 2 };
		const store = new GameStore(units, TEST_MAP);
		store.activateUnit('blue-light-inf');
		const target = store.validMoveTargets[0];
		store.moveUnit(target.coordinates, () => 0.01);
		const after = store.units.find((u) => u.id === 'blue-light-inf')!;
		expect(after.coordinates).toEqual(target.coordinates);
	});
});

describe('moveUnit — multi-step movement (M5)', () => {
	// Dragoons have movementAllowance 2. Position at (1,1) facing N — OPEN
	// terrain, no terrain check required, front neighbors on-map.
	const makeStoreForDragonMove = () => {
		const units = structuredClone(TEST_UNITS) as Unit[];
		const dragoons = units.find((u) => u.id === 'blue-dragoons')!;
		dragoons.coordinates = { col: 1, row: 1 };
		dragoons.facing = HexFacing.N;
		return new GameStore(units, TEST_MAP);
	};

	it('Dragoon validMoveTargets is non-empty after moving 1 of 2 hexes', () => {
		expect.assertions(2);
		const store = makeStoreForDragonMove();
		store.activateUnit('blue-dragoons');
		const firstTarget = store.validMoveTargets[0];
		expect(firstTarget).toBeDefined();
		store.moveUnit(firstTarget.coordinates);
		// 1 MP used, 1 remaining — targets should still be available
		expect(store.validMoveTargets.length).toBeGreaterThan(0);
	});

	it('Dragoon can move hex-by-hex across 2 hexes', () => {
		expect.assertions(2);
		const store = makeStoreForDragonMove();
		store.activateUnit('blue-dragoons');
		const firstTarget = store.validMoveTargets[0];
		store.moveUnit(firstTarget.coordinates);
		const secondTarget = store.validMoveTargets[0];
		expect(secondTarget).toBeDefined();
		store.moveUnit(secondTarget.coordinates);
		const u = store.units.find((u) => u.id === 'blue-dragoons')!;
		expect(u.movementPointsUsed).toBe(2);
	});

	it('Dragoon validMoveTargets clears after using both MP', () => {
		expect.assertions(1);
		const store = makeStoreForDragonMove();
		store.activateUnit('blue-dragoons');
		const first = store.validMoveTargets[0];
		store.moveUnit(first.coordinates);
		const second = store.validMoveTargets[0];
		store.moveUnit(second.coordinates);
		expect(store.validMoveTargets).toHaveLength(0);
	});
});

describe('changeFacing — rotation limits (M5)', () => {
	// blue-line-inf starts facing SE (120).
	// 1 step: NE(60) or S(180). 2 steps: N(0) or SW(240). 3 steps: NW(300).

	it('allows 1-step rotation stationary and sets facingStepsUsed to 1', () => {
		expect.assertions(2);
		const store = makeStore();
		store.activateUnit('blue-line-inf');
		store.changeFacing(HexFacing.S);
		const u = store.units.find((u) => u.id === 'blue-line-inf')!;
		expect(u.facing).toBe(HexFacing.S);
		expect(u.facingStepsUsed).toBe(1);
	});

	it('allows 2-step rotation stationary and sets facingStepsUsed to 2', () => {
		expect.assertions(2);
		const store = makeStore();
		store.activateUnit('blue-line-inf');
		store.changeFacing(HexFacing.N);
		const u = store.units.find((u) => u.id === 'blue-line-inf')!;
		expect(u.facing).toBe(HexFacing.N);
		expect(u.facingStepsUsed).toBe(2);
	});

	it('rejects 3-step rotation (NW from SE)', () => {
		expect.assertions(2);
		const store = makeStore();
		store.activateUnit('blue-line-inf');
		store.changeFacing(HexFacing.NW);
		const u = store.units.find((u) => u.id === 'blue-line-inf')!;
		expect(u.facing).toBe(HexFacing.SE);
		expect(u.facingStepsUsed).toBe(0);
	});

	it('rejects 2-step rotation after a move (post-move cap is 1)', () => {
		expect.assertions(1);
		const store = makeStoreForLineInfMove();
		store.activateUnit('blue-line-inf');
		store.moveUnit({ col: 1, row: 0 });
		// Now facing N; 2-step target is SE or SW. Try SE.
		store.changeFacing(HexFacing.SE);
		const u = store.units.find((u) => u.id === 'blue-line-inf')!;
		expect(u.facing).toBe(HexFacing.N);
	});

	it('allows 1-step rotation after a move', () => {
		expect.assertions(1);
		const store = makeStoreForLineInfMove();
		store.activateUnit('blue-line-inf');
		store.moveUnit({ col: 1, row: 0 });
		// Facing N; 1-step target NE.
		store.changeFacing(HexFacing.NE);
		const u = store.units.find((u) => u.id === 'blue-line-inf')!;
		expect(u.facing).toBe(HexFacing.NE);
	});

	it('does not increment facingStepsUsed on a 0-step facing change', () => {
		expect.assertions(2);
		const store = makeStore();
		store.activateUnit('blue-line-inf');
		store.changeFacing(HexFacing.SE); // same as current
		const u = store.units.find((u) => u.id === 'blue-line-inf')!;
		expect(u.facing).toBe(HexFacing.SE);
		expect(u.facingStepsUsed).toBe(0);
	});

	it('allows 1-step rotation before a move (rotate-then-move)', () => {
		expect.assertions(2);
		const store = makeStoreForLineInfMove();
		store.activateUnit('blue-line-inf');
		// Rotate 1 step (SE → S or NE) — should not block subsequent movement
		store.changeFacing(HexFacing.NE);
		const u = store.units.find((u) => u.id === 'blue-line-inf')!;
		expect(u.facingStepsUsed).toBe(1);
		// validMoveTargets should still be non-empty (facing changed, allowance not consumed)
		expect(store.validMoveTargets.length).toBeGreaterThan(0);
	});

	it('2-step stationary rotation blocks subsequent movement', () => {
		expect.assertions(1);
		const store = makeStore();
		store.activateUnit('blue-line-inf');
		store.changeFacing(HexFacing.N); // 2 steps from SE
		// validMoveTargets should now be empty (facingStepsUsed === 2 gates it)
		expect(store.validMoveTargets).toHaveLength(0);
	});

	it('rejects a second rotation after rotate-then-move', () => {
		expect.assertions(1);
		const store = makeStoreForLineInfMove();
		store.activateUnit('blue-line-inf');
		store.changeFacing(HexFacing.NE); // 1 step: SE → NE
		store.moveUnit({ col: 1, row: 0 });
		// 1 facing step already used + 1 MP used; another rotation should be rejected
		store.changeFacing(HexFacing.N); // would be 1 more step, but cap=1 already reached
		const u = store.units.find((u) => u.id === 'blue-line-inf')!;
		expect(u.facing).toBe(HexFacing.NE);
	});
});

// --- M7: Firing combat ---

// Place blue-light-inf adjacent to red-light-horse at (5,0). Both hexes are
// OPEN and adjacent (dist 1), so LOS is trivial and Light Infantry's
// all-around arc covers the target unconditionally.
const makeLightInfFireStore = (col = 4, row = 0) => {
	const units = structuredClone(TEST_UNITS) as Unit[];
	const lightInf = units.find((u) => u.id === 'blue-light-inf')!;
	lightInf.coordinates = { col, row };
	return new GameStore(units, TEST_MAP);
};

// Place blue-line-inf at (3,1) facing N. Direction toward red-light-horse(5,0)
// is dir 1 (in front arc {0,1,5}); dir 5 reaches (3,2) HILLTOP for a valid
// non-adjacent-to-enemy move endpoint.
const makeLineInfFireStore = () => {
	const units = structuredClone(TEST_UNITS) as Unit[];
	const lineInf = units.find((u) => u.id === 'blue-line-inf')!;
	lineInf.coordinates = { col: 3, row: 1 };
	lineInf.facing = HexFacing.N;
	return new GameStore(units, TEST_MAP);
};

describe('fireAt — outcomes (M7)', () => {
	it('reduces target SP by 1 on a normal hit', () => {
		expect.assertions(2);
		const store = makeLightInfFireStore();
		store.activateUnit('blue-light-inf');
		const before = store.units.find((u) => u.id === 'red-light-horse')!.strengthPoints;
		const seq = [0, 0.5];
		let i = 0;
		const result = store.fireAt('red-light-horse', () => seq[i++]);
		const after = store.units.find((u) => u.id === 'red-light-horse')!.strengthPoints;
		expect(result?.damage).toBe(1);
		expect(after).toBe(before - 1);
	});

	it('reduces target SP by 2 on a double-damage hit', () => {
		expect.assertions(2);
		const store = makeLightInfFireStore();
		store.activateUnit('blue-light-inf');
		const before = store.units.find((u) => u.id === 'red-light-horse')!.strengthPoints;
		const seq = [0, 0.1];
		let i = 0;
		const result = store.fireAt('red-light-horse', () => seq[i++]);
		const after = store.units.find((u) => u.id === 'red-light-horse')!.strengthPoints;
		expect(result?.damage).toBe(2);
		expect(after).toBe(before - 2);
	});

	it('leaves target SP unchanged on a miss', () => {
		expect.assertions(2);
		const store = makeLightInfFireStore();
		store.activateUnit('blue-light-inf');
		const before = store.units.find((u) => u.id === 'red-light-horse')!.strengthPoints;
		const result = store.fireAt('red-light-horse', () => 0.999);
		const after = store.units.find((u) => u.id === 'red-light-horse')!.strengthPoints;
		expect(result?.hit).toBe(false);
		expect(after).toBe(before);
	});

	it('sets firedThisActivation on the firer after a hit', () => {
		expect.assertions(1);
		const store = makeLightInfFireStore();
		store.activateUnit('blue-light-inf');
		store.fireAt('red-light-horse', () => 0);
		const firer = store.units.find((u) => u.id === 'blue-light-inf')!;
		expect(firer.firedThisActivation).toBe(true);
	});

	it('sets firedThisActivation on the firer after a miss', () => {
		expect.assertions(1);
		const store = makeLightInfFireStore();
		store.activateUnit('blue-light-inf');
		store.fireAt('red-light-horse', () => 0.999);
		const firer = store.units.find((u) => u.id === 'blue-light-inf')!;
		expect(firer.firedThisActivation).toBe(true);
	});

	it('clamps target SP at 0 (no negative SP)', () => {
		expect.assertions(1);
		const units = structuredClone(TEST_UNITS) as Unit[];
		const lightInf = units.find((u) => u.id === 'blue-light-inf')!;
		lightInf.coordinates = { col: 4, row: 0 };
		const lightHorse = units.find((u) => u.id === 'red-light-horse')!;
		lightHorse.strengthPoints = 1;
		const store = new GameStore(units, TEST_MAP);
		store.activateUnit('blue-light-inf');
		// RNG [0, 0.1] → double-damage hit (would be -1 without clamp)
		const seq = [0, 0.1];
		let i = 0;
		store.fireAt('red-light-horse', () => seq[i++]);
		const after = store.units.find((u) => u.id === 'red-light-horse')!;
		expect(after.strengthPoints).toBe(0);
	});
});

describe('fireAt — gating (M7)', () => {
	it('rejects when target is not in validFireTargets (no SP change, no flag)', () => {
		expect.assertions(3);
		const store = makeLightInfFireStore();
		store.activateUnit('blue-light-inf');
		// red-horse at (5,1) is dist > 2 (out of light-inf range from (4,0))
		const beforeSP = store.units.find((u) => u.id === 'red-horse')!.strengthPoints;
		const result = store.fireAt('red-horse', () => 0);
		const afterSP = store.units.find((u) => u.id === 'red-horse')!.strengthPoints;
		const firer = store.units.find((u) => u.id === 'blue-light-inf')!;
		expect(result).toBeNull();
		expect(afterSP).toBe(beforeSP);
		expect(firer.firedThisActivation).toBe(false);
	});

	it('rejects when not in ACTION step', () => {
		expect.assertions(2);
		const store = makeLightInfFireStore();
		// Not activated → still AWAITING_ACTIVATION
		const beforeSP = store.units.find((u) => u.id === 'red-light-horse')!.strengthPoints;
		const result = store.fireAt('red-light-horse', () => 0);
		const afterSP = store.units.find((u) => u.id === 'red-light-horse')!.strengthPoints;
		expect(result).toBeNull();
		expect(afterSP).toBe(beforeSP);
	});

	it('rejects when actionMode is move (MOVE_OR_FIRE unit committed to move)', () => {
		expect.assertions(2);
		const store = makeLineInfFireStore();
		begin(store, 'blue-line-inf', 'move');
		const beforeSP = store.units.find((u) => u.id === 'red-light-horse')!.strengthPoints;
		const result = store.fireAt('red-light-horse', () => 0);
		const afterSP = store.units.find((u) => u.id === 'red-light-horse')!.strengthPoints;
		expect(result).toBeNull();
		expect(afterSP).toBe(beforeSP);
	});
});

describe('validFireTargets — derived gating (M7)', () => {
	it('is empty for MOVE_OR_FIRE unit that has moved', () => {
		expect.assertions(2);
		const store = makeLineInfFireStore();
		store.activateUnit('blue-line-inf');
		expect(store.validFireTargets.length).toBeGreaterThan(0);
		// Direction 5 from (3,1) reaches (3,2) HILLTOP — front arc {0,1,5}.
		store.moveUnit({ col: 3, row: 2 });
		expect(store.validFireTargets).toHaveLength(0);
	});

	it('is empty for MOVE_OR_FIRE unit that has rotated', () => {
		expect.assertions(2);
		const store = makeLineInfFireStore();
		store.activateUnit('blue-line-inf');
		expect(store.validFireTargets.length).toBeGreaterThan(0);
		store.changeFacing(HexFacing.NE); // 1-step rotation
		expect(store.validFireTargets).toHaveLength(0);
	});

	it('is non-empty for FIRE_AND_MOVE (Light Infantry) after moving', () => {
		expect.assertions(2);
		// Light-inf at (4,0) can move to (3,0) (away from enemy adjacency) and
		// still see red-light-horse at (5,0) (dist 2, in range, LOS clear).
		const store = makeLightInfFireStore();
		store.activateUnit('blue-light-inf');
		store.moveUnit({ col: 3, row: 0 });
		const firer = store.units.find((u) => u.id === 'blue-light-inf')!;
		expect(firer.movementPointsUsed).toBe(1);
		expect(store.validFireTargets.length).toBeGreaterThan(0);
	});

	it('is empty when actionMode is move (mode-based filter)', () => {
		expect.assertions(1);
		const store = makeLineInfFireStore();
		begin(store, 'blue-line-inf', 'move');
		expect(store.validFireTargets).toHaveLength(0);
	});

	it('is empty when actionMode is rotate (mode-based filter)', () => {
		expect.assertions(1);
		const store = makeLineInfFireStore();
		begin(store, 'blue-line-inf', 'rotate');
		expect(store.validFireTargets).toHaveLength(0);
	});
});

describe('validMoveTargets — gating after firing (M7)', () => {
	it('is empty for MOVE_OR_FIRE unit after firing', () => {
		expect.assertions(2);
		const store = makeLineInfFireStore();
		store.activateUnit('blue-line-inf');
		expect(store.validMoveTargets.length).toBeGreaterThan(0);
		store.fireAt('red-light-horse', () => 0);
		expect(store.validMoveTargets).toHaveLength(0);
	});

	it('is non-empty for FIRE_AND_MOVE (Light Infantry) after firing', () => {
		expect.assertions(1);
		const store = makeLightInfFireStore();
		store.activateUnit('blue-light-inf');
		store.fireAt('red-light-horse', () => 0);
		expect(store.validMoveTargets.length).toBeGreaterThan(0);
	});
});

describe('endActivation — clears firedThisActivation (M7)', () => {
	it('clears firedThisActivation on the firer', () => {
		expect.assertions(1);
		const store = makeLightInfFireStore();
		store.activateUnit('blue-light-inf');
		store.fireAt('red-light-horse', () => 0);
		store.endActivation();
		const firer = store.units.find((u) => u.id === 'blue-light-inf')!;
		expect(firer.firedThisActivation).toBe(false);
	});
});

describe('player coverage sanity', () => {
	it('has three units for player 0', () => {
		expect.assertions(1);
		const store = makeStore();
		const blues = store.units.filter((u) => u.player === 0).map((u) => u.id);
		expect(blues).toEqual(BLUE_IDS);
	});

	it('has three units for player 1', () => {
		expect.assertions(1);
		const store = makeStore();
		const reds = store.units.filter((u) => u.player === 1).map((u) => u.id);
		expect(reds).toEqual(RED_IDS);
	});
});
