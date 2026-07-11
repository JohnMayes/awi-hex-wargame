import type { Leader } from '../core/command';
import type { ReinforcementGroup, Scenario } from '../core/scenario';
import { UnitType, type Unit, type Player } from '../core/types';
import { unitDefinitions } from '../core/unitDefinitions';
import {
	BUNKER_HILL_MAP,
	HUBBARDTON_MAP,
	PAOLI_MAP,
	PITCHED_BATTLE_MAP,
	WHITE_PLAINS_MAP
} from './maps';

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

// --- Bunker Hill (ARW series conversion; see docs/bunker-hill-conversion.md) ---

// All combatants are foot, modeled as Line Infantry. Colonial militia are brittle
// (SP 3); British regulars are SP 4; the optional Grenadier is `elite`. Quality
// differs by SP only — the engine has no per-unit firing-tier modifier.
const bunkerInfantry = (
	id: string,
	player: Player,
	col: number,
	row: number,
	strength: number,
	elite = false
): Unit => ({
	id,
	type: UnitType.LINE_INFANTRY,
	player,
	coordinates: { col, row },
	strengthPoints: strength,
	maxStrengthPoints: strength,
	selected: false,
	movementPointsUsed: 0,
	firedThisActivation: false,
	activated: false,
	elite
});

const MILITIA_SP = 3;
const REGULAR_SP = 4;

const BUNKER_HILL_UNITS: Unit[] = [
	// Colonials (player 0) dug in on Breeds Hill (the `C` hexes).
	bunkerInfantry('col-militia-1', 0, 2, 4, MILITIA_SP),
	bunkerInfantry('col-militia-2', 0, 3, 4, MILITIA_SP),
	bunkerInfantry('col-militia-3', 0, 4, 4, MILITIA_SP),
	bunkerInfantry('col-militia-4', 0, 5, 4, MILITIA_SP),
	// British (player 1) forming up to the south (the `B` hexes).
	bunkerInfantry('brit-reg-1', 1, 2, 8, REGULAR_SP),
	bunkerInfantry('brit-reg-2', 1, 3, 8, REGULAR_SP),
	bunkerInfantry('brit-reg-3', 1, 4, 8, REGULAR_SP),
	bunkerInfantry('brit-reg-4', 1, 4, 7, REGULAR_SP)
];

// Generals: generous radius so the small force stays in command (the ARW system
// has no command rules; this keeps command-check friction minimal).
const BUNKER_HILL_LEADERS: Leader[] = [
	{ id: 'col-ward', attachedToUnitId: 'col-militia-2', commandRadius: 4 },
	{ id: 'col-putnam', attachedToUnitId: 'col-militia-4', commandRadius: 4 },
	{ id: 'brit-howe', attachedToUnitId: 'brit-reg-2', commandRadius: 4 }
];

// Turn 3: 2 British land from the south (one the optional Grenadier = elite),
// 2 Colonial militia arrive at the rear (`R` hexes near Bunker Hill).
const BUNKER_HILL_REINFORCEMENTS: ReinforcementGroup[] = [
	{
		turn: 3,
		player: 1,
		units: [
			{
				id: 'brit-grenadier',
				type: UnitType.LINE_INFANTRY,
				coordinates: { col: 3, row: 8 },
				elite: true
			},
			{ id: 'brit-reg-5', type: UnitType.LINE_INFANTRY, coordinates: { col: 4, row: 8 } }
		]
	},
	{
		turn: 3,
		player: 0,
		units: [
			{
				id: 'col-militia-5',
				type: UnitType.LINE_INFANTRY,
				coordinates: { col: 3, row: 0 },
				strengthPoints: MILITIA_SP,
				maxStrengthPoints: MILITIA_SP
			},
			{
				id: 'col-militia-6',
				type: UnitType.LINE_INFANTRY,
				coordinates: { col: 4, row: 1 },
				strengthPoints: MILITIA_SP,
				maxStrengthPoints: MILITIA_SP
			}
		]
	}
];

