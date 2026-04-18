import { describe, expect, it } from 'vitest';
import { GameStore } from './gameStore.svelte';
import { ActivationStep } from '../core/types';
import { TEST_UNITS } from '../data/scenarios';
import { TEST_MAP } from '../data/maps';

const makeStore = () => new GameStore(structuredClone(TEST_UNITS), TEST_MAP);

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

	it('starts with all units unactivated', () => {
		expect.assertions(1);
		const store = makeStore();
		expect(store.units.every((u) => u.activated === false)).toBe(true);
	});

	it('starts with all units not moved', () => {
		expect.assertions(1);
		const store = makeStore();
		expect(store.units.every((u) => u.hasMoved === false)).toBe(true);
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
		store.completeAction();
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

describe('completeAction', () => {
	it('advances ACTION to ACTIVATION_COMPLETE', () => {
		expect.assertions(1);
		const store = makeStore();
		store.activateUnit('blue-line-inf');
		store.completeAction();
		expect(store.activationStep).toBe(ActivationStep.ACTIVATION_COMPLETE);
	});

	it('is a no-op from AWAITING_ACTIVATION', () => {
		expect.assertions(1);
		const store = makeStore();
		store.completeAction();
		expect(store.activationStep).toBe(ActivationStep.AWAITING_ACTIVATION);
	});

	it('is a no-op from ACTIVATION_COMPLETE', () => {
		expect.assertions(1);
		const store = makeStore();
		store.activateUnit('blue-line-inf');
		store.completeAction();
		store.completeAction();
		expect(store.activationStep).toBe(ActivationStep.ACTIVATION_COMPLETE);
	});
});

describe('endActivation', () => {
	it('marks the unit activated', () => {
		expect.assertions(1);
		const store = makeStore();
		store.activateUnit('blue-line-inf');
		store.completeAction();
		store.endActivation();
		const unit = store.units.find((u) => u.id === 'blue-line-inf');
		expect(unit?.activated).toBe(true);
	});

	it('clears hasMoved on the active unit', () => {
		expect.assertions(1);
		const store = makeStore();
		store.activateUnit('blue-line-inf');
		store.moveUnit({ col: 1, row: 0 });
		store.completeAction();
		store.endActivation();
		const unit = store.units.find((u) => u.id === 'blue-line-inf');
		expect(unit?.hasMoved).toBe(false);
	});

	it('clears selected on the active unit', () => {
		expect.assertions(1);
		const store = makeStore();
		store.activateUnit('blue-line-inf');
		store.completeAction();
		store.endActivation();
		const unit = store.units.find((u) => u.id === 'blue-line-inf');
		expect(unit?.selected).toBe(false);
	});

	it('clears activeUnitId', () => {
		expect.assertions(1);
		const store = makeStore();
		store.activateUnit('blue-line-inf');
		store.completeAction();
		store.endActivation();
		expect(store.activeUnitId).toBeNull();
	});

	it('returns to AWAITING_ACTIVATION', () => {
		expect.assertions(1);
		const store = makeStore();
		store.activateUnit('blue-line-inf');
		store.completeAction();
		store.endActivation();
		expect(store.activationStep).toBe(ActivationStep.AWAITING_ACTIVATION);
	});

	it('is a no-op when activationStep is ACTION', () => {
		expect.assertions(2);
		const store = makeStore();
		store.activateUnit('blue-line-inf');
		store.endActivation();
		expect(store.activationStep).toBe(ActivationStep.ACTION);
		expect(store.activeUnitId).toBe('blue-line-inf');
	});

	it('is a no-op when activationStep is AWAITING_ACTIVATION', () => {
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
		store.completeAction();
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
		store.completeAction();
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
		store.completeAction();
		store.endActivation();
		store.endPlayerTurn();
		store.activateUnit('red-horse');
		store.completeAction();
		store.endActivation();
		store.endPlayerTurn();
		expect(store.units.every((u) => u.activated === false)).toBe(true);
	});

	it('allows a previously-activated unit to activate again after rollover', () => {
		expect.assertions(1);
		const store = makeStore();
		store.activateUnit('blue-line-inf');
		store.completeAction();
		store.endActivation();
		store.endPlayerTurn();
		store.endPlayerTurn();
		store.activateUnit('blue-line-inf');
		expect(store.activeUnitId).toBe('blue-line-inf');
	});
});

describe('endPlayerTurn — guard', () => {
	it('is a no-op during ACTION', () => {
		expect.assertions(2);
		const store = makeStore();
		store.activateUnit('blue-line-inf');
		store.endPlayerTurn();
		expect(store.activePlayer).toBe(0);
		expect(store.activationStep).toBe(ActivationStep.ACTION);
	});

	it('is a no-op during ACTIVATION_COMPLETE', () => {
		expect.assertions(2);
		const store = makeStore();
		store.activateUnit('blue-line-inf');
		store.completeAction();
		store.endPlayerTurn();
		expect(store.activePlayer).toBe(0);
		expect(store.activationStep).toBe(ActivationStep.ACTIVATION_COMPLETE);
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
		const store = makeStore();
		store.activateUnit('blue-line-inf');
		store.moveUnit({ col: 1, row: 0 });
		const unit = store.units.find((u) => u.id === 'blue-line-inf');
		expect(unit?.coordinates).toEqual({ col: 1, row: 0 });
	});

	it('sets hasMoved on the active unit after a move', () => {
		expect.assertions(1);
		const store = makeStore();
		store.activateUnit('blue-line-inf');
		store.moveUnit({ col: 1, row: 0 });
		const unit = store.units.find((u) => u.id === 'blue-line-inf');
		expect(unit?.hasMoved).toBe(true);
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

	it('is a no-op in ACTIVATION_COMPLETE', () => {
		expect.assertions(1);
		const store = makeStore();
		store.activateUnit('blue-line-inf');
		store.completeAction();
		const before = store.units.find((u) => u.id === 'blue-line-inf')!.coordinates;
		store.moveUnit({ col: 4, row: 4 });
		const after = store.units.find((u) => u.id === 'blue-line-inf')!.coordinates;
		expect(after).toEqual(before);
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

	it('is a no-op in ACTIVATION_COMPLETE', () => {
		expect.assertions(1);
		const store = makeStore();
		store.activateUnit('blue-line-inf');
		store.completeAction();
		const before = store.units.find((u) => u.id === 'blue-line-inf')!.facing;
		store.changeFacing(0);
		const after = store.units.find((u) => u.id === 'blue-line-inf')!.facing;
		expect(after).toBe(before);
	});
});

describe('toggleUnit', () => {
	it('selects an active-player, non-activated unit in AWAITING_ACTIVATION', () => {
		expect.assertions(1);
		const store = makeStore();
		const blueLine = store.units.find((u) => u.id === 'blue-line-inf')!;
		store.toggleUnit(blueLine);
		const after = store.units.find((u) => u.id === 'blue-line-inf');
		expect(after?.selected).toBe(true);
	});

	it('is a no-op mid-activation', () => {
		expect.assertions(1);
		const store = makeStore();
		store.activateUnit('blue-line-inf');
		const blueLight = store.units.find((u) => u.id === 'blue-light-inf')!;
		store.toggleUnit(blueLight);
		const after = store.units.find((u) => u.id === 'blue-light-inf');
		expect(after?.selected).toBe(false);
	});

	it('is a no-op on an already-activated unit', () => {
		expect.assertions(1);
		const store = makeStore();
		store.activateUnit('blue-line-inf');
		store.completeAction();
		store.endActivation();
		const blueLine = store.units.find((u) => u.id === 'blue-line-inf')!;
		store.toggleUnit(blueLine);
		const after = store.units.find((u) => u.id === 'blue-line-inf');
		expect(after?.selected).toBe(false);
	});

	it('is a no-op on an opposing-player unit', () => {
		expect.assertions(1);
		const store = makeStore();
		const redHorse = store.units.find((u) => u.id === 'red-horse')!;
		store.toggleUnit(redHorse);
		const after = store.units.find((u) => u.id === 'red-horse');
		expect(after?.selected).toBe(false);
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
