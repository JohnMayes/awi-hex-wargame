import { describe, expect, it } from 'vitest';
import { GameStore } from './gameStore.svelte';
import { ActivationStep, TerrainType, UnitType, type Unit } from '../core/types';
import type { Leader } from '../core/command';
import type { ReinforcementGroup } from '../core/scenario';
import { getUnitDefinition } from '../core/unitDefinitions';
import type { VictoryCondition } from '../core/victory';
import { PITCHED_BATTLE, TEST_LEADERS, TEST_UNITS } from '../data/scenarios';
import { TEST_MAP, type MapDefinition } from '../data/maps';

const makeStore = () =>
	new GameStore(structuredClone(TEST_UNITS), TEST_MAP, structuredClone(TEST_LEADERS));

const select = (store: GameStore, id: string) => {
	const unit = store.units.find((u) => u.id === id);
	if (!unit) throw new Error(`Unit ${id} not found`);
	store.selectUnit(unit);
};

// Convenience: drive a unit into its ACTION step (runs the command check). The
// optional third arg is ignored — action "mode" no longer exists; kept so the
// many existing `begin(store, id, 'move'|'fire')` call sites keep compiling.
const begin = (store: GameStore, id: string, _mode?: 'move' | 'fire') => {
	store.activateUnit(id);
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

	it('starts with no pendingAction', () => {
		expect.assertions(1);
		const store = makeStore();
		expect(store.pendingAction).toBeNull();
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
		expect(store.pendingAction).toBeNull();
	});
});

// Line Infantry adjacent to enemy Artillery: line inf can BOTH fire (range 2)
// and charge it (artillery is not a cavalry type), so the fire/charge choice
// applies.
const makeLineVsArtilleryStore = () => {
	const units = structuredClone(TEST_UNITS) as Unit[];
	units.find((u) => u.id === 'blue-line-inf')!.coordinates = { col: 3, row: 1 };
	units.find((u) => u.id === 'red-artillery')!.coordinates = { col: 4, row: 1 };
	return new GameStore(units, TEST_MAP, structuredClone(TEST_LEADERS));
};

// Player 1's Horse (MOVE_ONLY, range 0) adjacent to a blue unit: can charge but
// never fire.
const makeHorseChargeStore = () => {
	const units = structuredClone(TEST_UNITS) as Unit[];
	units.find((u) => u.id === 'red-horse')!.coordinates = { col: 3, row: 1 };
	units.find((u) => u.id === 'blue-line-inf')!.coordinates = { col: 4, row: 1 };
	const store = new GameStore(units, TEST_MAP, structuredClone(TEST_LEADERS));
	store.endPlayerTurn(); // → player 1's turn
	return store;
};

describe('selectUnit — preview & re-tap', () => {
	it('previews move targets for a selected unit without activating it', () => {
		expect.assertions(3);
		const store = makeStore();
		select(store, 'blue-line-inf');
		expect(store.validMoveTargets.length).toBeGreaterThan(0);
		expect(store.activeUnitId).toBeNull();
		expect(store.units.find((u) => u.id === 'blue-line-inf')!.activated).toBe(false);
	});

	it('re-tapping a selected unit clears a pending action but keeps the selection', () => {
		expect.assertions(2);
		const store = makeStore();
		select(store, 'blue-line-inf');
		store.tapHex(store.validMoveTargets[0].coordinates);
		const fresh = store.units.find((u) => u.id === 'blue-line-inf')!;
		store.selectUnit(fresh);
		expect(store.pendingAction).toBeNull();
		expect(store.units.find((u) => u.id === 'blue-line-inf')!.selected).toBe(true);
	});

	it('re-tapping a selected unit with no pending action deselects it', () => {
		expect.assertions(1);
		const store = makeStore();
		select(store, 'blue-line-inf');
		const fresh = store.units.find((u) => u.id === 'blue-line-inf')!;
		store.selectUnit(fresh);
		expect(store.units.find((u) => u.id === 'blue-line-inf')!.selected).toBe(false);
	});
});

describe('tapHex — arm/confirm move', () => {
	it('first tap on a valid hex arms a pending move without activating', () => {
		expect.assertions(3);
		const store = makeStore();
		select(store, 'blue-line-inf');
		const target = store.validMoveTargets[0];
		store.tapHex(target.coordinates);
		expect(store.pendingAction?.kind).toBe('move');
		expect(store.activeUnitId).toBeNull();
		expect(store.units.find((u) => u.id === 'blue-line-inf')!.coordinates).toEqual({
			col: 0,
			row: 0
		});
	});

	it('second tap on the same hex confirms: activates and moves', () => {
		expect.assertions(2);
		const store = makeStore();
		select(store, 'blue-line-inf');
		const target = store.validMoveTargets[0];
		store.tapHex(target.coordinates);
		store.tapHex(target.coordinates);
		expect(store.units.find((u) => u.id === 'blue-line-inf')!.coordinates).toEqual(
			target.coordinates
		);
		expect(store.pendingAction).toBeNull();
	});

	it('tapping a different valid hex re-arms rather than confirming', () => {
		expect.assertions(1);
		const store = makeStore();
		select(store, 'blue-dragoons'); // 2 MP → plenty of distinct targets
		const targets = store.validMoveTargets;
		store.tapHex(targets[0].coordinates);
		store.tapHex(targets[1].coordinates);
		expect(store.pendingAction).toEqual({
			kind: 'move',
			coords: targets[1].coordinates,
			cost: targets[1].cost
		});
	});

	it('tapping a non-target hex clears the pending action', () => {
		expect.assertions(1);
		const store = makeStore();
		select(store, 'blue-line-inf');
		store.tapHex(store.validMoveTargets[0].coordinates);
		store.tapHex({ col: 5, row: 3 }); // far away, not a move target
		expect(store.pendingAction).toBeNull();
	});
});

describe('tapEnemy — arm/confirm fire & charge', () => {
	it('first tap arms fire (preferred over charge) without activating', () => {
		expect.assertions(2);
		const store = makeLineVsArtilleryStore();
		select(store, 'blue-line-inf');
		store.tapEnemy('red-artillery');
		expect(store.pendingAction).toEqual({ kind: 'fire', targetId: 'red-artillery' });
		expect(store.activeUnitId).toBeNull();
	});

	it('arms charge when the target is chargeable but not fireable', () => {
		expect.assertions(1);
		const store = makeHorseChargeStore();
		select(store, 'red-horse');
		store.tapEnemy('blue-line-inf');
		expect(store.pendingAction).toEqual({ kind: 'charge', targetId: 'blue-line-inf' });
	});

	it('second tap on the same enemy confirms the action', () => {
		expect.assertions(2);
		const store = makeLineVsArtilleryStore();
		select(store, 'blue-line-inf');
		store.tapEnemy('red-artillery');
		const beforeSP = store.units.find((u) => u.id === 'red-artillery')!.strengthPoints;
		store.tapEnemy('red-artillery', () => 0); // confirm fire; rng 0 → hit
		const after = store.units.find((u) => u.id === 'red-artillery');
		expect(store.pendingAction).toBeNull();
		expect(after === undefined || after.strengthPoints < beforeSP).toBe(true);
	});

	it('tapping a non-target enemy is a no-op', () => {
		expect.assertions(1);
		const store = makeStore();
		select(store, 'blue-line-inf'); // at (0,0); enemies far away
		store.tapEnemy('red-horse');
		expect(store.pendingAction).toBeNull();
	});
});

describe('setPendingCombatKind', () => {
	it('switches an armed fire to charge when the target is also chargeable', () => {
		expect.assertions(1);
		const store = makeLineVsArtilleryStore();
		select(store, 'blue-line-inf');
		store.tapEnemy('red-artillery'); // arms fire
		store.setPendingCombatKind('charge');
		expect(store.pendingAction).toEqual({ kind: 'charge', targetId: 'red-artillery' });
	});

	it('ignores a switch to a kind the target does not support', () => {
		expect.assertions(1);
		// Line Infantry can fire cavalry but cannot charge it (restricted).
		const units = structuredClone(TEST_UNITS) as Unit[];
		units.find((u) => u.id === 'blue-line-inf')!.coordinates = { col: 3, row: 1 };
		units.find((u) => u.id === 'red-light-horse')!.coordinates = { col: 4, row: 1 };
		const store = new GameStore(units, TEST_MAP, structuredClone(TEST_LEADERS));
		select(store, 'blue-line-inf');
		store.tapEnemy('red-light-horse'); // arms fire
		store.setPendingCombatKind('charge'); // not a valid charge target → ignored
		expect(store.pendingAction).toEqual({ kind: 'fire', targetId: 'red-light-horse' });
	});
});

describe('confirmAction — lazy command check', () => {
	it('rolls the command check on the first action and moves on pass', () => {
		expect.assertions(3);
		const store = makeStore(); // TEST_LEADERS → in command
		select(store, 'blue-line-inf');
		const target = store.validMoveTargets[0];
		store.tapHex(target.coordinates);
		store.confirmAction();
		expect(store.units.find((u) => u.id === 'blue-line-inf')!.coordinates).toEqual(
			target.coordinates
		);
		expect(store.lastCommandCheck?.inCommand).toBe(true);
		expect(store.pendingAction).toBeNull();
	});

	it('on a failed command check: aborts the action, burns the activation, logs the failure', () => {
		expect.assertions(4);
		const store = new GameStore(structuredClone(TEST_UNITS), TEST_MAP, []); // no leaders
		select(store, 'blue-line-inf');
		const target = store.validMoveTargets[0];
		store.tapHex(target.coordinates);
		store.confirmAction(() => 0.6); // out of command, 0.6 ≥ 0.5 → fail
		const unit = store.units.find((u) => u.id === 'blue-line-inf')!;
		expect(unit.coordinates).toEqual({ col: 0, row: 0 }); // did not move
		expect(unit.activated).toBe(true); // activation burned
		expect(store.pendingAction).toBeNull();
		// The failure is surfaced via the activation_started event (the render FX
		// layer renders it); there is no separate notice channel.
		const started = store.log.find(
			(e) => e.kind === 'activation_started' && e.unitId === 'blue-line-inf'
		);
		expect(started?.kind === 'activation_started' ? started.commandCheck.passed : true).toBe(false);
	});

	it('does not re-roll the command check on a second action in the same activation', () => {
		expect.assertions(2);
		// Light Infantry (FIRE_AND_MOVE) fires then moves; the command check must
		// run only once. No leaders → out of command, so a check object is created.
		const units = structuredClone(TEST_UNITS) as Unit[];
		units.find((u) => u.id === 'blue-light-inf')!.coordinates = { col: 3, row: 0 };
		units.find((u) => u.id === 'red-light-horse')!.coordinates = { col: 5, row: 0 };
		const store = new GameStore(units, TEST_MAP, []);
		select(store, 'blue-light-inf');
		store.tapEnemy('red-light-horse');
		store.confirmAction(() => 0); // first action rolls the check
		const firstCheck = store.lastCommandCheck;
		const moveTarget = store.validMoveTargets[0];
		expect(moveTarget).toBeDefined();
		store.tapHex(moveTarget.coordinates);
		store.confirmAction(() => 0);
		expect(store.lastCommandCheck).toBe(firstCheck); // same object → no second roll
	});
});

