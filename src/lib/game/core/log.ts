import type { ChargeResult } from './charge';
import type { CommandCheckResult } from './command';
import type { FireResult } from './combat';
import type { MoveResult } from './movement';
import type { Player } from './types';

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
};

export type ChargeActionEvent = {
	kind: 'charge_action';
	turn: number;
	player: Player;
	result: ChargeResult;
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

export type LogEvent =
	| ActivationStartedEvent
	| MoveActionEvent
	| FireActionEvent
	| ChargeActionEvent
	| ActivationEndedEvent
	| PlayerTurnEndedEvent;
