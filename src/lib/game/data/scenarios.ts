import type { Leader } from '../core/command';
import type { Scenario } from '../core/scenario';
import { UnitType, type Unit, type Player } from '../core/types';
import { unitDefinitions } from '../core/unitDefinitions';
import { PITCHED_BATTLE_MAP } from './maps';

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

// One leader per side (1 per 2 units rounded down, minimum 1). Radius 10
// trivially covers the 6×4 TEST_MAP so every unit stays in-command, keeping
// pre-M10 tests stable without rng-sequence changes. Red leader is on
// red-horse (rarely a fire/charge target) so casualty rolls don't shift the
// rng order in existing combat tests.
export const TEST_LEADERS: Leader[] = [
	{ id: 'blue-leader-1', attachedToUnitId: 'blue-line-inf', commandRadius: 10 },
	{ id: 'red-leader-1', attachedToUnitId: 'red-horse', commandRadius: 10 }
];

// --- Pitched Battle: a symmetric 6-vs-6 clash on the 7×9 field ---

const makeUnit = (id: string, type: UnitType, player: Player, col: number, row: number): Unit => ({
	id,
	type,
	player,
	coordinates: { col, row },
	strengthPoints: sp(type),
	maxStrengthPoints: sp(type),
	selected: false,
	movementPointsUsed: 0,
	firedThisActivation: false,
	activated: false,
	elite: false
});

// Identical composition per side, deployed point-symmetrically: Blue (player 0)
// holds the south rows, Red (player 1) the north. Red's coords are Blue's under
// (col, row) → (6 - col, 8 - row).
const PITCHED_BATTLE_UNITS: Unit[] = [
	makeUnit('blue-line-1', UnitType.LINE_INFANTRY, 0, 2, 8),
	makeUnit('blue-line-2', UnitType.LINE_INFANTRY, 0, 4, 8),
	makeUnit('blue-light-inf', UnitType.LIGHT_INFANTRY, 0, 3, 7),
	makeUnit('blue-artillery', UnitType.ARTILLERY, 0, 3, 8),
	makeUnit('blue-dragoons', UnitType.DRAGOONS, 0, 1, 7),
	makeUnit('blue-horse', UnitType.HORSE, 0, 5, 7),
	makeUnit('red-line-1', UnitType.LINE_INFANTRY, 1, 4, 0),
	makeUnit('red-line-2', UnitType.LINE_INFANTRY, 1, 2, 0),
	makeUnit('red-light-inf', UnitType.LIGHT_INFANTRY, 1, 3, 1),
	makeUnit('red-artillery', UnitType.ARTILLERY, 1, 3, 0),
	makeUnit('red-dragoons', UnitType.DRAGOONS, 1, 5, 1),
	makeUnit('red-horse', UnitType.HORSE, 1, 1, 1)
];

const PITCHED_BATTLE_LEADERS: Leader[] = [
	{ id: 'blue-leader-1', attachedToUnitId: 'blue-line-1', commandRadius: 3 },
	{ id: 'red-leader-1', attachedToUnitId: 'red-line-1', commandRadius: 3 }
];

const CENTRAL_HILL = { col: 3, row: 4 };

export const PITCHED_BATTLE: Scenario = {
	id: 'pitched-battle',
	name: 'Pitched Battle',
	description:
		'Two even armies of six units meet on open ground around a central hill. ' +
		'Break four enemy units or hold the hill at the end of turn 15. If the ' +
		'field is undecided, the army with more surviving strength carries the day.',
	map: PITCHED_BATTLE_MAP,
	units: PITCHED_BATTLE_UNITS,
	leaders: PITCHED_BATTLE_LEADERS,
	firstPlayer: 0,
	turnLimit: 15,
	victoryConditions: [
		{
			kind: 'eliminate_units',
			id: 'blue-break-enemy',
			player: 0,
			description: 'Eliminate 4 enemy units',
			count: 4
		},
		{
			kind: 'control_hexes',
			id: 'blue-hold-hill',
			player: 0,
			description: 'Hold the central hill at the end of turn 15',
			hexes: [CENTRAL_HILL],
			requireAll: true,
			atTurn: 15
		},
		{
			kind: 'eliminate_units',
			id: 'red-break-enemy',
			player: 1,
			description: 'Eliminate 4 enemy units',
			count: 4
		},
		{
			kind: 'control_hexes',
			id: 'red-hold-hill',
			player: 1,
			description: 'Hold the central hill at the end of turn 15',
			hexes: [CENTRAL_HILL],
			requireAll: true,
			atTurn: 15
		}
	]
};

export const SCENARIOS: Record<string, Scenario> = {
	[PITCHED_BATTLE.id]: PITCHED_BATTLE
};