export const BUNKER_HILL: Scenario = {
	id: 'bunker-hill',
	name: 'Bunker Hill',
	description:
		'17 June 1775: British regulars assault the Colonial redoubt on Breeds Hill. ' +
		'The British must raze Charlestown and grind down the defenders — they win when ' +
		'Colonial losses plus razed hexes reach 6 (and at least one hex is burned). The ' +
		'Colonials win by breaking four British units.',
	map: BUNKER_HILL_MAP,
	units: BUNKER_HILL_UNITS,
	leaders: BUNKER_HILL_LEADERS,
	firstPlayer: 1,
	turnLimit: 10,
	reinforcements: BUNKER_HILL_REINFORCEMENTS,
	torchRule: { dwellTurns: 2, player: 1 },
	victoryConditions: [
		// British win requires BOTH (group 'brit-win', AND): raze Charlestown and break
		// the Colonial line. Composed from two simple conditions rather than a bespoke kind.
		{
			kind: 'raze',
			id: 'brit-burn-charlestown',
			player: 1,
			group: 'brit-win',
			description: 'Burn at least one Charlestown hex',
			count: 1
		},
		{
			kind: 'eliminate_units',
			id: 'brit-break-colonials',
			player: 1,
			group: 'brit-win',
			description: 'Break 4 Colonial units',
			count: 4
		},
		// Colonials win on attrition alone (ungrouped → stands on its own).
		{
			kind: 'eliminate_units',
			id: 'col-attrition',
			player: 0,
			description: 'Break 4 British units',
			count: 4
		}
	]
};

// --- White Plains (ARW series conversion) ---

// Same all-foot model as Bunker Hill: Line Infantry differentiated by SP. Colonial
// & Loyalist militia are brittle (SP 3); regulars SP 4; the optional Grenadier is elite.
const WHITE_PLAINS_UNITS: Unit[] = [
	// Colonials (player 0): 4 Regulars + 3 Militia at the `C` hexes. ≥2 Militia on
	// Chatterton's Hill (1,3)/(1,4) per the scenario's historical-accuracy note.
	bunkerInfantry('col-militia-1', 0, 1, 3, MILITIA_SP),
	bunkerInfantry('col-militia-2', 0, 1, 4, MILITIA_SP),
	bunkerInfantry('col-militia-3', 0, 3, 5, MILITIA_SP),
	bunkerInfantry('col-reg-1', 0, 0, 4, REGULAR_SP),
	bunkerInfantry('col-reg-2', 0, 3, 4, REGULAR_SP), // White Plains village
	bunkerInfantry('col-reg-3', 0, 5, 3, REGULAR_SP),
	bunkerInfantry('col-reg-4', 0, 5, 4, REGULAR_SP),
	// British (player 1): 2 Loyalist Militia + 3 British Regulars at the `B` hexes (south).
	// The center line sits on row 7 so the south edge (row 8) is clear for the turn-2
	// reinforcements to enter (the map shave dropped the old dedicated reserve row).
	bunkerInfantry('brit-loyalist-1', 1, 2, 7, MILITIA_SP),
	bunkerInfantry('brit-loyalist-2', 1, 6, 8, MILITIA_SP),
	bunkerInfantry('brit-reg-1', 1, 3, 7, REGULAR_SP),
	bunkerInfantry('brit-reg-2', 1, 4, 7, REGULAR_SP),
	bunkerInfantry('brit-reg-3', 1, 5, 7, REGULAR_SP)
];

// Generous radius (ARW has no command rules) — keeps command-check friction low
// across the larger map and the Colonial run for the exit.
const WHITE_PLAINS_LEADERS: Leader[] = [
	{ id: 'col-washington', attachedToUnitId: 'col-reg-2', commandRadius: 6 },
	{ id: 'brit-howe', attachedToUnitId: 'brit-reg-1', commandRadius: 6 }
];

