import { ActionType, UnitType, type UnitDefinition } from './types';

export const unitDefinitions: Readonly<Record<UnitType, UnitDefinition>> = {
	[UnitType.LINE_INFANTRY]: {
		displayName: 'Line Infantry',
		movementAllowance: 1,
		actionType: ActionType.MOVE_OR_FIRE,
		firingRange: 2,
		baseHitChance: 0.65,
		hasFacing: true,
		terrainCheckRequired: true,
		charge: {
			canCharge: true,
			chargeBonus: 0,
			restrictedAgainst: [UnitType.DRAGOONS, UnitType.LIGHT_HORSE, UnitType.HORSE]
		},
		canEnterWoods: false,
		canEnterTown: true,
		canPassThroughFriendly: false,
		defaultStrengthPoints: 4
	},
	[UnitType.LIGHT_INFANTRY]: {
		displayName: 'Light Infantry',
		movementAllowance: 1,
		actionType: ActionType.FIRE_AND_MOVE,
		firingRange: 2,
		baseHitChance: 0.5,
		hasFacing: false,
		terrainCheckRequired: false,
		charge: { canCharge: false },
		canEnterWoods: true,
		canEnterTown: true,
		canPassThroughFriendly: true,
		defaultStrengthPoints: 4
	},
	[UnitType.DRAGOONS]: {
		displayName: 'Dragoons',
		movementAllowance: 2,
		actionType: ActionType.MOVE_OR_FIRE,
		firingRange: 2,
		baseHitChance: 0.5,
		hasFacing: true,
		terrainCheckRequired: true,
		charge: {
			canCharge: true,
			chargeBonus: 0,
			restrictedAgainst: []
		},
		canEnterWoods: false,
		canEnterTown: false,
		canPassThroughFriendly: false,
		defaultStrengthPoints: 4
	},
	[UnitType.LIGHT_HORSE]: {
		displayName: 'Light Horse',
		movementAllowance: 2,
		actionType: ActionType.MOVE_ONLY,
		firingRange: 0,
		baseHitChance: 0,
		hasFacing: true,
		terrainCheckRequired: true,
		charge: {
			canCharge: true,
			chargeBonus: 0,
			restrictedAgainst: []
		},
		canEnterWoods: false,
		canEnterTown: false,
		canPassThroughFriendly: false,
		defaultStrengthPoints: 4
	},
	[UnitType.HORSE]: {
		displayName: 'Horse',
		movementAllowance: 2,
		actionType: ActionType.MOVE_ONLY,
		firingRange: 0,
		baseHitChance: 0,
		hasFacing: true,
		terrainCheckRequired: true,
		charge: {
			canCharge: true,
			chargeBonus: 1,
			restrictedAgainst: []
		},
		canEnterWoods: false,
		canEnterTown: false,
		canPassThroughFriendly: false,
		defaultStrengthPoints: 4
	},
	[UnitType.ARTILLERY]: {
		displayName: 'Artillery',
		movementAllowance: 1,
		actionType: ActionType.MOVE_OR_FIRE,
		firingRange: 4,
		baseHitChance: 0.5,
		hasFacing: true,
		terrainCheckRequired: true,
		charge: { canCharge: false },
		canEnterWoods: false,
		canEnterTown: false,
		canPassThroughFriendly: false,
		defaultStrengthPoints: 4
	}
};

export function getUnitDefinition(type: UnitType): UnitDefinition {
	return unitDefinitions[type];
}
