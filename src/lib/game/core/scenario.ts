import type { OffsetCoordinates } from 'honeycomb-grid';
import type { MapDefinition } from '../data/maps';
import type { Leader } from './command';
import type { Player, Unit, UnitType } from './types';
import type { VictoryCondition } from './victory';

/**
 * One unit scheduled to arrive as a reinforcement, with its desired entry hex.
 * A light spec rather than a full `Unit`: the store expands it into a `Unit`
 * with the standard runtime defaults (see `GameStore`), so scenario authors
 * don't hand-write transient flags like `selected`/`movementPointsUsed`.
 */
export type ReinforcementUnitSpec = {
	/** Must be unique across `Scenario.units` and every reinforcement. */
	id: string;
	type: UnitType;
	/** The hex the unit enters on. */
	coordinates: OffsetCoordinates;
	/** Defaults to the unit type's `defaultStrengthPoints`. */
	strengthPoints?: number;
	/** Defaults to the unit type's `defaultStrengthPoints`. */
	maxStrengthPoints?: number;
	/** Defaults to false. */
	elite?: boolean;
};

/**
 * Optional scenario rule: a `player` unit that holds a TOWN hex for `dwellTurns`
 * consecutive game turns razes it (terrain → BURNED). Scenario-scoped — only set it
 * on battles that want town-burning (e.g. Bunker Hill / Charlestown). TOWN is the
 * only flammable terrain, so the rule needs no per-hex list.
 */
export type TorchRule = {
	dwellTurns: number;
	player: Player;
};

/** A group of reinforcements that all arrive on the same game turn for one player. */
export type ReinforcementGroup = {
	/** Game turn (>= 1) the group is scheduled to arrive. */
	turn: number;
	player: Player;
	units: ReinforcementUnitSpec[];
};

/**
 * A complete, self-contained game setup: the battlefield, both sides' forces,
 * who moves first, how long the game runs, and how it is won (rules §11). The
 * GameStore is initialized from one of these via `GameStore.fromScenario`.
 */
export type Scenario = {
	id: string;
	name: string;
	description: string;
	map: MapDefinition;
	units: Unit[];
	leaders: Leader[];
	firstPlayer: Player;
	turnLimit: number;
	victoryConditions: VictoryCondition[];
	/**
	 * Who wins if the turn limit is reached with no victory condition met. Set it
	 * for asymmetric "any other result is a defender victory" battles (e.g. White
	 * Plains); omit to fall back to the surviving-SP tiebreak (the default).
	 */
	turnLimitWinner?: Player;
	/**
	 * Forces that arrive after game start. Each group is deployed at the start of
	 * its owner's portion of the scheduled turn; a group whose entry hex is blocked
	 * (occupied or impassable) is held off-map and retried each subsequent owner turn.
	 */
	reinforcements?: ReinforcementGroup[];
	/** Town-burning rule (see TorchRule). Omit on scenarios without burnable towns. */
	torchRule?: TorchRule;
};