// Turn 2: 3 British Regulars arrive at the `B` hexes (south edge, row 8); one is the
// optional Grenadier (elite), matching the Bunker Hill precedent.
const WHITE_PLAINS_REINFORCEMENTS: ReinforcementGroup[] = [
	{
		turn: 2,
		player: 1,
		units: [
			{ id: 'brit-reg-4', type: UnitType.LINE_INFANTRY, coordinates: { col: 2, row: 8 } },
			{
				id: 'brit-grenadier',
				type: UnitType.LINE_INFANTRY,
				coordinates: { col: 3, row: 8 },
				elite: true
			},
			{ id: 'brit-reg-5', type: UnitType.LINE_INFANTRY, coordinates: { col: 4, row: 8 } }
		]
	}
];

export const WHITE_PLAINS: Scenario = {
	id: 'white-plains',
	name: 'White Plains',
	description:
		'28 October 1776: Washington slips away from Howe. The Colonials win only by ' +
		'marching 5 units off the north road AND breaking 2 British units — pull off the ' +
		'escape or the British win. A missed opportunity for the Crown.',
	map: WHITE_PLAINS_MAP,
	units: WHITE_PLAINS_UNITS,
	leaders: WHITE_PLAINS_LEADERS,
	firstPlayer: 1,
	turnLimit: 15,
	turnLimitWinner: 1, // "any other result is a British victory"
	reinforcements: WHITE_PLAINS_REINFORCEMENTS,
	victoryConditions: [
		// Colonial win requires BOTH (group 'col-escape', AND): exit 5 units off the
		// north road and inflict 2 casualties first.
		{
			kind: 'exit_units',
			id: 'col-escape-north',
			player: 0,
			group: 'col-escape',
			description: 'March 5 units off the north road',
			edge: 'north',
			count: 5
		},
		{
			kind: 'eliminate_units',
			id: 'col-bloody-2',
			player: 0,
			group: 'col-escape',
			description: 'Break 2 British units',
			count: 2
		}
	]
};

// --- Paoli (ARW series conversion; see docs/scenario-conversion-guide.md) ---

// Regulars → Line Infantry (SP 4) per the all-foot ARW model; the lone British
// "Cavalry" is a Dragoon (move 2, fire + charge). Beyond the source 5-v-5 roster,
// each side gets 2 Light Infantry deployed in the woods, so the (Line-Infantry-
// impassable) woods band is live skirmish ground rather than dead scenery.
const PAOLI_UNITS: Unit[] = [
	// Colonials (player 0): 3 Regulars in the camp (the `C` hexes) + 2 woods skirmishers.
	makeUnit('col-reg-1', UnitType.LINE_INFANTRY, 0, 4, 4),
	makeUnit('col-reg-2', UnitType.LINE_INFANTRY, 0, 4, 5),
	makeUnit('col-reg-3', UnitType.LINE_INFANTRY, 0, 4, 6),
	makeUnit('col-light-1', UnitType.LIGHT_INFANTRY, 0, 5, 3),
	makeUnit('col-light-2', UnitType.LIGHT_INFANTRY, 0, 3, 5),
	// British (player 1): 4 Regulars + 1 Dragoon (the `B` hexes) + 2 woods skirmishers.
	makeUnit('brit-reg-1', UnitType.LINE_INFANTRY, 1, 2, 0),
	makeUnit('brit-reg-2', UnitType.LINE_INFANTRY, 1, 3, 0),
	makeUnit('brit-reg-3', UnitType.LINE_INFANTRY, 1, 4, 0),
	makeUnit('brit-reg-4', UnitType.LINE_INFANTRY, 1, 0, 2),
	makeUnit('brit-dragoons', UnitType.DRAGOONS, 1, 0, 3),
	makeUnit('brit-light-1', UnitType.LIGHT_INFANTRY, 1, 3, 1),
	makeUnit('brit-light-2', UnitType.LIGHT_INFANTRY, 1, 5, 1)
];

// Generous radius (ARW has no command rules). British start in two prongs (top + far
// left) too far apart for one radius, so they get two leaders.
const PAOLI_LEADERS: Leader[] = [
	{ id: 'col-wayne', attachedToUnitId: 'col-reg-2', commandRadius: 6 },
	{ id: 'brit-grey', attachedToUnitId: 'brit-reg-2', commandRadius: 6 },
	{ id: 'brit-musgrave', attachedToUnitId: 'brit-dragoons', commandRadius: 4 }
];

