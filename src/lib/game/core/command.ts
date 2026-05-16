import type { Grid } from 'honeycomb-grid';
import { HexCell, hexDistance } from './hex';
import type { Unit } from './types';

export type Leader = {
	id: string;
	attachedToUnitId: string;
	commandRadius: number;
};

export type CommandCheckResult = {
	unitId: string;
	inCommand: boolean;
	nearestLeaderId: string | null;
	distanceToNearestLeader: number | null;
	nearestLeaderRadius: number | null;
	basePassChance: number;
	farPenalty: number;
	finalPassChance: number;
	roll: number;
	passed: boolean;
};

export type LeaderCasualtyResult = {
	unitId: string;
	leaderId: string;
	roll: number;
	casualty: boolean;
	replacementLeaderId: string | null;
	replacementAttachedToUnitId: string | null;
	replacementRadius: number | null;
};

const COMMAND_CHECK_BASE_PASS = 0.5;
const COMMAND_CHECK_FAR_PENALTY = -0.15;
const LEADER_CASUALTY_CHANCE = 0.15;

function clamp01(value: number): number {
	if (value < 0) return 0;
	if (value > 1) return 1;
	return value;
}

export function getAttachedLeader(unitId: string, leaders: readonly Leader[]): Leader | null {
	return leaders.find((l) => l.attachedToUnitId === unitId) ?? null;
}

/**
 * Per-leader distance to a queried unit, in hexes (cube-distance from the
 * leader's host unit's hex to the queried unit's hex). Returns null when
 * either hex is off-grid or the host unit is missing from `units`.
 */
function leaderDistanceTo(
	leader: Leader,
	unit: Unit,
	units: readonly Unit[],
	grid: Grid<HexCell>
): number | null {
	const host = units.find((u) => u.id === leader.attachedToUnitId);
	if (!host) return null;
	const hostHex = grid.getHex(host.coordinates);
	const unitHex = grid.getHex(unit.coordinates);
	if (!hostHex || !unitHex) return null;
	return hexDistance(hostHex, unitHex);
}

/**
 * Picks the friendly (same-player) leader with the smallest distance to
 * `unit`. Ties broken by leader id (lexicographic) for determinism. Returns
 * null if the unit's side has no leaders with reachable hosts.
 */
function nearestFriendlyLeader(
	unit: Unit,
	leaders: readonly Leader[],
	units: readonly Unit[],
	grid: Grid<HexCell>
): { leader: Leader; distance: number } | null {
	let best: { leader: Leader; distance: number } | null = null;
	for (const l of leaders) {
		const host = units.find((u) => u.id === l.attachedToUnitId);
		if (!host) continue;
		if (host.player !== unit.player) continue;
		const dist = leaderDistanceTo(l, unit, units, grid);
		if (dist === null) continue;
		if (
			best === null ||
			dist < best.distance ||
			(dist === best.distance && l.id < best.leader.id)
		) {
			best = { leader: l, distance: dist };
		}
	}
	return best;
}

/**
 * True iff some friendly leader's command radius reaches the queried unit.
 * Per §8.2 the boundary is inclusive (D ≤ R = in command).
 */
export function isInCommand(
	unit: Unit,
	leaders: readonly Leader[],
	units: readonly Unit[],
	grid: Grid<HexCell>
): boolean {
	for (const l of leaders) {
		const host = units.find((u) => u.id === l.attachedToUnitId);
		if (!host) continue;
		if (host.player !== unit.player) continue;
		const dist = leaderDistanceTo(l, unit, units, grid);
		if (dist === null) continue;
		if (dist <= l.commandRadius) return true;
	}
	return false;
}

/**
 * Per §8.2. In-command units skip the roll entirely and return passed=true
 * with `roll: 0`. Out-of-command units roll vs. base 50%, with a -15%
 * penalty when distance to nearest friendly leader exceeds 2× that leader's
 * radius.
 */
