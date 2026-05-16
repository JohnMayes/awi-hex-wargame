import type { Grid, OffsetCoordinates } from 'honeycomb-grid';
import type { LeaderCasualtyResult } from './command';
import { HexCell, directions } from './hex';
import type { MoraleResult } from './morale';
import { canUnitEnterTerrain, terrainDefinitions } from './terrain';
import { getUnitDefinition } from './unitDefinitions';
import { getRetreatHex } from './retreat';
import { UnitType, type Unit } from './types';

export type ChargeOutcome =
	| 'defender_eliminated'
	| 'defender_retreats'
	| 'defender_holds'
	| 'attacker_repulsed';

export type ChargeResult = {
	attackerId: string;
	defenderId: string;
	attackerScore: number;
	defenderScore: number;
	attackerDamage: 0 | 1;
	defenderDamage: 0 | 1 | 2 | 3;
	outcome: ChargeOutcome;
	defenderRetreatTo: OffsetCoordinates | null;
	attackerAdvances: boolean;
	attackerLeaderCasualty: LeaderCasualtyResult | null;
	defenderLeaderCasualty: LeaderCasualtyResult | null;
	morale: MoraleResult | null;
};

const CAVALRY_TYPES: ReadonlySet<UnitType> = new Set([
	UnitType.DRAGOONS,
	UnitType.LIGHT_HORSE,
	UnitType.HORSE
]);

function isCavalry(type: UnitType): boolean {
	return CAVALRY_TYPES.has(type);
}

/**
 * Eligibility check for a single attacker/defender pair, ignoring spatial
 * reachability. Tests unit-type restrictions, action gating, and defender SP.
 */
export function canCharge(attacker: Unit, defender: Unit): boolean {
	if (attacker.player === defender.player) return false;
	if (attacker.firedThisActivation) return false;
	if (defender.strengthPoints <= 0) return false;

	const def = getUnitDefinition(attacker.type);
	if (!def.charge.canCharge) return false;
	if (def.charge.restrictedAgainst.includes(defender.type)) return false;

	return true;
}

/**
 * Minimum MP cost for `attacker` to reach `defender`'s hex via a legal charge
 * path. The defender's hex is treated as enterable (despite being enemy-
 * occupied) only as the final step. Returns null if unreachable within
 * remaining MP.
 */
function chargePathCost(
	attacker: Unit,
	defender: Unit,
	grid: Grid<HexCell>,
	units: readonly Unit[]
): number | null {
	const def = getUnitDefinition(attacker.type);
	const startHex = grid.getHex(attacker.coordinates);
	const targetHex = grid.getHex(defender.coordinates);
	if (!startHex || !targetHex) return null;

	if (!canUnitEnterTerrain(attacker.type, targetHex.terrain)) return null;

	const hexMap = new Map<string, HexCell>();
	for (const hex of grid) hexMap.set(`${hex.q},${hex.r}`, hex);

	const unitByKey = new Map<string, Unit>();
	for (const u of units) {
		if (u.strengthPoints <= 0) continue;
		unitByKey.set(`${u.coordinates.col},${u.coordinates.row}`, u);
	}

	const targetKey = `${defender.coordinates.col},${defender.coordinates.row}`;
	const maxMP = def.movementAllowance - attacker.movementPointsUsed;

	const visited = new Set<string>();
	const queue: { hex: HexCell; cost: number }[] = [{ hex: startHex, cost: 0 }];
	visited.add(`${startHex.q},${startHex.r}`);

	while (queue.length > 0) {
		const { hex, cost } = queue.shift()!;

		if (hex.col === defender.coordinates.col && hex.row === defender.coordinates.row) {
			return cost;
		}

		if (cost >= maxMP) continue;

		for (const [dq, dr] of directions) {
			const cubeKey = `${hex.q + dq},${hex.r + dr}`;
			if (visited.has(cubeKey)) continue;
			const neighbor = hexMap.get(cubeKey);
			if (!neighbor) continue;
			visited.add(cubeKey);

			const offKey = `${neighbor.col},${neighbor.row}`;
			const isTarget = offKey === targetKey;

			if (!isTarget) {
				if (!canUnitEnterTerrain(attacker.type, neighbor.terrain)) continue;
				const occupant = unitByKey.get(offKey);
				if (occupant) {
					if (occupant.player !== attacker.player) continue;
					if (!def.canPassThroughFriendly) continue;
				}
			}

			queue.push({ hex: neighbor, cost: cost + 1 });
		}
	}

	return null;
}

/**
 * Returns the set of enemy units the attacker may legally charge this
 * activation. Combines unit-type eligibility (`canCharge`) with spatial
 * reachability (`chargePathCost ≤ remaining MP`).
 */