// Turn 4: 2 Colonial Regulars arrive at the `R` hexes (south). The second is at (4,8)
// rather than the source's woods hex (4,7) so it doesn't deploy onto impassable terrain.
const PAOLI_REINFORCEMENTS: ReinforcementGroup[] = [
	{
		turn: 4,
		player: 0,
		units: [
			{ id: 'col-reg-4', type: UnitType.LINE_INFANTRY, coordinates: { col: 2, row: 7 } },
			{ id: 'col-reg-5', type: UnitType.LINE_INFANTRY, coordinates: { col: 4, row: 8 } }
		]
	}
];

export const PAOLI: Scenario = {
	id: 'paoli',
	name: 'Paoli',
	description:
		'21 September 1777: Grey launches a surprise night assault on Wayne’s camp near ' +
		'the Paoli Tavern. The British must eliminate 3 Colonial units within 6 turns; if the ' +
		'Colonials still stand, they win.',
	map: PAOLI_MAP,
	units: PAOLI_UNITS,
	leaders: PAOLI_LEADERS,
	firstPlayer: 1,
	turnLimit: 6,
	turnLimitWinner: 0, // "or the Colonials win"
	reinforcements: PAOLI_REINFORCEMENTS,
	victoryConditions: [
		{
			kind: 'eliminate_units',
			id: 'brit-kill-3',
			player: 1,
			description: 'Eliminate 3 Colonial units',
			count: 3
		}
	]
};

// --- Hubbardton (ARW series conversion; see docs/hubbardton-conversion.md) ---

// Foot units modeled per the all-foot ARW pattern: Regulars → Line Infantry (SP 4); the
// Loyalist/German militia "representing light infantry" → Light Infantry (SP 3), which can also
// contest the woods. The Green Mountain Men marker (source: reroll 1s in woods; deny enemies the
// woods retreat benefit) has no hook in our %-based combat / terrain model, so it collapses to a
// single tough woods skirmisher: an `elite` Colonial Light Infantry (the Green Mountain Boys were
// light riflemen). Variable SP + elite, so a small local builder rather than the LINE-only helpers.
const hubUnit = (
	id: string,
	type: UnitType,
	player: Player,
	col: number,
	row: number,
	strength: number = sp(type),
	elite = false
): Unit => ({
	id,
	type,
	player,
	coordinates: { col, row },
	strengthPoints: strength,
	maxStrengthPoints: strength,
	selected: false,
	movementPointsUsed: 0,
	firedThisActivation: false,
	activated: false,
	elite
});

const HUBBARDTON_UNITS: Unit[] = [
	// Colonials (player 0): 3 Continental Regulars holding the centre-right line (the `C` hexes)
	// + the Green Mountain Men (elite Light Infantry) forward in the (4,2) woods.
	hubUnit('col-reg-1', UnitType.LINE_INFANTRY, 0, 5, 2, REGULAR_SP),
	hubUnit('col-reg-2', UnitType.LINE_INFANTRY, 0, 5, 3, REGULAR_SP),
	hubUnit('col-reg-3', UnitType.LINE_INFANTRY, 0, 5, 4, REGULAR_SP),
	hubUnit('col-green-mtn', UnitType.LIGHT_INFANTRY, 0, 4, 2, REGULAR_SP, true),
	// British (player 1) entering from the NW: 2 Regulars at the `B` hexes, 1 Regular +
	// 1 Loyalist Militia (light) at the red `R` hexes.
	hubUnit('brit-reg-1', UnitType.LINE_INFANTRY, 1, 0, 1, REGULAR_SP),
	hubUnit('brit-reg-2', UnitType.LINE_INFANTRY, 1, 2, 1, REGULAR_SP),
	hubUnit('brit-reg-3', UnitType.LINE_INFANTRY, 1, 1, 1, REGULAR_SP),
	hubUnit('brit-loyalist-1', UnitType.LIGHT_INFANTRY, 1, 0, 2, MILITIA_SP)
];

