import type { MapDefinition } from '../data/maps';
import type { Leader } from './command';
import type { Player, Unit } from './types';
import type { VictoryCondition } from './victory';

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
};
