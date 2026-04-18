import { describe, expect, it } from 'vitest';
import { unitDefinitions, getUnitDefinition } from './unitDefinitions';
import { ActionType, UnitType } from './types';

describe('unitDefinitions', () => {
	it('defines all 6 unit types', () => {
		expect.assertions(1);
		expect(Object.keys(unitDefinitions)).toHaveLength(6);
	});

	it('has an entry for every UnitType enum value', () => {
		expect.assertions(6);
		for (const type of Object.values(UnitType)) {
			expect(unitDefinitions[type]).toBeDefined();
		}
	});

	describe('Line Infantry', () => {
		const def = unitDefinitions[UnitType.LINE_INFANTRY];

		it('has movement 1', () => {
			expect.assertions(1);
			expect(def.movementAllowance).toBe(1);
		});
		it('has facing', () => {
			expect.assertions(1);
			expect(def.hasFacing).toBe(true);
		});
		it('uses MOVE_OR_FIRE', () => {
			expect.assertions(1);
			expect(def.actionType).toBe(ActionType.MOVE_OR_FIRE);
		});
		it('has range 2', () => {
			expect.assertions(1);
			expect(def.firingRange).toBe(2);
		});
		it('has 65% hit chance', () => {
			expect.assertions(1);
			expect(def.baseHitChance).toBe(0.65);
		});
		it('can charge but not vs cavalry types', () => {
			expect.assertions(4);
			expect(def.charge.canCharge).toBe(true);
			if (def.charge.canCharge) {
				expect(def.charge.restrictedAgainst).toContain(UnitType.DRAGOONS);
				expect(def.charge.restrictedAgainst).toContain(UnitType.LIGHT_HORSE);
				expect(def.charge.restrictedAgainst).toContain(UnitType.HORSE);
			}
		});
		it('requires terrain check', () => {
			expect.assertions(1);
			expect(def.terrainCheckRequired).toBe(true);
		});
		it('cannot enter woods', () => {
			expect.assertions(1);
			expect(def.canEnterWoods).toBe(false);
		});
		it('can enter town', () => {
			expect.assertions(1);
			expect(def.canEnterTown).toBe(true);
		});
		it('has 4 default SP', () => {
			expect.assertions(1);
			expect(def.defaultStrengthPoints).toBe(4);
		});
	});

	describe('Light Infantry', () => {
		const def = unitDefinitions[UnitType.LIGHT_INFANTRY];

		it('has movement 1', () => {
			expect.assertions(1);
			expect(def.movementAllowance).toBe(1);
		});
		it('has NO facing', () => {
			expect.assertions(1);
			expect(def.hasFacing).toBe(false);
		});
		it('uses FIRE_AND_MOVE', () => {
			expect.assertions(1);
			expect(def.actionType).toBe(ActionType.FIRE_AND_MOVE);
		});
		it('has range 2', () => {
			expect.assertions(1);
			expect(def.firingRange).toBe(2);
		});
		it('has 50% hit chance', () => {
			expect.assertions(1);
			expect(def.baseHitChance).toBe(0.5);
		});
		it('cannot charge', () => {
			expect.assertions(1);
			expect(def.charge.canCharge).toBe(false);
		});
		it('does NOT require terrain check', () => {
			expect.assertions(1);
			expect(def.terrainCheckRequired).toBe(false);
		});
		it('can enter woods', () => {
			expect.assertions(1);
			expect(def.canEnterWoods).toBe(true);
		});
		it('can enter town', () => {
			expect.assertions(1);
			expect(def.canEnterTown).toBe(true);
		});
		it('can pass through friendly units', () => {
			expect.assertions(1);
			expect(def.canPassThroughFriendly).toBe(true);
		});
	});

	describe('Dragoons', () => {
		const def = unitDefinitions[UnitType.DRAGOONS];

		it('has movement 2', () => {
			expect.assertions(1);
			expect(def.movementAllowance).toBe(2);
		});
		it('has facing', () => {
			expect.assertions(1);
			expect(def.hasFacing).toBe(true);
		});
		it('uses MOVE_OR_FIRE', () => {
			expect.assertions(1);
			expect(def.actionType).toBe(ActionType.MOVE_OR_FIRE);
		});
		it('has range 2', () => {
			expect.assertions(1);
			expect(def.firingRange).toBe(2);
		});
		it('has 50% hit chance', () => {
			expect.assertions(1);
			expect(def.baseHitChance).toBe(0.5);
		});
		it('can charge with no restrictions', () => {
			expect.assertions(2);
			expect(def.charge.canCharge).toBe(true);
			if (def.charge.canCharge) {
				expect(def.charge.restrictedAgainst).toHaveLength(0);
			}
		});
		it('requires terrain check', () => {
			expect.assertions(1);
			expect(def.terrainCheckRequired).toBe(true);
		});
		it('cannot enter town', () => {
			expect.assertions(1);
			expect(def.canEnterTown).toBe(false);
		});
	});

	describe('Light Horse', () => {
		const def = unitDefinitions[UnitType.LIGHT_HORSE];

		it('has movement 2', () => {
			expect.assertions(1);
			expect(def.movementAllowance).toBe(2);
		});
		it('uses MOVE_ONLY', () => {
			expect.assertions(1);
			expect(def.actionType).toBe(ActionType.MOVE_ONLY);
		});
		it('has no firing range', () => {
			expect.assertions(1);
			expect(def.firingRange).toBe(0);
		});
		it('has 0 hit chance', () => {
			expect.assertions(1);
			expect(def.baseHitChance).toBe(0);
		});
		it('can charge with no bonus', () => {
			expect.assertions(2);
			expect(def.charge.canCharge).toBe(true);
			if (def.charge.canCharge) {
				expect(def.charge.chargeBonus).toBe(0);
			}
		});
	});

	describe('Horse', () => {
		const def = unitDefinitions[UnitType.HORSE];

		it('has movement 2', () => {
			expect.assertions(1);
			expect(def.movementAllowance).toBe(2);
		});
		it('uses MOVE_ONLY', () => {
			expect.assertions(1);
			expect(def.actionType).toBe(ActionType.MOVE_ONLY);
		});
		it('has no firing range', () => {
			expect.assertions(1);
			expect(def.firingRange).toBe(0);
		});
		it('can charge with +1 bonus', () => {
			expect.assertions(2);
			expect(def.charge.canCharge).toBe(true);
			if (def.charge.canCharge) {
				expect(def.charge.chargeBonus).toBe(1);
			}
		});
	});

	describe('Artillery', () => {
		const def = unitDefinitions[UnitType.ARTILLERY];

		it('has movement 1', () => {
			expect.assertions(1);
			expect(def.movementAllowance).toBe(1);
		});
		it('uses MOVE_OR_FIRE', () => {
			expect.assertions(1);
			expect(def.actionType).toBe(ActionType.MOVE_OR_FIRE);
		});
		it('has range 4', () => {
			expect.assertions(1);
			expect(def.firingRange).toBe(4);
		});
		it('has 50% hit chance', () => {
			expect.assertions(1);
			expect(def.baseHitChance).toBe(0.5);
		});
		it('cannot charge', () => {
			expect.assertions(1);
			expect(def.charge.canCharge).toBe(false);
		});
		it('cannot enter woods', () => {
			expect.assertions(1);
			expect(def.canEnterWoods).toBe(false);
		});
		it('cannot enter town', () => {
			expect.assertions(1);
			expect(def.canEnterTown).toBe(false);
		});
	});

	describe('getUnitDefinition helper', () => {
		it('returns the same object as direct lookup', () => {
			expect.assertions(1);
			expect(getUnitDefinition(UnitType.HORSE)).toBe(unitDefinitions[UnitType.HORSE]);
		});
	});
});