export function getValidChargeTargets(
	attacker: Unit,
	grid: Grid<HexCell>,
	units: readonly Unit[]
): Unit[] {
	const def = getUnitDefinition(attacker.type);
	if (!def.charge.canCharge) return [];
	if (attacker.firedThisActivation) return [];
	if (attacker.movementPointsUsed >= def.movementAllowance) return [];

	const results: Unit[] = [];
	for (const defender of units) {
		if (!canCharge(attacker, defender)) continue;
		const cost = chargePathCost(attacker, defender, grid, units);
		if (cost === null) continue;
		results.push(defender);
	}
	return results;
}

function rollD6(rng: () => number): number {
	return Math.floor(rng() * 6) + 1;
}

/**
 * Resolves an opposed charge contest per rules §6.3, transposed onto the
 * same-hex model. Pure: does not mutate inputs and does not enforce
 * eligibility (caller filters via `getValidChargeTargets`).
 *
 * Outcome semantics:
 * - attacker_repulsed: attacker takes 1 hit, defender unchanged
 * - defender_holds: defender takes hits but stays in place (DT auto-hold OR
 *   no retreat hex available; in the latter case extra hits are added)
 * - defender_retreats: defender takes hits and moves to a retreat hex
 * - defender_eliminated: defender's SP reaches 0
 *
 * Cavalry attackers always return to origin unless the defender is
 * eliminated (rules §6.3 "Cavalry that fail to destroy their target always
 * retreat after combat"). Line Infantry advance on any defender displacement.
 */
export function resolveCharge(
	attacker: Unit,
	defender: Unit,
	attackerOrigin: OffsetCoordinates,
	grid: Grid<HexCell>,
	units: readonly Unit[],
	rng: () => number = Math.random
): ChargeResult {
	const attackerDef = getUnitDefinition(attacker.type);
	const defenderHex = grid.getHex(defender.coordinates)!;
	const defenderOnDifficult = terrainDefinitions[defenderHex.terrain].isDifficultTerrain;

	const chargeBonus = attackerDef.charge.canCharge ? attackerDef.charge.chargeBonus : 0;
	const dtModifier = defenderOnDifficult ? -1 : 0;

	const attackerRoll = rollD6(rng);
	const defenderRoll = rollD6(rng);

	const attackerScore = attackerRoll + attacker.strengthPoints + chargeBonus + dtModifier;
	const defenderScore = defenderRoll + defender.strengthPoints;
	const delta = attackerScore - defenderScore;

	const base: Omit<
		ChargeResult,
		| 'attackerDamage'
		| 'defenderDamage'
		| 'outcome'
		| 'defenderRetreatTo'
		| 'attackerAdvances'
		| 'attackerLeaderCasualty'
		| 'defenderLeaderCasualty'
		| 'morale'
	> = {
		attackerId: attacker.id,
		defenderId: defender.id,
		attackerScore,
		defenderScore
	};

	if (delta <= 0) {
		return {
			...base,
			attackerDamage: 1,
			defenderDamage: 0,
			outcome: 'attacker_repulsed',
			defenderRetreatTo: null,
			attackerAdvances: false,
			attackerLeaderCasualty: null,
			defenderLeaderCasualty: null,
			morale: null
		};
	}

	const hitsFromTable: 1 | 2 = delta <= 2 ? 1 : 2;
	const mustRetreat = delta >= 3;

	if (delta <= 2 && defenderOnDifficult) {
		const defenderEliminated = defender.strengthPoints - hitsFromTable <= 0;
		return {
			...base,
			attackerDamage: 0,
			defenderDamage: hitsFromTable,
			outcome: defenderEliminated ? 'defender_eliminated' : 'defender_holds',
			defenderRetreatTo: null,
			attackerAdvances: defenderEliminated && !isCavalry(attacker.type),
			attackerLeaderCasualty: null,
			defenderLeaderCasualty: null,
			morale: null
		};
	}

	const retreatHex = getRetreatHex(defender, attackerOrigin, grid, units);

	if (retreatHex !== null) {
		const defenderEliminated = defender.strengthPoints - hitsFromTable <= 0;
		return {
			...base,
			attackerDamage: 0,
			defenderDamage: hitsFromTable,
			outcome: defenderEliminated ? 'defender_eliminated' : 'defender_retreats',
			defenderRetreatTo: defenderEliminated ? null : retreatHex,
			attackerAdvances: !isCavalry(attacker.type) || defenderEliminated,
			attackerLeaderCasualty: null,
			defenderLeaderCasualty: null,
			morale: null
		};
	}

	// No retreat hex available → convert mandatory retreat into an extra hit.
	const totalHits = (hitsFromTable + 1) as 2 | 3;
	void mustRetreat;
	const defenderEliminated = defender.strengthPoints - totalHits <= 0;
	return {
		...base,
		attackerDamage: 0,
		defenderDamage: totalHits,
		outcome: defenderEliminated ? 'defender_eliminated' : 'defender_holds',
		defenderRetreatTo: null,
		attackerAdvances: defenderEliminated && !isCavalry(attacker.type),
		attackerLeaderCasualty: null,
		defenderLeaderCasualty: null,
		morale: null
	};
}
