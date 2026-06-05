import { coordsEqual } from './hex';
import type { OffsetCoordinates } from 'honeycomb-grid';
import type { Player } from './types';

export type ObjectiveHex = OffsetCoordinates;
export type MapEdge = 'north' | 'south' | 'east' | 'west';

/**
 * A scenario victory condition. Each is owned by the `player` who wins by
 * satisfying it (rules §11). The union is the single extension point for new
 * win conditions — add a member and a case in `evaluateVictory`.
 */
export type VictoryCondition =
	| {
			kind: 'eliminate_units';
			id: string;
			player: Player;
			description: string;
			/** Win when this many of the enemy's starting units have been eliminated. */
			count: number;
	  }
	| {
			kind: 'control_hexes';
			id: string;
			player: Player;
			description: string;
			hexes: ObjectiveHex[];
			/** true → must control every listed hex; false → any one suffices. */
			requireAll: boolean;
			/** null → decisive at any game-turn end; a number → only decisive at that game turn. */
			atTurn: number | null;
	  }
	| {
			kind: 'hold_hexes';
			id: string;
			player: Player;
			description: string;
			hexes: ObjectiveHex[];
			requireAll: boolean;
			/** Win after controlling the hex(es) for this many consecutive game turns. */
			consecutiveTurns: number;
	  }
	| {
			kind: 'exit_units';
			id: string;
			player: Player;
			description: string;
			edge: MapEdge;
			/** Win when this many own units have exited off the named edge. */
			count: number;
	  };

/** Cross-turn accumulators, keyed by condition id. Immutable: replaced each turn. */
export type VictoryProgress = {
	/** condition id → consecutive game turns its hold has been satisfied. */
	holdStreaks: Record<string, number>;
	/** condition id → own units that have exited via its edge so far. */
	exitedCounts: Record<string, number>;
};

export type VictoryReason = 'condition_met' | 'turn_limit_tiebreak' | 'turn_limit_draw';

export type VictoryOutcome = {
	status: 'won' | 'draw';
	winner: Player | null; // null only for a draw
	conditionId: string | null; // null for a tiebreak/draw
	reason: VictoryReason;
	turn: number; // game turn at which it was decided
};

type SnapshotUnit = {
	id: string;
	player: Player;
	strengthPoints: number;
	coordinates: OffsetCoordinates;
};

export type VictorySnapshot = {
	/** The game turn that just completed. */
	turn: number;
	turnLimit: number | null;
	units: ReadonlyArray<SnapshotUnit>;
	/** Starting unit count per player, for elimination accounting. */
	startingUnitsByPlayer: Record<Player, number>;
	bounds: { minCol: number; maxCol: number; minRow: number; maxRow: number };
	/** Units that exited this turn, by edge. Empty until the exit action is wired. */
	exitedThisTurn: ReadonlyArray<{ unitId: string; player: Player; edge: MapEdge }>;
};

export const emptyVictoryProgress = (): VictoryProgress => ({ holdStreaks: {}, exitedCounts: {} });

const enemyOf = (player: Player): Player => (player === 0 ? 1 : 0);

/** Compute rectangular bounds (min/max col & row) over a set of hex coordinates. */
export function boundsFromCoords(coords: ReadonlyArray<OffsetCoordinates>) {
	const cols = coords.map((c) => c.col);
	const rows = coords.map((c) => c.row);
	return {
		minCol: Math.min(...cols),
		maxCol: Math.max(...cols),
		minRow: Math.min(...rows),
		maxRow: Math.max(...rows)
	};
}

/** The map edge a hex sits on, or null if it is interior. (north/south = row extremes.) */
export function edgeOf(hex: OffsetCoordinates, bounds: VictorySnapshot['bounds']): MapEdge | null {
	if (hex.row === bounds.minRow) return 'north';
	if (hex.row === bounds.maxRow) return 'south';
	if (hex.col === bounds.minCol) return 'west';
	if (hex.col === bounds.maxCol) return 'east';
	return null;
}

/** A player controls a hex iff a surviving friendly unit occupies it (no two units share a hex). */
function controlsHexes(
	player: Player,
	hexes: ReadonlyArray<ObjectiveHex>,
	requireAll: boolean,
	units: ReadonlyArray<SnapshotUnit>
): boolean {
	const controls = (h: ObjectiveHex) =>
		units.some((u) => u.player === player && u.strengthPoints > 0 && coordsEqual(u.coordinates, h));
	return requireAll ? hexes.every(controls) : hexes.some(controls);
}

function survivingCount(player: Player, units: ReadonlyArray<SnapshotUnit>): number {
	return units.filter((u) => u.player === player && u.strengthPoints > 0).length;
}