// Generous radius (ARW has no command rules). Colonels Francis & Warner for the Continentals;
// Fraser & Riedesel for the British/German advance.
const HUBBARDTON_LEADERS: Leader[] = [
	{ id: 'col-francis', attachedToUnitId: 'col-reg-2', commandRadius: 6 },
	{ id: 'col-warner', attachedToUnitId: 'col-green-mtn', commandRadius: 5 },
	{ id: 'brit-fraser', attachedToUnitId: 'brit-reg-2', commandRadius: 6 },
	{ id: 'brit-riedesel', attachedToUnitId: 'brit-reg-1', commandRadius: 5 }
];

// Turn 3: 2 Loyalist Militia (Riedesel's Germans) arrive at the NW `R` hexes. Turn 5: 1 Colonial
// Militia arrives at the SE `blue-R` hex. (Source gated the turn-5/6 Colonial on a 4-5-6 die roll
// each turn; our ReinforcementGroup is fixed-turn only, so it is one guaranteed turn-5 arrival.)
const HUBBARDTON_REINFORCEMENTS: ReinforcementGroup[] = [
	{
		turn: 3,
		player: 1,
		units: [
			{
				id: 'brit-loyalist-2',
				type: UnitType.LIGHT_INFANTRY,
				coordinates: { col: 0, row: 0 },
				strengthPoints: MILITIA_SP,
				maxStrengthPoints: MILITIA_SP
			},
			{
				id: 'brit-loyalist-3',
				type: UnitType.LIGHT_INFANTRY,
				coordinates: { col: 1, row: 0 },
				strengthPoints: MILITIA_SP,
				maxStrengthPoints: MILITIA_SP
			}
		]
	},
	{
		turn: 5,
		player: 0,
		units: [
			{
				id: 'col-militia-1',
				type: UnitType.LINE_INFANTRY,
				coordinates: { col: 6, row: 6 },
				strengthPoints: MILITIA_SP,
				maxStrengthPoints: MILITIA_SP
			}
		]
	}
];

export const HUBBARDTON: Scenario = {
	id: 'hubbardton',
	name: 'Hubbardton',
	description:
		'7 July 1777: Fraser’s British and Riedesel’s Germans try to smash through a Continental ' +
		'rearguard under Francis and Warner. The British must eliminate 3 Colonial units by the end ' +
		'of turn 7; the Colonials win by bloodying the British (breaking a unit) and marching 2 units ' +
		'off the south edge.',
	map: HUBBARDTON_MAP,
	units: HUBBARDTON_UNITS,
	leaders: HUBBARDTON_LEADERS,
	firstPlayer: 1,
	turnLimit: 7,
	reinforcements: HUBBARDTON_REINFORCEMENTS,
	victoryConditions: [
		{
			kind: 'eliminate_units',
			id: 'brit-kill-3',
			player: 1,
			description: 'Eliminate 3 Colonial units',
			count: 3
		},
		// Colonial win requires BOTH (group 'col-standfast', AND): bloody the British (their
		// historically high casualty rate) AND get the rearguard away off the south edge — so
		// the Continentals can't just sprint for the exit, they have to fight first.
		{
			kind: 'eliminate_units',
			id: 'col-bloody',
			player: 0,
			group: 'col-standfast',
			description: 'Break 1 British unit',
			count: 1
		},
		{
			kind: 'exit_units',
			id: 'col-escape-south',
			player: 0,
			group: 'col-standfast',
			description: 'March 2 units off the south edge',
			edge: 'south',
			count: 2
		}
	]
};

export const SCENARIOS: Record<string, Scenario> = {
	[PITCHED_BATTLE.id]: PITCHED_BATTLE,
	[BUNKER_HILL.id]: BUNKER_HILL,
	[WHITE_PLAINS.id]: WHITE_PLAINS,
	[PAOLI.id]: PAOLI,
	[HUBBARDTON.id]: HUBBARDTON
};
