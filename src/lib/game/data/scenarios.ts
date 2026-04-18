// TODO: scenario special rules system
import { HexFacing, UnitType, type Unit, type Player } from '../core/types';
import { unitDefinitions } from '../core/unitDefinitions';

const sp = (type: UnitType) => unitDefinitions[type].defaultStrengthPoints;

export const TEST_UNITS: Unit[] = [
	{
		id: 'blue-line-inf',
		type: UnitType.LINE_INFANTRY,
		player: 0 as Player,
		coordinates: { col: 0, row: 0 },
		facing: HexFacing.SE,
		strengthPoints: sp(UnitType.LINE_INFANTRY),
		maxStrengthPoints: sp(UnitType.LINE_INFANTRY),
		selected: false,
		movementPointsUsed: 0,
		facingStepsUsed: 0,
		activated: false
	},
	{
		id: 'blue-light-inf',
		type: UnitType.LIGHT_INFANTRY,
		player: 0 as Player,
		coordinates: { col: 0, row: 1 },
		facing: HexFacing.SE,
		strengthPoints: sp(UnitType.LIGHT_INFANTRY),
		maxStrengthPoints: sp(UnitType.LIGHT_INFANTRY),
		selected: false,
		movementPointsUsed: 0,
		facingStepsUsed: 0,
		activated: false
	},
	{
		id: 'blue-dragoons',
		type: UnitType.DRAGOONS,
		player: 0 as Player,
		coordinates: { col: 0, row: 2 },
		facing: HexFacing.SE,
		strengthPoints: sp(UnitType.DRAGOONS),
		maxStrengthPoints: sp(UnitType.DRAGOONS),
		selected: false,
		movementPointsUsed: 0,
		facingStepsUsed: 0,
		activated: false
	},
	{
		id: 'red-light-horse',
		type: UnitType.LIGHT_HORSE,
		player: 1 as Player,
		coordinates: { col: 5, row: 0 },
		facing: HexFacing.SW,
		strengthPoints: sp(UnitType.LIGHT_HORSE),
		maxStrengthPoints: sp(UnitType.LIGHT_HORSE),
		selected: false,
		movementPointsUsed: 0,
		facingStepsUsed: 0,
		activated: false
	},
	{
		id: 'red-horse',
		type: UnitType.HORSE,
		player: 1 as Player,
		coordinates: { col: 5, row: 1 },
		facing: HexFacing.SW,
		strengthPoints: sp(UnitType.HORSE),
		maxStrengthPoints: sp(UnitType.HORSE),
		selected: false,
		movementPointsUsed: 0,
		facingStepsUsed: 0,
		activated: false
	},
	{
		id: 'red-artillery',
		type: UnitType.ARTILLERY,
		player: 1 as Player,
		coordinates: { col: 5, row: 2 },
		facing: HexFacing.SW,
		strengthPoints: sp(UnitType.ARTILLERY),
		maxStrengthPoints: sp(UnitType.ARTILLERY),
		selected: false,
		movementPointsUsed: 0,
		facingStepsUsed: 0,
		activated: false
	}
];