function totalSp(player: Player, units: ReadonlyArray<SnapshotUnit>): number {
	return units
		.filter((u) => u.player === player)
		.reduce((sum, u) => sum + Math.max(0, u.strengthPoints), 0);
}

/** Decide a game by surviving strength points: more SP wins, equal is a draw. */
function tiebreak(snapshot: VictorySnapshot): VictoryOutcome {
	const sp0 = totalSp(0, snapshot.units);
	const sp1 = totalSp(1, snapshot.units);
	if (sp0 === sp1) {
		return {
			status: 'draw',
			winner: null,
			conditionId: null,
			reason: 'turn_limit_draw',
			turn: snapshot.turn
		};
	}
	return {
		status: 'won',
		winner: sp0 > sp1 ? 0 : 1,
		conditionId: null,
		reason: 'turn_limit_tiebreak',
		turn: snapshot.turn
	};
}

/**
 * Pure victory evaluator. Recomputes cross-turn progress (hold streaks, exit
 * counts) and decides whether the game has ended.
 *
 * No-op contract: with no conditions and no turn limit it returns the progress
 * unchanged and a null outcome — so a default game never ends and emits nothing.
 *
 * Decision order: a single satisfied side wins immediately; if both sides
 * satisfy a condition on the same turn it falls through to the SP tiebreak;
 * otherwise, once the turn limit is reached with no winner, the tiebreak fires.
 */
export function evaluateVictory(
	conditions: ReadonlyArray<VictoryCondition>,
	snapshot: VictorySnapshot,
	progress: VictoryProgress
): { progress: VictoryProgress; outcome: VictoryOutcome | null } {
	if (conditions.length === 0 && snapshot.turnLimit === null) {
		return { progress, outcome: null };
	}

	const holdStreaks: Record<string, number> = { ...progress.holdStreaks };
	const exitedCounts: Record<string, number> = { ...progress.exitedCounts };

	// First pass: update cross-turn accumulators for hold/exit conditions.
	for (const c of conditions) {
		if (c.kind === 'hold_hexes') {
			const held = controlsHexes(c.player, c.hexes, c.requireAll, snapshot.units);
			holdStreaks[c.id] = held ? (progress.holdStreaks[c.id] ?? 0) + 1 : 0;
		} else if (c.kind === 'exit_units') {
			const newExits = snapshot.exitedThisTurn.filter(
				(e) => e.player === c.player && e.edge === c.edge
			).length;
			exitedCounts[c.id] = (progress.exitedCounts[c.id] ?? 0) + newExits;
		}
	}

	const nextProgress: VictoryProgress = { holdStreaks, exitedCounts };

	// Second pass: which conditions are satisfied this turn?
	const satisfiedByPlayer = new Map<Player, string>(); // player → first satisfied condition id
	for (const c of conditions) {
		let satisfied = false;
		switch (c.kind) {
			case 'eliminate_units': {
				const enemy = enemyOf(c.player);
				const destroyed =
					snapshot.startingUnitsByPlayer[enemy] - survivingCount(enemy, snapshot.units);
				satisfied = destroyed >= c.count;
				break;
			}
			case 'control_hexes': {
				if (c.atTurn !== null && snapshot.turn !== c.atTurn) break;
				satisfied = controlsHexes(c.player, c.hexes, c.requireAll, snapshot.units);
				break;
			}
			case 'hold_hexes': {
				satisfied = holdStreaks[c.id] >= c.consecutiveTurns;
				break;
			}
			case 'exit_units': {
				satisfied = exitedCounts[c.id] >= c.count;
				break;
			}
		}
		if (satisfied && !satisfiedByPlayer.has(c.player)) {
			satisfiedByPlayer.set(c.player, c.id);
		}
	}

	if (satisfiedByPlayer.size === 1) {
		const [[winner, conditionId]] = satisfiedByPlayer;
		return {
			progress: nextProgress,
			outcome: {
				status: 'won',
				winner,
				conditionId,
				reason: 'condition_met',
				turn: snapshot.turn
			}
		};
	}

	// Both sides satisfied a condition simultaneously → resolve by tiebreak.
	if (satisfiedByPlayer.size === 2) {
		return { progress: nextProgress, outcome: tiebreak(snapshot) };
	}

	// No winner: decide at the turn limit, otherwise play on.
	if (snapshot.turnLimit !== null && snapshot.turn >= snapshot.turnLimit) {
		return { progress: nextProgress, outcome: tiebreak(snapshot) };
	}

	return { progress: nextProgress, outcome: null };
}
