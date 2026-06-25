import type { OffsetCoordinates } from 'honeycomb-grid';
import type { ChargeResult } from './charge';
import type { CommandCheckResult } from './command';
import type { FireResult } from './combat';
import type { MoveResult } from './movement';
import type { Player, UnitType } from './types';
import type { VictoryOutcome } from './victory';

export type ActivationStartedEvent = {
	kind: 'activation_started';
	turn: number;
	player: Player;
	unitId: string;
	commandCheck: CommandCheckResult;
};

export type MoveActionEvent = {
	kind: 'move_action';
	turn: number;
	player: Player;
	result: MoveResult;
};

export type FireActionEvent = {
	kind: 'fire_action';
	turn: number;
	player: Player;
	result: FireResult;
	/** Target's hex at fire time — captured so render FX can place feedback even
	 *  after the target is eliminated and removed from the units array. */
	targetCoords: OffsetCoordinates;
};

export type ChargeActionEvent = {
	kind: 'charge_action';
	turn: number;
	player: Player;
	result: ChargeResult;
	/** Combatants' hexes at charge time (pre-resolution), captured for render FX. */
	attackerCoords: OffsetCoordinates;
	defenderCoords: OffsetCoordinates;
};

export type ActivationEndedEvent = {
	kind: 'activation_ended';
	turn: number;
	player: Player;
	unitId: string;
};

export type PlayerTurnEndedEvent = {
	kind: 'player_turn_ended';
	turn: number;
	player: Player;
	nextTurn: number;
	nextPlayer: Player;
};

export type GameOverEvent = {
	kind: 'game_over';
	turn: number;
	outcome: VictoryOutcome;
};

export type ReinforcementsArrivedEvent = {
	kind: 'reinforcements_arrived';
	turn: number;
	player: Player;
	/** Units that actually landed this turn (after deferral filtering). */
	units: { id: string; type: UnitType; coordinates: OffsetCoordinates }[];
};

export type LogEvent =
	| ActivationStartedEvent
	| MoveActionEvent
	| FireActionEvent
	| ChargeActionEvent
	| ActivationEndedEvent
	| PlayerTurnEndedEvent
	| GameOverEvent
	| ReinforcementsArrivedEvent;