describe('cancelAction', () => {
	it('clears a pending action without ending the activation', () => {
		expect.assertions(2);
		const store = makeStore();
		store.activateUnit('blue-line-inf');
		store.tapHex(store.validMoveTargets[0].coordinates);
		store.cancelAction();
		expect(store.pendingAction).toBeNull();
		expect(store.activeUnitId).toBe('blue-line-inf');
	});
});

describe('auto-end activation', () => {
	it('Line Infantry auto-ends after a move (1 MP, cannot then fire)', () => {
		expect.assertions(2);
		const store = makeStore();
		store.activateUnit('blue-line-inf');
		store.tapHex(store.validMoveTargets[0].coordinates);
		store.confirmAction();
		expect(store.activeUnitId).toBeNull();
		expect(store.units.find((u) => u.id === 'blue-line-inf')!.activated).toBe(true);
	});

	it('Light Infantry does NOT auto-end after firing (can still move)', () => {
		expect.assertions(2);
		const units = structuredClone(TEST_UNITS) as Unit[];
		units.find((u) => u.id === 'blue-light-inf')!.coordinates = { col: 3, row: 0 };
		units.find((u) => u.id === 'red-light-horse')!.coordinates = { col: 5, row: 0 };
		const store = new GameStore(units, TEST_MAP, structuredClone(TEST_LEADERS));
		store.activateUnit('blue-light-inf');
		store.tapEnemy('red-light-horse');
		store.confirmAction(() => 0);
		expect(store.activeUnitId).toBe('blue-light-inf');
		expect(store.validMoveTargets.length).toBeGreaterThan(0);
	});

	it('Dragoon does NOT auto-end after moving 1 of 2 MP', () => {
		expect.assertions(2);
		const store = makeStore(); // blue-dragoons at (0,2), 2 MP
		store.activateUnit('blue-dragoons');
		const oneStep = store.validMoveTargets.find((t) => t.cost === 1)!;
		store.tapHex(oneStep.coordinates);
		store.confirmAction();
		expect(store.activeUnitId).toBe('blue-dragoons');
		expect(store.units.find((u) => u.id === 'blue-dragoons')!.movementPointsUsed).toBe(1);
	});

	it('Artillery auto-ends after firing', () => {
		expect.assertions(1);
		const units = structuredClone(TEST_UNITS) as Unit[];
		units.find((u) => u.id === 'red-artillery')!.coordinates = { col: 3, row: 0 };
		units.find((u) => u.id === 'blue-line-inf')!.coordinates = { col: 5, row: 0 };
		const store = new GameStore(units, TEST_MAP, structuredClone(TEST_LEADERS));
		store.endPlayerTurn(); // → player 1
		store.activateUnit('red-artillery');
		store.tapEnemy('blue-line-inf');
		store.confirmAction(() => 0);
		expect(store.activeUnitId).toBeNull();
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
		const store = makeStore();
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

	it('clears pendingAction', () => {
		expect.assertions(1);
		const store = makeStore();
		store.activateUnit('blue-line-inf');
		store.tapHex(store.validMoveTargets[0].coordinates);
		store.endActivation();
		expect(store.pendingAction).toBeNull();
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
		const store = makeStore();
		store.activateUnit('blue-line-inf');
		store.moveUnit({ col: 1, row: 0 });
		const unit = store.units.find((u) => u.id === 'blue-line-inf');
		expect(unit?.coordinates).toEqual({ col: 1, row: 0 });
	});

	it('increments movementPointsUsed after a move', () => {
		expect.assertions(1);
		const store = makeStore();
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
});

describe('moveUnit — validation (M5)', () => {
	it('rejects a target that is not in validMoveTargets', () => {
		expect.assertions(2);
		const store = makeStore();
		store.activateUnit('blue-line-inf');
		const before = store.units.find((u) => u.id === 'blue-line-inf')!.coordinates;
		store.moveUnit({ col: 4, row: 3 });
		const after = store.units.find((u) => u.id === 'blue-line-inf')!;
		expect(after.coordinates).toEqual(before);
		expect(after.movementPointsUsed).toBe(0);
	});

	it('rejects a move after MP is exhausted (1-MP unit)', () => {
		expect.assertions(1);
		const store = makeStore();
		store.activateUnit('blue-line-inf');
		store.moveUnit({ col: 1, row: 0 });
		// validMoveTargets is now empty (movementPointsUsed === allowance), so rejected
		store.moveUnit({ col: 0, row: 0 });
		const after = store.units.find((u) => u.id === 'blue-line-inf')!;
		expect(after.coordinates).toEqual({ col: 1, row: 0 });
	});

	it('validMoveTargets is empty in AWAITING_ACTIVATION', () => {
		expect.assertions(1);
		const store = makeStore();
		expect(store.validMoveTargets).toHaveLength(0);
	});

	it('validMoveTargets is non-empty for a freshly-activated unit', () => {
		expect.assertions(1);
		const store = makeStore();
		store.activateUnit('blue-line-inf');
		expect(store.validMoveTargets.length).toBeGreaterThan(0);
	});

	it('validMoveTargets clears after a successful move', () => {
		expect.assertions(1);
		const store = makeStore();
		store.activateUnit('blue-line-inf');
		store.moveUnit({ col: 1, row: 0 });
		expect(store.validMoveTargets).toHaveLength(0);
	});

	it('validMoveTargets is empty after endActivation', () => {
		expect.assertions(1);
		const store = makeStore();
		store.activateUnit('blue-line-inf');
		store.endActivation();
		expect(store.validMoveTargets).toHaveLength(0);
	});

	it('validMoveTargets previews for a selected (not-yet-activated) unit', () => {
		expect.assertions(2);
		const store = makeStore();
		select(store, 'blue-line-inf');
		expect(store.activeUnitId).toBeNull();
		expect(store.validMoveTargets.length).toBeGreaterThan(0);
	});
});

describe('moveUnit — difficult terrain check (M5)', () => {
	const makeHilltopStore = () => {
		const units = structuredClone(TEST_UNITS) as Unit[];
		const lineInf = units.find((u) => u.id === 'blue-line-inf')!;
		lineInf.coordinates = { col: 2, row: 2 };
		return new GameStore(units, TEST_MAP, structuredClone(TEST_LEADERS));
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
		const store = new GameStore(units, TEST_MAP, structuredClone(TEST_LEADERS));
		store.activateUnit('blue-light-inf');
		const target = store.validMoveTargets[0];
		store.moveUnit(target.coordinates, () => 0.01);
		const after = store.units.find((u) => u.id === 'blue-light-inf')!;
		expect(after.coordinates).toEqual(target.coordinates);
	});
});

describe('moveUnit — multi-step movement (M5)', () => {
	// Dragoons have movementAllowance 2. Position at (1,1) OPEN — no terrain
	// check required, all 6 neighbors on-map.
	const makeStoreForDragonMove = () => {
		const units = structuredClone(TEST_UNITS) as Unit[];
		const dragoons = units.find((u) => u.id === 'blue-dragoons')!;
		dragoons.coordinates = { col: 1, row: 1 };
		return new GameStore(units, TEST_MAP, structuredClone(TEST_LEADERS));
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

// --- M7: Firing combat ---

// Place blue-light-inf adjacent to red-light-horse at (5,0). Both hexes are
// OPEN and adjacent (dist 1), so LOS is trivial.
const makeLightInfFireStore = (col = 4, row = 0) => {
	const units = structuredClone(TEST_UNITS) as Unit[];
	const lightInf = units.find((u) => u.id === 'blue-light-inf')!;
	lightInf.coordinates = { col, row };
	return new GameStore(units, TEST_MAP, structuredClone(TEST_LEADERS));
};

// Place blue-line-inf at (3,1). It can see red-light-horse(5,0) at dist 2
// with LOS and reach (3,2) HILLTOP as a valid non-adjacent-to-enemy move
// endpoint.
const makeLineInfFireStore = () => {
	const units = structuredClone(TEST_UNITS) as Unit[];
	const lineInf = units.find((u) => u.id === 'blue-line-inf')!;
	lineInf.coordinates = { col: 3, row: 1 };
	return new GameStore(units, TEST_MAP, structuredClone(TEST_LEADERS));
};

describe('fireAt — outcomes (M7)', () => {
	it('reduces target SP by 1 on a normal hit (morale passes)', () => {
		expect.assertions(2);
		const store = makeLightInfFireStore();
		store.activateUnit('blue-light-inf');
		const before = store.units.find((u) => u.id === 'red-light-horse')!.strengthPoints;
		// seq: hit(0) + no-double(0.5) + morale-pass(0)
		const seq = [0, 0.5, 0];
		let i = 0;
		const result = store.fireAt('red-light-horse', () => seq[i++]);
		const after = store.units.find((u) => u.id === 'red-light-horse')!.strengthPoints;
		expect(result?.damage).toBe(1);
		expect(after).toBe(before - 1);
	});

	it('reduces target SP by 2 on a double-damage hit (morale passes)', () => {
		expect.assertions(2);
		const store = makeLightInfFireStore();
		store.activateUnit('blue-light-inf');
		const before = store.units.find((u) => u.id === 'red-light-horse')!.strengthPoints;
		// seq: hit(0) + double-damage(0.1) + morale-pass(0)
		const seq = [0, 0.1, 0];
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

	it('eliminates target at 0 SP (M11: removed from units array)', () => {
		expect.assertions(1);
		const units = structuredClone(TEST_UNITS) as Unit[];
		const lightInf = units.find((u) => u.id === 'blue-light-inf')!;
		lightInf.coordinates = { col: 4, row: 0 };
		const lightHorse = units.find((u) => u.id === 'red-light-horse')!;
		lightHorse.strengthPoints = 1;
		const store = new GameStore(units, TEST_MAP, structuredClone(TEST_LEADERS));
		store.activateUnit('blue-light-inf');
		// RNG [0, 0.1] → double-damage hit drops the 1-SP target to 0 → eliminated
		const seq = [0, 0.1];
		let i = 0;
		store.fireAt('red-light-horse', () => seq[i++]);
		expect(store.units.find((u) => u.id === 'red-light-horse')).toBeUndefined();
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

	it('rejects fire after the MOVE_OR_FIRE unit has moved', () => {
		expect.assertions(2);
		const store = makeLineInfFireStore();
		store.activateUnit('blue-line-inf');
		store.moveUnit({ col: 3, row: 2 });
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
		store.moveUnit({ col: 3, row: 2 });
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

	it('previews fire targets for a selected (not-yet-activated) MOVE_OR_FIRE unit', () => {
		expect.assertions(2);
		const store = makeLineInfFireStore();
		select(store, 'blue-line-inf');
		expect(store.activeUnitId).toBeNull();
		expect(store.validFireTargets.length).toBeGreaterThan(0);
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

// --- M8: Charge combat ---

// Place blue-line-inf at (3,1) and red-light-horse at (4,1) — adjacent OPEN
// hexes for clean charge resolution.
const makeChargeStore = () => {
	const units = structuredClone(TEST_UNITS) as Unit[];
	const lineInf = units.find((u) => u.id === 'blue-line-inf')!;
	lineInf.coordinates = { col: 3, row: 1 };
	const lightHorse = units.find((u) => u.id === 'red-light-horse')!;
	lightHorse.coordinates = { col: 4, row: 1 };
	return new GameStore(units, TEST_MAP, structuredClone(TEST_LEADERS));
};

describe('validChargeTargets — gating (M8)', () => {
	it('is empty in AWAITING_ACTIVATION', () => {
		expect.assertions(1);
		const store = makeChargeStore();
		expect(store.validChargeTargets).toHaveLength(0);
	});

	it('is non-empty for charge-capable adjacent enemy', () => {
		expect.assertions(1);
		const units = structuredClone(TEST_UNITS) as Unit[];
		const li = units.find((u) => u.id === 'blue-line-inf')!;
		li.coordinates = { col: 3, row: 1 };
		const art = units.find((u) => u.id === 'red-artillery')!;
		art.coordinates = { col: 4, row: 1 };
		const store = new GameStore(units, TEST_MAP, structuredClone(TEST_LEADERS));
		store.activateUnit('blue-line-inf');
		expect(store.validChargeTargets.map((u) => u.id)).toContain('red-artillery');
	});

	it('is empty for Light Infantry (non-charger)', () => {
		expect.assertions(1);
		const units = structuredClone(TEST_UNITS) as Unit[];
		const li = units.find((u) => u.id === 'blue-light-inf')!;
		li.coordinates = { col: 3, row: 1 };
		const lh = units.find((u) => u.id === 'red-light-horse')!;
		lh.coordinates = { col: 4, row: 1 };
		const store = new GameStore(units, TEST_MAP, structuredClone(TEST_LEADERS));
		store.activateUnit('blue-light-inf');
		expect(store.validChargeTargets).toEqual([]);
	});

	it('excludes Cavalry defenders for Line Infantry charger (rules §3.1)', () => {
		expect.assertions(1);
		const store = makeChargeStore();
		store.activateUnit('blue-line-inf');
		// red-light-horse is Cavalry — Line Infantry cannot charge it
		expect(store.validChargeTargets.map((u) => u.id)).not.toContain('red-light-horse');
	});
});

describe('chargeAt — gating (M8)', () => {
	it('rejects when target is not in validChargeTargets', () => {
		expect.assertions(1);
		const store = makeChargeStore();
		store.activateUnit('blue-line-inf');
		// red-light-horse is Cavalry; Line Infantry cannot charge it
		const r = store.chargeAt('red-light-horse', () => 0);
		expect(r).toBeNull();
	});

	it('rejects when not in ACTION step', () => {
		expect.assertions(1);
		const store = makeChargeStore();
		const r = store.chargeAt('red-light-horse', () => 0);
		expect(r).toBeNull();
	});
});

describe('chargeAt — outcomes (M8)', () => {
	// Setup: place blue-dragoons at (3,1) adjacent to red-artillery at (4,1)
	// (Artillery is a chargeable defender, not Cavalry-restricted).
	const makeStoreAttacksArt = () => {
		const units = structuredClone(TEST_UNITS) as Unit[];
		const dragoons = units.find((u) => u.id === 'blue-dragoons')!;
		dragoons.coordinates = { col: 3, row: 1 };
		const art = units.find((u) => u.id === 'red-artillery')!;
		art.coordinates = { col: 4, row: 1 };
		return new GameStore(units, TEST_MAP, structuredClone(TEST_LEADERS));
	};

	it('Dragoons (cavalry) bounces to origin on a winning non-eliminating charge', () => {
		expect.assertions(3);
		const store = makeStoreAttacksArt();
		store.activateUnit('blue-dragoons');
		// Force delta = 1: rng [0.2, 0] → attacker=2+4=6, defender=1+4=5, delta=1
		const r = store.chargeAt('red-artillery', seqRngFactory([0.2, 0]));
		expect(r?.outcome).toBe('defender_retreats');
		const dragoons = store.units.find((u) => u.id === 'blue-dragoons')!;
		expect(dragoons.coordinates).toEqual({ col: 3, row: 1 }); // bounced back
		const art = store.units.find((u) => u.id === 'red-artillery')!;
		expect(art.coordinates).not.toEqual({ col: 4, row: 1 }); // retreated
	});

	it('Dragoons advances when defender is eliminated', () => {
		expect.assertions(2);
		const store = makeStoreAttacksArt();
		const art = store.units.find((u) => u.id === 'red-artillery')!;
		// Pre-damage Artillery to 1 SP so a 2-hit result eliminates it
		store.units = store.units.map((u) =>
			u.id === 'red-artillery' ? { ...u, strengthPoints: 1 } : u
		);
		void art;
		store.activateUnit('blue-dragoons');
		// delta >= 3: attacker roll 5 (rng 4/6), defender roll 1 → (5+4) - (1+1) = 7
		const r = store.chargeAt('red-artillery', seqRngFactory([4 / 6, 0]));
		expect(r?.outcome).toBe('defender_eliminated');
		const dragoons = store.units.find((u) => u.id === 'blue-dragoons')!;
		expect(dragoons.coordinates).toEqual({ col: 4, row: 1 }); // advanced
	});

	it('eliminated defender is removed from units array', () => {
		expect.assertions(1);
		const store = makeStoreAttacksArt();
		store.units = store.units.map((u) =>
			u.id === 'red-artillery' ? { ...u, strengthPoints: 1 } : u
		);
		store.activateUnit('blue-dragoons');
		store.chargeAt('red-artillery', seqRngFactory([4 / 6, 0]));
		expect(store.units.find((u) => u.id === 'red-artillery')).toBeUndefined();
	});

	it('failed charge bounces attacker back to origin with 1 hit', () => {
		expect.assertions(3);
		const store = makeStoreAttacksArt();
		store.activateUnit('blue-dragoons');
		const before = store.units.find((u) => u.id === 'blue-dragoons')!.strengthPoints;
		// delta=0: both roll 1 → equal scores (4+4 vs 1+4 = … wait Dragoons charge bonus is 0)
		// attacker score = 1+4+0 = 5, defender (Artillery SP=4) score = 1+4 = 5, delta=0 → repulse
		const r = store.chargeAt('red-artillery', seqRngFactory([0, 0]));
		expect(r?.outcome).toBe('attacker_repulsed');
		const dragoons = store.units.find((u) => u.id === 'blue-dragoons')!;
		expect(dragoons.coordinates).toEqual({ col: 3, row: 1 });
		expect(dragoons.strengthPoints).toBe(before - 1);
	});

	it('chargeAt ends the activation', () => {
		expect.assertions(3);
		const store = makeStoreAttacksArt();
		store.activateUnit('blue-dragoons');
		store.chargeAt('red-artillery', seqRngFactory([0, 0]));
		expect(store.activationStep).toBe(ActivationStep.AWAITING_ACTIVATION);
		expect(store.activeUnitId).toBeNull();
		const dragoons = store.units.find((u) => u.id === 'blue-dragoons')!;
		expect(dragoons.activated).toBe(true);
	});
});

describe('chargeAt — Line Infantry advances on win (M8)', () => {
	it('Line Infantry charging Artillery advances on a winning charge', () => {
		expect.assertions(2);
		const units = structuredClone(TEST_UNITS) as Unit[];
		const li = units.find((u) => u.id === 'blue-line-inf')!;
		li.coordinates = { col: 3, row: 1 };
		const art = units.find((u) => u.id === 'red-artillery')!;
		art.coordinates = { col: 4, row: 1 };
		const store = new GameStore(units, TEST_MAP, structuredClone(TEST_LEADERS));
		store.activateUnit('blue-line-inf');
		// delta=1 → defender_retreats; Line Infantry is non-cavalry → advances
		const r = store.chargeAt('red-artillery', seqRngFactory([0.2, 0]));
		expect(r?.outcome).toBe('defender_retreats');
		const lineInf = store.units.find((u) => u.id === 'blue-line-inf')!;
		expect(lineInf.coordinates).toEqual({ col: 4, row: 1 });
	});
});

function seqRngFactory(values: number[]) {
	let i = 0;
	return () => values[i++];
}

// eliminate_units is a cumulative kill tally fed by real combat, so victory tests
// must eliminate units through fire/charge rather than zeroing SP. This builds a
// store where blue-dragoons can destroy a 1-SP red-artillery in a single charge.
const breakCond = (count: number): VictoryCondition => ({
	kind: 'eliminate_units',
	id: 'blue-break-enemy',
	player: 0,
	description: `Eliminate ${count} enemy units`,
	count
});

function killSetup(victoryConditions: VictoryCondition[], turnLimit: number | null = 15) {
	const units = structuredClone(TEST_UNITS) as Unit[];
	units.find((u) => u.id === 'blue-dragoons')!.coordinates = { col: 3, row: 1 };
	const art = units.find((u) => u.id === 'red-artillery')!;
	art.coordinates = { col: 4, row: 1 };
	art.strengthPoints = 1;
	return new GameStore(units, TEST_MAP, structuredClone(TEST_LEADERS), {
		turnLimit,
		victoryConditions
	});
}

function killRedArtillery(store: GameStore) {
	store.activateUnit('blue-dragoons');
	store.chargeAt('red-artillery', seqRngFactory([4 / 6, 0])); // delta ≥ 3 → defender_eliminated
}

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

// --- M9: Morale integration ---

describe('fireAt — morale integration (M9)', () => {
	it('miss → result.morale is null and target unchanged', () => {
		expect.assertions(2);
		const store = makeLightInfFireStore();
		store.activateUnit('blue-light-inf');
		const before = store.units.find((u) => u.id === 'red-light-horse')!;
		const result = store.fireAt('red-light-horse', () => 0.999);
		const after = store.units.find((u) => u.id === 'red-light-horse')!;
		expect(result?.morale).toBeNull();
		expect(after.strengthPoints).toBe(before.strengthPoints);
	});

	it('1 damage + morale pass → SP -1, coords unchanged', () => {
		expect.assertions(3);
		const store = makeLightInfFireStore();
		store.activateUnit('blue-light-inf');
		const before = store.units.find((u) => u.id === 'red-light-horse')!;
		// hit(0) + no-double(0.5) + morale-pass(0): basePass = 3/4 = 0.75
		const result = store.fireAt('red-light-horse', seqRngFactory([0, 0.5, 0]));
		const after = store.units.find((u) => u.id === 'red-light-horse')!;
		expect(result?.morale?.passed).toBe(true);
		expect(after.strengthPoints).toBe(before.strengthPoints - 1);
		expect(after.coordinates).toEqual(before.coordinates);
	});

	it('1 damage + morale fail with retreat → SP -2 and coords = retreat hex', () => {
		expect.assertions(3);
		const store = makeLightInfFireStore();
		store.activateUnit('blue-light-inf');
		const before = store.units.find((u) => u.id === 'red-light-horse')!;
		// hit(0) + no-double(0.5) + morale-fail(0.99): basePass 0.75, roll 0.99 fails
		const result = store.fireAt('red-light-horse', seqRngFactory([0, 0.5, 0.99]));
		const after = store.units.find((u) => u.id === 'red-light-horse')!;
		expect(result?.morale?.passed).toBe(false);
		expect(after.strengthPoints).toBe(before.strengthPoints - 2);
		expect(after.coordinates).not.toEqual(before.coordinates);
	});

	it('damage that eliminates → result.morale is null, no extra hit, target removed (M11)', () => {
		expect.assertions(2);
		const units = structuredClone(TEST_UNITS) as Unit[];
		const lightInf = units.find((u) => u.id === 'blue-light-inf')!;
		lightInf.coordinates = { col: 4, row: 0 };
		const lightHorse = units.find((u) => u.id === 'red-light-horse')!;
		lightHorse.strengthPoints = 2;
		const store = new GameStore(units, TEST_MAP, structuredClone(TEST_LEADERS));
		store.activateUnit('blue-light-inf');
		// hit(0) + double(0.1): damage 2 → postHitSP = 0 → eliminated
		const result = store.fireAt('red-light-horse', seqRngFactory([0, 0.1]));
		expect(result?.morale).toBeNull();
		expect(store.units.find((u) => u.id === 'red-light-horse')).toBeUndefined();
	});

	it('no cascade: only 3 rng draws consumed for hit+morale-fail', () => {
		expect.assertions(2);
		const store = makeLightInfFireStore();
		store.activateUnit('blue-light-inf');
		// hit(0) + no-double(0.5) + morale-fail(0.99)
		// A 4th draw would be required if morale's extra hit triggered another check;
		// the rng array has only 3 entries — a cascade would consume undefined.
		const draws: number[] = [];
		const seq = [0, 0.5, 0.99];
		let i = 0;
		const rng = () => {
			const v = seq[i++];
			draws.push(v);
			return v;
		};
		const result = store.fireAt('red-light-horse', rng);
		expect(draws).toHaveLength(3);
		expect(result?.morale?.passed).toBe(false);
	});
});

describe('chargeAt — morale integration (M9)', () => {
	const makeStoreAttacksArt = () => {
		const units = structuredClone(TEST_UNITS) as Unit[];
		const dragoons = units.find((u) => u.id === 'blue-dragoons')!;
		dragoons.coordinates = { col: 3, row: 1 };
		const art = units.find((u) => u.id === 'red-artillery')!;
		art.coordinates = { col: 4, row: 1 };
		return new GameStore(units, TEST_MAP, structuredClone(TEST_LEADERS));
	};

	it('attacker_repulsed → result.morale is null', () => {
		expect.assertions(2);
		const store = makeStoreAttacksArt();
		store.activateUnit('blue-dragoons');
		// rng [0, 0] → both roll 1 → attacker 1+4=5, defender 1+4=5, delta=0 → repulsed
		const r = store.chargeAt('red-artillery', seqRngFactory([0, 0]));
		expect(r?.outcome).toBe('attacker_repulsed');
		expect(r?.morale).toBeNull();
	});

	it('defender_eliminated → result.morale is null', () => {
		expect.assertions(2);
		const store = makeStoreAttacksArt();
		store.units = store.units.map((u) =>
			u.id === 'red-artillery' ? { ...u, strengthPoints: 1 } : u
		);
		store.activateUnit('blue-dragoons');
		// delta >= 3 → 2 hits eliminates SP-1 artillery
		const r = store.chargeAt('red-artillery', seqRngFactory([4 / 6, 0]));
		expect(r?.outcome).toBe('defender_eliminated');
		expect(r?.morale).toBeNull();
	});

	it('defender_retreats with morale fail → defender coords overridden by morale retreat', () => {
		expect.assertions(3);
		const store = makeStoreAttacksArt();
		store.activateUnit('blue-dragoons');
		// rng [0.2, 0]: attacker 2+4=6, defender 1+4=5, delta=1 → defender_retreats (1 hit)
		// Defender at (4,1) post-charge retreats east to (5,1).
		// Morale roll (3rd draw) = 0.99: basePass 3/4=0.75, fails.
		// Attacker post-resolution: Dragoons (cavalry) bounces back to (3,1).
		// Morale-induced retreat from (5,1) away from (3,1) → likely off-grid/impassable → no retreat hex.
		const r = store.chargeAt('red-artillery', seqRngFactory([0.2, 0, 0.99]));
		const art = store.units.find((u) => u.id === 'red-artillery')!;
		expect(r?.outcome).toBe('defender_retreats');
		expect(r?.morale?.passed).toBe(false);
		// Charge dealt 1 hit, morale adds 1 → SP went 4 → 2
		expect(art.strengthPoints).toBe(2);
	});

	it('defender_retreats with morale pass → defender stops at charge retreat hex, SP -charge dmg only', () => {
		expect.assertions(3);
		const store = makeStoreAttacksArt();
		store.activateUnit('blue-dragoons');
		// rng [0.2, 0, 0]: charge as above, morale roll 0 vs basePass 0.75 → passes
		const r = store.chargeAt('red-artillery', seqRngFactory([0.2, 0, 0]));
		const art = store.units.find((u) => u.id === 'red-artillery')!;
		expect(r?.outcome).toBe('defender_retreats');
		expect(r?.morale?.passed).toBe(true);
		expect(art.strengthPoints).toBe(3); // 4 - 1 charge hit, no morale bonus
	});
});

// --- M10: Command & Control ---

describe('#activate — command check (M10)', () => {
	// Construct a store with NO leaders, forcing every unit to be out of command.
	const makeNoLeadersStore = () => new GameStore(structuredClone(TEST_UNITS), TEST_MAP, []);

	it('in command (covered by TEST_LEADERS) → transitions to ACTION normally', () => {
		expect.assertions(2);
		const store = makeStore();
		store.activateUnit('blue-line-inf');
		expect(store.activationStep).toBe(ActivationStep.ACTION);
		expect(store.lastCommandCheck?.inCommand).toBe(true);
	});

	it('out of command, check passes → transitions to ACTION', () => {
		expect.assertions(3);
		const store = makeNoLeadersStore();
		// rng 0 < 0.5 → passes
		store.activateUnit('blue-line-inf', () => 0);
		expect(store.activationStep).toBe(ActivationStep.ACTION);
		expect(store.lastCommandCheck?.inCommand).toBe(false);
		expect(store.lastCommandCheck?.passed).toBe(true);
	});

	it('out of command, check fails → activation immediately finishes; unit activated', () => {
		expect.assertions(4);
		const store = makeNoLeadersStore();
		// rng 0.6 >= 0.5 → fails
		store.activateUnit('blue-line-inf', () => 0.6);
		expect(store.activeUnitId).toBeNull();
		expect(store.activationStep).toBe(ActivationStep.AWAITING_ACTIVATION);
		const unit = store.units.find((u) => u.id === 'blue-line-inf')!;
		expect(unit.activated).toBe(true);
		expect(store.lastCommandCheck?.passed).toBe(false);
	});

	it('unit activated by failed command check cannot be activated again same turn', () => {
		expect.assertions(1);
		const store = makeNoLeadersStore();
		store.activateUnit('blue-line-inf', () => 0.6);
		store.activateUnit('blue-line-inf', () => 0); // second attempt: rng 0 would pass
		expect(store.activeUnitId).toBeNull();
	});

	it('game turn rollover clears activated flag from failed command check', () => {
		expect.assertions(1);
		const store = makeNoLeadersStore();
		store.activateUnit('blue-line-inf', () => 0.6);
		store.endPlayerTurn(); // → player 1
		store.endPlayerTurn(); // → player 0, new turn, clears flags
		const unit = store.units.find((u) => u.id === 'blue-line-inf')!;
		expect(unit.activated).toBe(false);
	});

	it('far-out-of-command (>2×R) penalty: -0.15 applied', () => {
		expect.assertions(2);
		const units = structuredClone(TEST_UNITS) as Unit[];
		const lineInf = units.find((u) => u.id === 'blue-line-inf')!;
		lineInf.coordinates = { col: 0, row: 0 };
		const lightInf = units.find((u) => u.id === 'blue-light-inf')!;
		lightInf.coordinates = { col: 5, row: 3 }; // distance > 2×1 from line-inf
		const leaders: Leader[] = [{ id: 'L', attachedToUnitId: 'blue-line-inf', commandRadius: 1 }];
		const store = new GameStore(units, TEST_MAP, leaders);
		store.activateUnit('blue-light-inf', () => 0);
		expect(store.lastCommandCheck?.farPenalty).toBeCloseTo(-0.15);
		expect(store.lastCommandCheck?.finalPassChance).toBeCloseTo(0.35);
	});
});

describe('fireAt — leader casualty + outOfCommand (M10)', () => {
	it('attacks target with no attached leader → leaderCasualty null, no extra rng draw', () => {
		expect.assertions(2);
		// blue-light-inf at (4,0) fires at red-light-horse at (5,0). Red leader is on
		// red-horse, so red-light-horse has no attached leader.
		const store = makeLightInfFireStore();
		store.activateUnit('blue-light-inf');
		// rng draws: hit, double, morale (no casualty draw)
		const result = store.fireAt('red-light-horse', seqRngFactory([0, 0.5, 0]));
		expect(result?.leaderCasualty).toBeNull();
		expect(result?.morale?.passed).toBe(true);
	});

	it('attacks target with attached leader, casualty roll passes → leader killed and replaced', () => {
		expect.assertions(4);
		// Move blue-light-inf adjacent to red-horse (the leader's host).
		const units = structuredClone(TEST_UNITS) as Unit[];
		const lightInf = units.find((u) => u.id === 'blue-light-inf')!;
		lightInf.coordinates = { col: 4, row: 1 };
		const horse = units.find((u) => u.id === 'red-horse')!;
		horse.coordinates = { col: 5, row: 1 };
		const store = new GameStore(units, TEST_MAP, structuredClone(TEST_LEADERS));
		store.activateUnit('blue-light-inf');
		// rng draws: hit(0) + no-double(0.5) + casualty(0.05<0.15 → kill) + morale(0 → pass)
		const result = store.fireAt('red-horse', seqRngFactory([0, 0.5, 0.05, 0]));
		expect(result?.leaderCasualty?.casualty).toBe(true);
		expect(result?.leaderCasualty?.leaderId).toBe('red-leader-1');
		// Replacement attached to nearest leaderless friendly unit: artillery or light-horse
		expect(result?.leaderCasualty?.replacementLeaderId).toBe('red-leader-1-r1');
		// Original removed from leaders state
		expect(store.leaders.find((l) => l.id === 'red-leader-1')).toBeUndefined();
	});

	it('attacks target with attached leader, casualty roll fails → leaders unchanged', () => {
		expect.assertions(2);
		const units = structuredClone(TEST_UNITS) as Unit[];
		const lightInf = units.find((u) => u.id === 'blue-light-inf')!;
		lightInf.coordinates = { col: 4, row: 1 };
		const horse = units.find((u) => u.id === 'red-horse')!;
		horse.coordinates = { col: 5, row: 1 };
		const store = new GameStore(units, TEST_MAP, structuredClone(TEST_LEADERS));
		store.activateUnit('blue-light-inf');
		// casualty roll 0.5 ≥ 0.15 → survives
		const result = store.fireAt('red-horse', seqRngFactory([0, 0.5, 0.5, 0]));
		expect(result?.leaderCasualty?.casualty).toBe(false);
		expect(store.leaders.find((l) => l.id === 'red-leader-1')).toBeDefined();
	});

	it('fire eliminating the target → no leader casualty, no morale, no extra rng draws', () => {
		expect.assertions(4);
		const units = structuredClone(TEST_UNITS) as Unit[];
		const lightInf = units.find((u) => u.id === 'blue-light-inf')!;
		lightInf.coordinates = { col: 4, row: 1 };
		const horse = units.find((u) => u.id === 'red-horse')!;
		horse.coordinates = { col: 5, row: 1 };
		horse.strengthPoints = 2;
		const store = new GameStore(units, TEST_MAP, structuredClone(TEST_LEADERS));
		store.activateUnit('blue-light-inf');
		// hit(0) + double(0.1) → 2 damage = lethal. Only 2 rng draws should be consumed.
		const result = store.fireAt('red-horse', seqRngFactory([0, 0.1]));
		expect(result?.leaderCasualty).toBeNull();
		expect(result?.morale).toBeNull();
		// M11: target eliminated AND its attached leader removed without replacement.
		expect(store.units.find((u) => u.id === 'red-horse')).toBeUndefined();
		expect(store.leaders.find((l) => l.id === 'red-leader-1')).toBeUndefined();
	});

	it('out-of-command target propagates outOfCommand into morale modifiers', () => {
		expect.assertions(1);
		// red-light-horse with NO friendly leaders → out of command.
		const units = structuredClone(TEST_UNITS) as Unit[];
		const lightInf = units.find((u) => u.id === 'blue-light-inf')!;
		lightInf.coordinates = { col: 4, row: 0 };
		const store = new GameStore(units, TEST_MAP, []);
		// activate via rng pass to skip command check failure
		store.activateUnit('blue-light-inf', () => 0);
		// hit(0) + no-double(0.5) + morale(0.5)
		const result = store.fireAt('red-light-horse', seqRngFactory([0, 0.5, 0.5]));
		expect(result?.morale?.outOfCommandModifier).toBeCloseTo(-0.15);
	});
});

describe('chargeAt — leader casualty + orphan cleanup (M10)', () => {
	it('charge against target with leader, casualty rolled → leader replaced atomically', () => {
		expect.assertions(2);
		const units = structuredClone(TEST_UNITS) as Unit[];
		const dragoons = units.find((u) => u.id === 'blue-dragoons')!;
		dragoons.coordinates = { col: 4, row: 1 };
		const horse = units.find((u) => u.id === 'red-horse')!;
		horse.coordinates = { col: 5, row: 1 };
		const store = new GameStore(units, TEST_MAP, structuredClone(TEST_LEADERS));
		store.activateUnit('blue-dragoons');
		// rng: attackerRoll(0.2 → 2), defenderRoll(0 → 1) → delta = (2+4) - (1+4) = 1 → defender_retreats
		// then defenderCasualty(0.05 → kill), then morale(0 → pass)
		const r = store.chargeAt('red-horse', seqRngFactory([0.2, 0, 0.05, 0]));
		expect(r?.defenderLeaderCasualty?.casualty).toBe(true);
		expect(store.leaders.find((l) => l.id === 'red-leader-1')).toBeUndefined();
	});

	it('charge eliminating a unit with attached leader → leader removed without replacement (orphan cleanup)', () => {
		expect.assertions(2);
		const units = structuredClone(TEST_UNITS) as Unit[];
		const dragoons = units.find((u) => u.id === 'blue-dragoons')!;
		dragoons.coordinates = { col: 4, row: 1 };
		const horse = units.find((u) => u.id === 'red-horse')!;
		horse.coordinates = { col: 5, row: 1 };
		horse.strengthPoints = 1;
		const store = new GameStore(units, TEST_MAP, structuredClone(TEST_LEADERS));
		store.activateUnit('blue-dragoons');
		// rng: attackerRoll(4/6 → 5), defenderRoll(0 → 1) → delta ≥ 3 → 2 hits, defender eliminated
		// No casualty roll (defender at 0 SP). No morale (eliminated).
		const r = store.chargeAt('red-horse', seqRngFactory([4 / 6, 0]));
		expect(r?.outcome).toBe('defender_eliminated');
		// red-leader-1 was attached to red-horse; with red-horse eliminated, the leader is dropped
		// (no replacement per §10 — distinct from casualty replacement).
		expect(store.leaders.find((l) => l.id === 'red-leader-1')).toBeUndefined();
	});

	it('attacker_repulsed against attacker with leader → attacker casualty rolled', () => {
		expect.assertions(2);
		// Attach blue leader to blue-dragoons specifically.
		const units = structuredClone(TEST_UNITS) as Unit[];
		const dragoons = units.find((u) => u.id === 'blue-dragoons')!;
		dragoons.coordinates = { col: 4, row: 1 };
		const art = units.find((u) => u.id === 'red-artillery')!;
		art.coordinates = { col: 5, row: 1 };
		const leaders: Leader[] = [
			{ id: 'blue-leader-1', attachedToUnitId: 'blue-dragoons', commandRadius: 10 },
			{ id: 'red-leader-1', attachedToUnitId: 'red-horse', commandRadius: 10 }
		];
		const store = new GameStore(units, TEST_MAP, leaders);
		store.activateUnit('blue-dragoons');
		// rng: attackerRoll(0 → 1), defenderRoll(0 → 1) → delta=0 → attacker_repulsed (attacker takes 1 hit)
		// attackerCasualty(0.05 → kill blue-leader-1). No defender casualty, no morale.
		const r = store.chargeAt('red-artillery', seqRngFactory([0, 0, 0.05]));
		expect(r?.outcome).toBe('attacker_repulsed');
		expect(r?.attackerLeaderCasualty?.casualty).toBe(true);
	});
});

// --- M11: Elimination & Retreat ---

describe('fireAt — elimination (M11)', () => {
	it('non-lethal hit → empty eliminatedUnitIds / eliminatedLeaderIds', () => {
		expect.assertions(2);
		const store = makeLightInfFireStore();
		store.activateUnit('blue-light-inf');
		// hit + no-double + casualty-skip (no leader on target) + morale-pass
		const result = store.fireAt('red-light-horse', seqRngFactory([0, 0.5, 0]));
		expect(result?.eliminatedUnitIds).toEqual([]);
		expect(result?.eliminatedLeaderIds).toEqual([]);
	});

	it('morale-fail brings target SP to 0 → target eliminated and surfaced', () => {
		expect.assertions(3);
		const units = structuredClone(TEST_UNITS) as Unit[];
		const lightInf = units.find((u) => u.id === 'blue-light-inf')!;
		lightInf.coordinates = { col: 4, row: 0 };
		const lightHorse = units.find((u) => u.id === 'red-light-horse')!;
		lightHorse.strengthPoints = 1;
		const store = new GameStore(units, TEST_MAP, structuredClone(TEST_LEADERS));
		store.activateUnit('blue-light-inf');
		// hit(0) + no-double(0.5) drops SP to 0 → eliminated; morale and casualty skipped.
		const result = store.fireAt('red-light-horse', seqRngFactory([0, 0.5]));
		expect(result?.eliminatedUnitIds).toEqual(['red-light-horse']);
		expect(result?.eliminatedLeaderIds).toEqual([]);
		expect(store.units.find((u) => u.id === 'red-light-horse')).toBeUndefined();
	});

	it('lethal double-damage on low-SP target → eliminated, morale skipped, ids surfaced', () => {
		expect.assertions(3);
		const units = structuredClone(TEST_UNITS) as Unit[];
		const lightInf = units.find((u) => u.id === 'blue-light-inf')!;
		lightInf.coordinates = { col: 4, row: 0 };
		const lightHorse = units.find((u) => u.id === 'red-light-horse')!;
		lightHorse.strengthPoints = 2;
		const store = new GameStore(units, TEST_MAP, structuredClone(TEST_LEADERS));
		store.activateUnit('blue-light-inf');
		// hit(0) + double(0.1) → 2 damage, SP 0 → eliminated
		const result = store.fireAt('red-light-horse', seqRngFactory([0, 0.1]));
		expect(result?.morale).toBeNull();
		expect(result?.eliminatedUnitIds).toEqual(['red-light-horse']);
		expect(store.units.find((u) => u.id === 'red-light-horse')).toBeUndefined();
	});

	it('eliminates a unit with attached leader → leader removed without replacement (§10)', () => {
		expect.assertions(4);
		const units = structuredClone(TEST_UNITS) as Unit[];
		const lightInf = units.find((u) => u.id === 'blue-light-inf')!;
		lightInf.coordinates = { col: 4, row: 1 };
		const horse = units.find((u) => u.id === 'red-horse')!;
		horse.coordinates = { col: 5, row: 1 };
		horse.strengthPoints = 2;
		const store = new GameStore(units, TEST_MAP, structuredClone(TEST_LEADERS));
		store.activateUnit('blue-light-inf');
		// hit(0) + double(0.1) → 2 damage, SP 0 → red-horse eliminated; §8.3 casualty skipped.
		const result = store.fireAt('red-horse', seqRngFactory([0, 0.1]));
		expect(result?.leaderCasualty).toBeNull(); // no §8.3 roll; §10 cleanup instead
		expect(result?.eliminatedUnitIds).toEqual(['red-horse']);
		expect(result?.eliminatedLeaderIds).toEqual(['red-leader-1']);
		expect(store.leaders.find((l) => l.id === 'red-leader-1')).toBeUndefined();
	});
});

describe('chargeAt — elimination (M11)', () => {
	it('defender_eliminated outcome → eliminatedUnitIds includes defender; leader included if any', () => {
		expect.assertions(2);
		const units = structuredClone(TEST_UNITS) as Unit[];
		const dragoons = units.find((u) => u.id === 'blue-dragoons')!;
		dragoons.coordinates = { col: 4, row: 1 };
		const horse = units.find((u) => u.id === 'red-horse')!;
		horse.coordinates = { col: 5, row: 1 };
		horse.strengthPoints = 1;
		const store = new GameStore(units, TEST_MAP, structuredClone(TEST_LEADERS));
		store.activateUnit('blue-dragoons');
		// delta ≥ 3 → 2 hits eliminate the 1-SP defender; no casualty/morale rolls.
		const r = store.chargeAt('red-horse', seqRngFactory([4 / 6, 0]));
		expect(r?.eliminatedUnitIds).toEqual(['red-horse']);
		expect(r?.eliminatedLeaderIds).toEqual(['red-leader-1']);
	});

	it('attacker_repulsed at SP 1 with attached leader → attacker + leader eliminated, no replacement', () => {
		expect.assertions(4);
		const units = structuredClone(TEST_UNITS) as Unit[];
		const dragoons = units.find((u) => u.id === 'blue-dragoons')!;
		dragoons.coordinates = { col: 4, row: 1 };
		dragoons.strengthPoints = 1;
		const art = units.find((u) => u.id === 'red-artillery')!;
		art.coordinates = { col: 5, row: 1 };
		const leaders: Leader[] = [
			{ id: 'blue-leader-1', attachedToUnitId: 'blue-dragoons', commandRadius: 10 },
			{ id: 'red-leader-1', attachedToUnitId: 'red-horse', commandRadius: 10 }
		];
		const store = new GameStore(units, TEST_MAP, leaders);
		store.activateUnit('blue-dragoons');
		// delta=0 → attacker_repulsed; attacker takes 1 SP (already at 1) → eliminated.
		// rng: attackerRoll(0 → 1), defenderRoll(0 → 1) → delta = (1+1) - (1+4) < 0 → repulsed.
		// No casualty roll on attacker (post-hit SP = 0 → skipped by gameStore guard).
		const r = store.chargeAt('red-artillery', seqRngFactory([0, 0]));
		expect(r?.outcome).toBe('attacker_repulsed');
		expect(r?.eliminatedUnitIds).toEqual(['blue-dragoons']);
		expect(r?.eliminatedLeaderIds).toEqual(['blue-leader-1']);
		// §10 leader cleanup: no replacement.
		expect(store.leaders.find((l) => l.id === 'blue-leader-1')).toBeUndefined();
	});
});

// --- Game log ---

describe('log — event emission', () => {
	it('fresh GameStore has empty log', () => {
		expect.assertions(1);
		const store = makeStore();
		expect(store.log).toEqual([]);
	});

	it('activateUnit (in-command) emits one activation_started with passed:true', () => {
		expect.assertions(4);
		const store = makeStore();
		store.activateUnit('blue-line-inf');
		expect(store.log).toHaveLength(1);
		const ev = store.log[0];
		expect(ev.kind).toBe('activation_started');
		if (ev.kind !== 'activation_started') throw new Error();
		expect(ev.unitId).toBe('blue-line-inf');
		expect(ev.commandCheck.passed).toBe(true);
	});

	it('activateUnit out-of-command, fails → activation_started + activation_ended in order', () => {
		expect.assertions(4);
		const store = new GameStore(structuredClone(TEST_UNITS), TEST_MAP, []);
		store.activateUnit('blue-line-inf', () => 0.6); // out of command + fail
		expect(store.log).toHaveLength(2);
		expect(store.log[0].kind).toBe('activation_started');
		expect(store.log[1].kind).toBe('activation_ended');
		if (store.log[0].kind !== 'activation_started') throw new Error();
		expect(store.log[0].commandCheck.passed).toBe(false);
	});

	it('successful moveUnit emits one move_action with moved:true and from/to/cost', () => {
		expect.assertions(5);
		const store = makeStore();
		store.activateUnit('blue-line-inf');
		store.clearLog();
		store.moveUnit({ col: 1, row: 0 });
		expect(store.log).toHaveLength(1);
		const ev = store.log[0];
		expect(ev.kind).toBe('move_action');
		if (ev.kind !== 'move_action') throw new Error();
		expect(ev.result.moved).toBe(true);
		expect(ev.result.to).toEqual({ col: 1, row: 0 });
		expect(ev.result.difficultTerrainCheck).toBeNull();
	});

	it('multi-step Dragoon move emits two move_action events in order', () => {
		expect.assertions(3);
		const units = structuredClone(TEST_UNITS) as Unit[];
		const dragoons = units.find((u) => u.id === 'blue-dragoons')!;
		dragoons.coordinates = { col: 1, row: 1 };
		const store = new GameStore(units, TEST_MAP, structuredClone(TEST_LEADERS));
		store.activateUnit('blue-dragoons');
		store.clearLog();
		store.moveUnit({ col: 1, row: 0 });
		store.moveUnit({ col: 2, row: 1 });
		expect(store.log).toHaveLength(2);
		expect(store.log[0].kind).toBe('move_action');
		expect(store.log[1].kind).toBe('move_action');
	});

	it('moveUnit blocked by DT failure emits move_action with moved:false', () => {
		expect.assertions(4);
		// Line Infantry on a HILLTOP (difficult terrain, requires check)
		const units = structuredClone(TEST_UNITS) as Unit[];
		const lineInf = units.find((u) => u.id === 'blue-line-inf')!;
		lineInf.coordinates = { col: 2, row: 2 }; // HILLTOP
		const store = new GameStore(units, TEST_MAP, structuredClone(TEST_LEADERS));
		store.activateUnit('blue-line-inf');
		store.clearLog();
		store.moveUnit({ col: 2, row: 1 }, () => 0); // 0 < 0.5 → DT fails
		expect(store.log).toHaveLength(1);
		const ev = store.log[0];
		if (ev.kind !== 'move_action') throw new Error();
		expect(ev.result.moved).toBe(false);
		expect(ev.result.cost).toBe(0);
		expect(ev.result.difficultTerrainCheck).toEqual({ passed: false });
	});

	it('non-lethal fireAt emits one fire_action with the full FireResult', () => {
		expect.assertions(4);
		const store = makeLightInfFireStore();
		store.activateUnit('blue-light-inf');
		store.clearLog();
		store.fireAt('red-light-horse', seqRngFactory([0, 0.5, 0]));
		expect(store.log).toHaveLength(1);
		const ev = store.log[0];
		expect(ev.kind).toBe('fire_action');
		if (ev.kind !== 'fire_action') throw new Error();
		expect(ev.result.hit).toBe(true);
		expect(ev.result.eliminatedUnitIds).toEqual([]);
	});

	it('fireAt eliminating a leader host emits fire_action with eliminated ids populated', () => {
		expect.assertions(3);
		const units = structuredClone(TEST_UNITS) as Unit[];
		const lightInf = units.find((u) => u.id === 'blue-light-inf')!;
		lightInf.coordinates = { col: 4, row: 1 };
		const horse = units.find((u) => u.id === 'red-horse')!;
		horse.coordinates = { col: 5, row: 1 };
		horse.strengthPoints = 2;
		const store = new GameStore(units, TEST_MAP, structuredClone(TEST_LEADERS));
		store.activateUnit('blue-light-inf');
		store.clearLog();
		store.fireAt('red-horse', seqRngFactory([0, 0.1])); // double damage lethal
		expect(store.log).toHaveLength(1);
		const ev = store.log[0];
		if (ev.kind !== 'fire_action') throw new Error();
		expect(ev.result.eliminatedUnitIds).toEqual(['red-horse']);
		expect(ev.result.eliminatedLeaderIds).toEqual(['red-leader-1']);
	});

	it('chargeAt emits charge_action whose result.morale reflects defender state', () => {
		expect.assertions(3);
		const units = structuredClone(TEST_UNITS) as Unit[];
		const dragoons = units.find((u) => u.id === 'blue-dragoons')!;
		dragoons.coordinates = { col: 3, row: 1 };
		const art = units.find((u) => u.id === 'red-artillery')!;
		art.coordinates = { col: 4, row: 1 };
		const store = new GameStore(units, TEST_MAP, structuredClone(TEST_LEADERS));
		store.activateUnit('blue-dragoons');
		store.clearLog();
		// delta=1 → defender_retreats; morale roll 0.99 → fail
		store.chargeAt('red-artillery', seqRngFactory([0.2, 0, 0.99]));
		const chargeEvent = store.log.find((e) => e.kind === 'charge_action');
		expect(chargeEvent).toBeDefined();
		if (!chargeEvent || chargeEvent.kind !== 'charge_action') throw new Error();
		expect(chargeEvent.result.outcome).toBe('defender_retreats');
		expect(chargeEvent.result.morale?.passed).toBe(false);
	});

	it('activate → fire → endActivation emits exactly three events in order', () => {
		expect.assertions(4);
		const store = makeLightInfFireStore();
		store.activateUnit('blue-light-inf');
		store.fireAt('red-light-horse', seqRngFactory([0, 0.5, 0]));
		store.endActivation();
		expect(store.log).toHaveLength(3);
		expect(store.log[0].kind).toBe('activation_started');
		expect(store.log[1].kind).toBe('fire_action');
		expect(store.log[2].kind).toBe('activation_ended');
	});

	it('endPlayerTurn 0 → 1 mid-game-turn emits player_turn_ended with same turn number', () => {
		expect.assertions(4);
		const store = makeStore();
		store.endPlayerTurn();
		const ev = store.log.at(-1);
		expect(ev?.kind).toBe('player_turn_ended');
		if (!ev || ev.kind !== 'player_turn_ended') throw new Error();
		expect(ev.player).toBe(0);
		expect(ev.nextPlayer).toBe(1);
		expect(ev.nextTurn).toBe(ev.turn);
	});

	it('endPlayerTurn 1 → 0 (rollover) bumps nextTurn', () => {
		expect.assertions(3);
		const store = makeStore();
		store.endPlayerTurn(); // 0 → 1
		store.endPlayerTurn(); // 1 → 0 with turn++
		const ev = store.log.at(-1);
		if (!ev || ev.kind !== 'player_turn_ended') throw new Error();
		expect(ev.player).toBe(1);
		expect(ev.nextPlayer).toBe(0);
		expect(ev.nextTurn).toBe(ev.turn + 1);
	});

	it('clearLog empties the log', () => {
		expect.assertions(2);
		const store = makeStore();
		store.activateUnit('blue-line-inf');
		expect(store.log.length).toBeGreaterThan(0);
		store.clearLog();
		expect(store.log).toEqual([]);
	});
});

describe('scenarios & victory', () => {
	const scenarioStore = () => GameStore.fromScenario(PITCHED_BATTLE);

	// Advance whole game turns (two player turns each). Victory is evaluated on
	// the second of each pair, when player 1 hands back to player 0.
	const advanceGameTurns = (store: GameStore, n: number) => {
		for (let i = 0; i < n; i++) {
			store.endPlayerTurn();
			store.endPlayerTurn();
		}
	};

	const setSp = (store: GameStore, id: string, sp: number) => {
		store.units = store.units.map((u) => (u.id === id ? { ...u, strengthPoints: sp } : u));
	};

	const moveTo = (store: GameStore, id: string, col: number, row: number) => {
		store.units = store.units.map((u) => (u.id === id ? { ...u, coordinates: { col, row } } : u));
	};

	it('fromScenario loads units, leaders, first player, turn limit, conditions', () => {
		expect.assertions(6);
		const store = scenarioStore();
		expect(store.units).toHaveLength(12);
		expect(store.leaders).toHaveLength(2);
		expect(store.activePlayer).toBe(0);
		expect(store.turnLimit).toBe(15);
		expect(store.victoryConditions).toHaveLength(4);
		expect(store.victoryOutcome).toBeNull();
	});

	it('fromScenario deep-clones so scenario data is not mutated by play', () => {
		expect.assertions(1);
		const store = scenarioStore();
		setSp(store, 'red-line-1', 0);
		expect(PITCHED_BATTLE.units.find((u) => u.id === 'red-line-1')?.strengthPoints).toBe(4);
	});

	it('no victory mid-turn before a full game turn completes', () => {
		expect.assertions(2);
		const store = killSetup([breakCond(1)]);
		killRedArtillery(store);
		store.endPlayerTurn(); // 0 → 1, no evaluation yet
		expect(store.isGameOver).toBe(false);
		store.endPlayerTurn(); // 1 → 0, full turn completes → evaluation
		expect(store.isGameOver).toBe(true);
	});

	it('eliminating enough enemy units wins by condition for player 0', () => {
		expect.assertions(4);
		const store = killSetup([breakCond(1)]);
		killRedArtillery(store);
		advanceGameTurns(store, 1);
		expect(store.victoryOutcome?.status).toBe('won');
		expect(store.victoryOutcome?.winner).toBe(0);
		expect(store.victoryOutcome?.conditionId).toBe('blue-break-enemy');
		expect(store.victoryOutcome?.reason).toBe('condition_met');
	});

	it('emits a single game_over event right after player_turn_ended', () => {
		expect.assertions(3);
		const store = killSetup([breakCond(1)]);
		killRedArtillery(store);
		store.clearLog();
		advanceGameTurns(store, 1);
		const gameOvers = store.log.filter((e) => e.kind === 'game_over');
		expect(gameOvers).toHaveLength(1);
		expect(store.log.at(-1)?.kind).toBe('game_over');
		expect(store.log.at(-2)?.kind).toBe('player_turn_ended');
	});

	it('controlling the central hill at turn 15 wins by condition', () => {
		expect.assertions(3);
		const store = scenarioStore();
		moveTo(store, 'blue-light-inf', 3, 4); // onto the central hill
		advanceGameTurns(store, 14); // evaluation at turn 15
		expect(store.turn).toBe(15);
		expect(store.victoryOutcome?.winner).toBe(0);
		expect(store.victoryOutcome?.conditionId).toBe('blue-hold-hill');
	});

	it('hill uncontrolled with unequal SP at turn 15 → tiebreak to the stronger army', () => {
		expect.assertions(2);
		const store = scenarioStore();
		setSp(store, 'red-line-1', 1); // red is weaker, nobody on the hill
		advanceGameTurns(store, 14);
		expect(store.victoryOutcome?.reason).toBe('turn_limit_tiebreak');
		expect(store.victoryOutcome?.winner).toBe(0);
	});

	it('even, undecided field at turn 15 → draw', () => {
		expect.assertions(3);
		const store = scenarioStore();
		advanceGameTurns(store, 14);
		expect(store.victoryOutcome?.status).toBe('draw');
		expect(store.victoryOutcome?.winner).toBeNull();
		expect(store.victoryOutcome?.reason).toBe('turn_limit_draw');
	});

	it('after the game is over, actions and turn advance are inert', () => {
		expect.assertions(4);
		const store = killSetup([breakCond(1)]);
		killRedArtillery(store);
		advanceGameTurns(store, 1);
		const turnAtEnd = store.turn;
		const logLenAtEnd = store.log.length;
		expect(store.isGameOver).toBe(true);
		expect(store.moveUnit({ col: 3, row: 6 })).toBeNull();
		store.endPlayerTurn();
		expect(store.turn).toBe(turnAtEnd);
		expect(store.log.length).toBe(logLenAtEnd);
	});
});

describe('victoryStatus (M13)', () => {
	const moveTo = (store: GameStore, id: string, col: number, row: number) => {
		store.units = store.units.map((u) => (u.id === id ? { ...u, coordinates: { col, row } } : u));
	};

	it('reports eliminate progress as destroyed / needed', () => {
		expect.assertions(3);
		const store = killSetup([breakCond(2)]);
		killRedArtillery(store); // 1 kill toward 2
		const s = store.victoryStatus.find((c) => c.id === 'blue-break-enemy')!;
		expect(s.text).toBe('1 / 2');
		expect(s.fraction).toBeCloseTo(0.5);
		expect(s.met).toBe(false);
	});

	it('marks an eliminate condition met once the count is reached', () => {
		expect.assertions(2);
		const store = killSetup([breakCond(1)]);
		killRedArtillery(store);
		const s = store.victoryStatus.find((c) => c.id === 'blue-break-enemy')!;
		expect(s.text).toBe('1 / 1');
		expect(s.met).toBe(true);
	});

	it('reports control_hexes as held when a friendly unit occupies the objective', () => {
		expect.assertions(2);
		const store = GameStore.fromScenario(PITCHED_BATTLE);
		moveTo(store, 'blue-light-inf', 3, 4); // onto the central hill
		const s = store.victoryStatus.find((c) => c.id === 'blue-hold-hill')!;
		expect(s.text).toContain('Held');
		expect(s.fraction).toBe(1);
	});
});

describe('combat log coords (M13)', () => {
	it('fire_action event carries the target hex coords', () => {
		expect.assertions(1);
		const store = makeLightInfFireStore(); // blue-light-inf (4,0) vs red-light-horse (5,0)
		store.activateUnit('blue-light-inf');
		store.fireAt('red-light-horse', () => 0.999); // miss → target stays put
		const ev = store.log.find((e) => e.kind === 'fire_action');
		expect(ev?.kind === 'fire_action' ? ev.targetCoords : null).toEqual({ col: 5, row: 0 });
	});

	it('charge_action event carries attacker and defender hex coords', () => {
		expect.assertions(2);
		const units = structuredClone(TEST_UNITS) as Unit[];
		const li = units.find((u) => u.id === 'blue-line-inf')!;
		li.coordinates = { col: 3, row: 1 };
		const art = units.find((u) => u.id === 'red-artillery')!;
		art.coordinates = { col: 4, row: 1 };
		const store = new GameStore(units, TEST_MAP, structuredClone(TEST_LEADERS));
		store.activateUnit('blue-line-inf');
		store.chargeAt('red-artillery', () => 0);
		const ev = store.log.find((e) => e.kind === 'charge_action');
		expect(ev?.kind === 'charge_action' ? ev.attackerCoords : null).toEqual({ col: 3, row: 1 });
		expect(ev?.kind === 'charge_action' ? ev.defenderCoords : null).toEqual({ col: 4, row: 1 });
	});
});

describe('GameStore reinforcements', () => {
	// Build a store from the standard test fixtures plus a reinforcement schedule.
	const reinfStore = (
		reinforcements: ReinforcementGroup[],
		victoryConditions: VictoryCondition[] = []
	) =>
		new GameStore(structuredClone(TEST_UNITS), TEST_MAP, structuredClone(TEST_LEADERS), {
			reinforcements,
			victoryConditions
		});

	// A free OPEN hex on TEST_MAP (units start only at cols 0 and 5).
	const FREE = { col: 3, row: 3 };
	// Occupied by blue-light-inf in TEST_UNITS.
	const OCCUPIED = { col: 0, row: 1 };
	const has = (store: GameStore, id: string) => store.units.some((u) => u.id === id);
	const arrivalEvents = (store: GameStore) =>
		store.log.filter((e) => e.kind === 'reinforcements_arrived');

	it('deploys a turn-1 group for the first player at construction, ready to act', () => {
		expect.assertions(5);
		const store = reinfStore([
			{
				turn: 1,
				player: 0,
				units: [{ id: 'reinf-1', type: UnitType.LINE_INFANTRY, coordinates: FREE }]
			}
		]);
		const u = store.units.find((x) => x.id === 'reinf-1');
		expect(u?.coordinates).toEqual(FREE);
		expect(u?.activated).toBe(false);
		expect(u?.movementPointsUsed).toBe(0);
		expect(u?.strengthPoints).toBe(getUnitDefinition(UnitType.LINE_INFANTRY).defaultStrengthPoints);
		store.activateUnit('reinf-1');
		expect(store.activeUnitId).toBe('reinf-1');
	});

	it('withholds a later-turn group until the owner reaches that turn', () => {
		expect.assertions(2);
		const store = reinfStore([
			{
				turn: 3,
				player: 0,
				units: [{ id: 'reinf-late', type: UnitType.HORSE, coordinates: FREE }]
			}
		]);
		store.endPlayerTurn(); // p1 t1
		store.endPlayerTurn(); // p0 t2
		expect(has(store, 'reinf-late')).toBe(false);
		store.endPlayerTurn(); // p1 t2
		store.endPlayerTurn(); // p0 t3 — arrives
		expect(has(store, 'reinf-late')).toBe(true);
	});

	it('deploys on the owning player segment, not the other player on the same turn', () => {
		expect.assertions(2);
		const store = reinfStore([
			{
				turn: 2,
				player: 1,
				units: [{ id: 'reinf-red', type: UnitType.HORSE, coordinates: FREE }]
			}
		]);
		store.endPlayerTurn(); // p1 t1
		store.endPlayerTurn(); // p0 t2 — not player 1's segment
		expect(has(store, 'reinf-red')).toBe(false);
		store.endPlayerTurn(); // p1 t2 — arrives
		expect(has(store, 'reinf-red')).toBe(true);
	});

	it('defers a unit whose entry hex is occupied until the hex clears', () => {
		expect.assertions(3);
		const store = reinfStore([
			{
				turn: 1,
				player: 0,
				units: [{ id: 'reinf-blocked', type: UnitType.LINE_INFANTRY, coordinates: OCCUPIED }]
			}
		]);
		// Blocked at construction → held off-map.
		expect(has(store, 'reinf-blocked')).toBe(false);
		// Clear the hex by relocating the occupant.
		store.units = store.units.map((u) =>
			u.id === 'blue-light-inf' ? { ...u, coordinates: { col: 1, row: 1 } } : u
		);
		store.endPlayerTurn(); // p1 t1 — not player 0's segment
		expect(has(store, 'reinf-blocked')).toBe(false);
		store.endPlayerTurn(); // p0 t2 — hex now free, arrives
		expect(has(store, 'reinf-blocked')).toBe(true);
	});

	it('never deploys a unit onto impassable terrain', () => {
		expect.assertions(2);
		const lakeMap: MapDefinition = [
			{ col: 0, row: 0, terrain: TerrainType.OPEN },
			{ col: 1, row: 0, terrain: TerrainType.LAKE }
		];
		const store = new GameStore([], lakeMap, [], {
			reinforcements: [
				{
					turn: 1,
					player: 0,
					units: [
						{ id: 'reinf-drowned', type: UnitType.LINE_INFANTRY, coordinates: { col: 1, row: 0 } }
					]
				}
			]
		});
		expect(has(store, 'reinf-drowned')).toBe(false);
		store.endPlayerTurn(); // p1 t1
		store.endPlayerTurn(); // p0 t2 — still impassable, stays pending
		expect(has(store, 'reinf-drowned')).toBe(false);
	});

	it('arrives a partly-blocked group piecemeal', () => {
		expect.assertions(4);
		const store = reinfStore([
			{
				turn: 1,
				player: 0,
				units: [
					{ id: 'reinf-free', type: UnitType.LINE_INFANTRY, coordinates: FREE },
					{ id: 'reinf-held', type: UnitType.LINE_INFANTRY, coordinates: OCCUPIED }
				]
			}
		]);
		expect(has(store, 'reinf-free')).toBe(true);
		expect(has(store, 'reinf-held')).toBe(false);
		// Clear the blocked hex, advance to player 0's next turn.
		store.units = store.units.map((u) =>
			u.id === 'blue-light-inf' ? { ...u, coordinates: { col: 1, row: 1 } } : u
		);
		store.endPlayerTurn(); // p1 t1
		store.endPlayerTurn(); // p0 t2 — held unit arrives
		expect(has(store, 'reinf-held')).toBe(true);
		expect(store.units.filter((u) => u.id.startsWith('reinf-')).length).toBe(2);
	});

	it('emits a reinforcements_arrived event for landings, but not on a fully-deferred turn', () => {
		expect.assertions(4);
		const arriveStore = reinfStore([
			{
				turn: 1,
				player: 0,
				units: [{ id: 'reinf-1', type: UnitType.DRAGOONS, coordinates: FREE }]
			}
		]);
		const events = arrivalEvents(arriveStore);
		expect(events).toHaveLength(1);
		const ev = events[0];
		expect(ev.kind === 'reinforcements_arrived' ? ev.player : null).toBe(0);
		expect(ev.kind === 'reinforcements_arrived' ? ev.units.map((u) => u.id) : null).toEqual([
			'reinf-1'
		]);
		// A group blocked at construction emits nothing.
		const deferredStore = reinfStore([
			{
				turn: 1,
				player: 0,
				units: [{ id: 'reinf-blocked', type: UnitType.LINE_INFANTRY, coordinates: OCCUPIED }]
			}
		]);
		expect(arrivalEvents(deferredStore)).toHaveLength(0);
	});

	it('does not move the eliminate_units bar when a reinforcement merely arrives', () => {
		expect.assertions(1);
		// eliminate_units is a kill tally, so an arriving (un-killed) reinforcement
		// leaves progress at zero — the threshold is roster-independent.
		const condition: VictoryCondition = {
			kind: 'eliminate_units',
			id: 'kill-red',
			player: 0,
			description: 'Eliminate 1 red unit',
			count: 1
		};
		const store = reinfStore(
			[
				{
					turn: 1,
					player: 1,
					units: [{ id: 'reinf-red', type: UnitType.HORSE, coordinates: FREE }]
				}
			],
			[condition]
		);
		store.endPlayerTurn(); // p1 t1 — red reinforcement arrives, no kills
		const status = store.victoryStatus.find((s) => s.id === 'kill-red');
		expect(status?.met).toBe(false);
	});

	it('lets a reinforcement satisfy a control_hexes objective', () => {
		expect.assertions(1);
		const condition: VictoryCondition = {
			kind: 'control_hexes',
			id: 'hold-center',
			player: 0,
			description: 'Hold the center',
			hexes: [FREE],
			requireAll: true,
			atTurn: null
		};
		const store = reinfStore(
			[
				{
					turn: 1,
					player: 0,
					units: [{ id: 'reinf-holder', type: UnitType.LINE_INFANTRY, coordinates: FREE }]
				}
			],
			[condition]
		);
		const status = store.victoryStatus.find((s) => s.id === 'hold-center');
		expect(status?.met).toBe(true);
	});
});

describe('GameStore eliminate_units kill tally', () => {
	it('advances eliminate progress when a unit is eliminated in combat', () => {
		expect.assertions(2);
		const condition: VictoryCondition = {
			kind: 'eliminate_units',
			id: 'kill-1',
			player: 0,
			description: 'Eliminate 1 red unit',
			count: 1
		};
		const units = structuredClone(TEST_UNITS) as Unit[];
		units.find((u) => u.id === 'blue-dragoons')!.coordinates = { col: 3, row: 1 };
		const art = units.find((u) => u.id === 'red-artillery')!;
		art.coordinates = { col: 4, row: 1 };
		art.strengthPoints = 1; // a single hit eliminates it
		const store = new GameStore(units, TEST_MAP, structuredClone(TEST_LEADERS), {
			victoryConditions: [condition]
		});
		expect(store.victoryStatus.find((s) => s.id === 'kill-1')?.met).toBe(false);
		store.activateUnit('blue-dragoons');
		store.chargeAt('red-artillery', seqRngFactory([0.2, 0]));
		expect(store.victoryStatus.find((s) => s.id === 'kill-1')?.met).toBe(true);
	});
});

describe('GameStore — dwell-to-torch (scenario torchRule)', () => {
	const TOWN_AT = { col: 1, row: 1 };
	const townMap: MapDefinition = [];
	for (let col = 0; col < 3; col++)
		for (let row = 0; row < 3; row++)
			townMap.push({
				col,
				row,
				terrain: col === 1 && row === 1 ? TerrainType.TOWN : TerrainType.OPEN
			});

	const britAt = (col: number, row: number): Unit => ({
		id: 'brit',
		type: UnitType.LINE_INFANTRY,
		player: 1,
		coordinates: { col, row },
		strengthPoints: 4,
		maxStrengthPoints: 4,
		selected: false,
		movementPointsUsed: 0,
		firedThisActivation: false,
		activated: false,
		elite: false
	});

	// Each full game turn is two endPlayerTurn calls (player 0 then player 1).
	const advanceRounds = (store: GameStore, rounds: number) => {
		for (let i = 0; i < rounds * 2; i++) store.endPlayerTurn();
	};

	it('razes a TOWN hex held by the torch player for dwellTurns rounds', () => {
		expect.assertions(2);
		const store = new GameStore([britAt(1, 1)], townMap, [], {
			firstPlayer: 0,
			torchRule: { dwellTurns: 2, player: 1 }
		});
		expect(store.hexAt(TOWN_AT)?.terrain).toBe(TerrainType.TOWN);
		advanceRounds(store, 2);
		expect(store.hexAt(TOWN_AT)?.terrain).toBe(TerrainType.BURNED);
	});

	it('does not raze if the hex is vacated before the threshold (counter resets)', () => {
		expect.assertions(1);
		const store = new GameStore([britAt(1, 1)], townMap, [], {
			firstPlayer: 0,
			torchRule: { dwellTurns: 2, player: 1 }
		});
		advanceRounds(store, 1); // dwell → 1
		store.units = store.units.map((u) =>
			u.id === 'brit' ? { ...u, coordinates: { col: 0, row: 0 } } : u
		);
		advanceRounds(store, 2);
		expect(store.hexAt(TOWN_AT)?.terrain).toBe(TerrainType.TOWN);
	});

	it('ignores a town held by the other player', () => {
		expect.assertions(1);
		const colUnit: Unit = { ...britAt(1, 1), id: 'col', player: 0 };
		const store = new GameStore([colUnit], townMap, [], {
			firstPlayer: 0,
			torchRule: { dwellTurns: 2, player: 1 }
		});
		advanceRounds(store, 3);
		expect(store.hexAt(TOWN_AT)?.terrain).toBe(TerrainType.TOWN);
	});
});
