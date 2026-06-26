import type { Leader } from '../core/command';
import type { ReinforcementGroup, Scenario } from '../core/scenario';
import { UnitType, type Unit, type Player } from '../core/types';
import { unitDefinitions } from '../core/unitDefinitions';
import { BUNKER_HILL_MAP, PITCHED_BATTLE_MAP } from './maps';

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
    'Colonials win by breaking four British units. Adapted from the ARW series: the ' +
    'phased fire sequence, ammunition, and sniper rules are dropped; entrenchments and ' +
    'burning Charlestown (hold a town hex two turns to set it alight) are modeled.',
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

export const SCENARIOS: Record<string, Scenario> = {
  [PITCHED_BATTLE.id]: PITCHED_BATTLE,
  [BUNKER_HILL.id]: BUNKER_HILL
};
