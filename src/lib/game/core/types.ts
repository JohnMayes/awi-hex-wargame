import type { OffsetCoordinates } from 'honeycomb-grid';

export type Player = 0 | 1;

export enum TerrainType {
	OPEN = 'open',
	WOODS = 'woods',
	TOWN = 'town',
	MARSH = 'marsh',
	LAKE = 'lake',
	RIVER = 'river',
	FORD = 'ford',
	BRIDGE = 'bridge',
	ROAD = 'road',
	HILLTOP = 'hilltop'
}

export enum ActivationStep {
	AWAITING_ACTIVATION = 'awaiting_activation',
	COMMAND_CHECK = 'command_check',
	ACTION = 'action',
	CHARGE_RESOLUTION = 'charge_resolution',
	MORALE_CHECK = 'morale_check',
	ACTIVATION_COMPLETE = 'activation_complete'
}

export enum HexFacing {
	N = 0,
	NE = 60,
	SE = 120,
	S = 180,
	SW = 240,
	NW = 300
}

export type FacingZone = 'front' | 'rear';

export enum UnitType {
	LINE_INFANTRY = 'line_infantry',
	LIGHT_INFANTRY = 'light_infantry',
	DRAGOONS = 'dragoons',
	LIGHT_HORSE = 'light_horse',
	HORSE = 'horse',
	ARTILLERY = 'artillery'
}

export enum ActionType {
	MOVE_OR_FIRE = 'move_or_fire',
	FIRE_AND_MOVE = 'fire_and_move',
	MOVE_ONLY = 'move_only'
}

export type ChargeAbility =
	| { canCharge: false }
	| { canCharge: true; chargeBonus: number; restrictedAgainst: UnitType[] };

export type UnitDefinition = {
	readonly displayName: string;
	readonly movementAllowance: number;
	readonly actionType: ActionType;
	readonly firingRange: number;
	readonly baseHitChance: number;
	readonly hasFacing: boolean;
	readonly terrainCheckRequired: boolean;
	readonly charge: ChargeAbility;
	readonly canEnterWoods: boolean;
	readonly canEnterTown: boolean;
	readonly canPassThroughFriendly: boolean;
	readonly defaultStrengthPoints: number;
};

export type Unit = {
	id: string;
	type: UnitType;
	player: Player;
	coordinates: OffsetCoordinates;
	facing: HexFacing;
	strengthPoints: number;
	maxStrengthPoints: number;
	selected: boolean;
	movementPointsUsed: number;
	facingStepsUsed: number;
	firedThisActivation: boolean;
	activated: boolean;
};
