// TODO: scenario special rules system
import { UnitType, type Unit, type Player } from '../core/types';
import { unitDefinitions } from '../core/unitDefinitions';

const sp = (type: UnitType) => unitDefinitions[type].defaultStrengthPoints;

export const TEST_UNITS: Unit[] = [
	{
		id: 'blue-line-inf',
		type: UnitType.LINE_INFANTRY,
		player: 0 as Player,
		coordinates: { col: 0, row: 0 },
		strengthPoints: sp(UnitType.LINE_INFANTRY),
		maxStrengthPoints: sp(UnitType.LINE_INFANTRY),
		selected: false,
		movementPointsUsed: 0,
		firedThisActivation: false,
		activated: false,
		elite: false
	},
	{
		id: 'blue-light-inf',
		type: UnitType.LIGHT_INFANTRY,
		player: 0 as Player,
		coordinates: { col: 0, row: 1 },
		strengthPoints: sp(UnitType.LIGHT_INFANTRY),
		maxStrengthPoints: sp(UnitType.LIGHT_INFANTRY),
		selected: false,
		movementPointsUsed: 0,
		firedThisActivation: false,
		activated: false,
		elite: false
	},
	{
		id: 'blue-dragoons',
		type: UnitType.DRAGOONS,
		player: 0 as Player,
		coordinates: { col: 0, row: 2 },
		strengthPoints: sp(UnitType.DRAGOONS),
		maxStrengthPoints: sp(UnitType.DRAGOONS),
		selected: false,
		movementPointsUsed: 0,
		firedThisActivation: false,
		activated: false,
		elite: false
	},
	{
		id: 'red-light-horse',
		type: UnitType.LIGHT_HORSE,
		player: 1 as Player,
		coordinates: { col: 5, row: 0 },
		strengthPoints: sp(UnitType.LIGHT_HORSE),
		maxStrengthPoints: sp(UnitType.LIGHT_HORSE),
		selected: false,
		movementPointsUsed: 0,
		firedThisActivation: false,
		activated: false,
		elite: false
	},
	{
		id: 'red-horse',
		type: UnitType.HORSE,
		player: 1 as Player,
		coordinates: { col: 5, row: 1 },
		strengthPoints: sp(UnitType.HORSE),
		maxStrengthPoints: sp(UnitType.HORSE),
		selected: false,
		movementPointsUsed: 0,
		firedThisActivation: false,
		activated: false,
		elite: false
	},
	{
		id: 'red-artillery',
		type: UnitType.ARTILLERY,
		player: 1 as Player,
		coordinates: { col: 5, row: 2 },
		strengthPoints: sp(UnitType.ARTILLERY),
		maxStrengthPoints: sp(UnitType.ARTILLERY),
		selected: false,
		movementPointsUsed: 0,
		firedThisActivation: false,
		activated: false,
		elite: false
	}
];