export function resolveCommandCheck(
	unit: Unit,
	leaders: readonly Leader[],
	units: readonly Unit[],
	grid: Grid<HexCell>,
	rng: () => number
): CommandCheckResult {
	const nearest = nearestFriendlyLeader(unit, leaders, units, grid);

	if (nearest && nearest.distance <= nearest.leader.commandRadius) {
		return {
			unitId: unit.id,
			inCommand: true,
			nearestLeaderId: nearest.leader.id,
			distanceToNearestLeader: nearest.distance,
			nearestLeaderRadius: nearest.leader.commandRadius,
			basePassChance: 1,
			farPenalty: 0,
			finalPassChance: 1,
			roll: 0,
			passed: true
		};
	}

	const farPenalty =
		nearest && nearest.distance > 2 * nearest.leader.commandRadius ? COMMAND_CHECK_FAR_PENALTY : 0;
	const finalPassChance = clamp01(COMMAND_CHECK_BASE_PASS + farPenalty);
	const roll = rng();
	const passed = roll < finalPassChance;

	return {
		unitId: unit.id,
		inCommand: false,
		nearestLeaderId: nearest?.leader.id ?? null,
		distanceToNearestLeader: nearest?.distance ?? null,
		nearestLeaderRadius: nearest?.leader.commandRadius ?? null,
		basePassChance: COMMAND_CHECK_BASE_PASS,
		farPenalty,
		finalPassChance,
		roll,
		passed
	};
}

/**
 * Generates a replacement leader id by suffixing `-r{n}` where `n` is one
 * more than the count of existing `-r` segments. `blue-leader-1` →
 * `blue-leader-1-r1`; `blue-leader-1-r1` → `blue-leader-1-r1-r2`. Keeps the
 * lineage traceable.
 */
function replacementId(originalId: string): string {
	const matches = originalId.match(/-r\d+/g);
	const n = (matches?.length ?? 0) + 1;
	return `${originalId}-r${n}`;
}

/**
 * Per §8.3. Rolls one rng draw against ~15% iff the unit has an attached
 * leader. On casualty, the original leader is removed and a replacement is
 * generated, attached to the nearest friendly unit that does not already
 * have a leader. Tie-break: lowest unit id. Replacement radius =
 * max(0, original - 1). Returns the new leaders array so the caller can
 * apply it atomically with the damage update.
 */
export function resolveLeaderCasualty(
	unitId: string,
	leaders: readonly Leader[],
	units: readonly Unit[],
	grid: Grid<HexCell>,
	rng: () => number
): { result: LeaderCasualtyResult | null; leaders: Leader[] } {
	const original = getAttachedLeader(unitId, leaders);
	if (!original) return { result: null, leaders: [...leaders] };

	const roll = rng();
	const casualty = roll < LEADER_CASUALTY_CHANCE;

	if (!casualty) {
		return {
			result: {
				unitId,
				leaderId: original.id,
				roll,
				casualty: false,
				replacementLeaderId: null,
				replacementAttachedToUnitId: null,
				replacementRadius: null
			},
			leaders: [...leaders]
		};
	}

	const remaining = leaders.filter((l) => l.id !== original.id);
	const hostUnit = units.find((u) => u.id === original.attachedToUnitId);
	const attachedIds = new Set(remaining.map((l) => l.attachedToUnitId));

	let replacement: Leader | null = null;
	if (hostUnit) {
		const hostHex = grid.getHex(hostUnit.coordinates);
		const candidates: { unit: Unit; distance: number }[] = [];
		for (const u of units) {
			if (u.id === hostUnit.id) continue;
			if (u.player !== hostUnit.player) continue;
			if (attachedIds.has(u.id)) continue;
			if (u.strengthPoints <= 0) continue;
			const hex = grid.getHex(u.coordinates);
			if (!hex || !hostHex) continue;
			candidates.push({ unit: u, distance: hexDistance(hostHex, hex) });
		}
		candidates.sort((a, b) => a.distance - b.distance || (a.unit.id < b.unit.id ? -1 : 1));
		const chosen = candidates[0];
		if (chosen) {
			replacement = {
				id: replacementId(original.id),
				attachedToUnitId: chosen.unit.id,
				commandRadius: Math.max(0, original.commandRadius - 1)
			};
		}
	}

	const nextLeaders = replacement ? [...remaining, replacement] : remaining;

	return {
		result: {
			unitId,
			leaderId: original.id,
			roll,
			casualty: true,
			replacementLeaderId: replacement?.id ?? null,
			replacementAttachedToUnitId: replacement?.attachedToUnitId ?? null,
			replacementRadius: replacement?.commandRadius ?? null
		},
		leaders: nextLeaders
	};
}
