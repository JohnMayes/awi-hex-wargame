import type { Grid } from 'honeycomb-grid';
import { HexCell, hexDistance } from './hex';
import { getFrontHexsides } from './facing';
import { hasLineOfSight } from './los';
import { terrainDefinitions, getTerrainCoverModifier } from './terrain';
import { getUnitDefinition } from './unitDefinitions';
import { UnitType, type Unit } from './types';

export type FireResult = {
	attackerId: string;
	targetId: string;
	hit: boolean;
	damage: 0 | 1 | 2;
	baseHitChance: number;
	coverModifier: number;
	longRangeModifier: number;
	finalHitChance: number;
};

const COVER_PENALTY = -0.15;
const ARTILLERY_LONG_RANGE_PENALTY = -0.15;
const ARTILLERY_LONG_RANGE_MIN_DIST = 3;
const DOUBLE_DAMAGE_CHANCE = 1 / 6;

type CubeFrac = { q: number; r: number; s: number };

function cubeRound(frac: CubeFrac): { q: number; r: number } {
	let q = Math.round(frac.q);
	let r = Math.round(frac.r);
	const s = Math.round(frac.s);
	const dq = Math.abs(q - frac.q);
	const dr = Math.abs(r - frac.r);
	const ds = Math.abs(s - frac.s);
	if (dq > dr && dq > ds) q = -r - s;
	else if (dr > ds) r = -q - s;
	return { q, r };
}

/**
 * Returns the direction index (0-5) of the first integer-hex sample along the
 * cube line from `firer` toward `target`. When the lerped first sample falls
 * on a hexside boundary, both candidate directions are returned.
 *
 * Uses the same opposite-sign-nudge trick as `los.ts` to detect ties.
 */
function firstStepDirections(firer: HexCell, target: HexCell, dist: number): number[] {
	const eps1 = 1e-6;
	const eps2 = 2e-6;
	const t = 1 / dist;
	const traceWith = (sign: number): { q: number; r: number } => {
		const aq = firer.q + sign * eps1;
		const ar = firer.r + sign * eps2;
		const bq = target.q + sign * eps1;
		const br = target.r + sign * eps2;
		const q = aq + (bq - aq) * t;
		const r = ar + (br - ar) * t;
		return cubeRound({ q, r, s: -q - r });
	};
	const directionFromDelta = (dq: number, dr: number): number | null => {
		// Match cube deltas in `directions` array from hex.ts:
		// 0:E (1,0), 1:NE (1,-1), 2:NW (0,-1), 3:W (-1,0), 4:SW (-1,1), 5:SE (0,1)
		if (dq === 1 && dr === 0) return 0;
		if (dq === 1 && dr === -1) return 1;
		if (dq === 0 && dr === -1) return 2;
		if (dq === -1 && dr === 0) return 3;
		if (dq === -1 && dr === 1) return 4;
		if (dq === 0 && dr === 1) return 5;
		return null;
	};
	const sampleA = traceWith(+1);
	const sampleB = traceWith(-1);
	const dirA = directionFromDelta(sampleA.q - firer.q, sampleA.r - firer.r);
	const dirB = directionFromDelta(sampleB.q - firer.q, sampleB.r - firer.r);
	const out: number[] = [];
	if (dirA !== null) out.push(dirA);
	if (dirB !== null && dirB !== dirA) out.push(dirB);
	return out;
}

function isInFrontArc(
	firer: HexCell,
	target: HexCell,
	frontDirIndices: readonly number[],
	allAround: boolean
): boolean {
	if (allAround) return true;
	const dist = hexDistance(firer, target);
	if (dist === 0) return false;
	const stepDirs = firstStepDirections(firer, target, dist);
	// Permissive: in arc if any first-step candidate direction is in the front arc.
	return stepDirs.some((d) => frontDirIndices.includes(d));
}

/**
 * Returns the enemy units the firing unit may legally fire on, per rules §6.2:
 * within firing range, in firing arc, and with unblocked line of sight. Empty
 * for units that cannot fire (range 0) or have already fired this activation.
 */
export function getValidFireTargets(
	attacker: Unit,
	grid: Grid<HexCell>,
	units: readonly Unit[]
): Unit[] {
	const def = getUnitDefinition(attacker.type);
	if (def.firingRange === 0) return [];
	if (attacker.firedThisActivation) return [];

	const attackerHex = grid.getHex(attacker.coordinates);
	if (!attackerHex) return [];

	const attackerTerrain = terrainDefinitions[attackerHex.terrain];
	const allAround = !def.hasFacing || attackerTerrain.grantAllAroundFacing;
	const frontDirIndices = allAround
		? [0, 1, 2, 3, 4, 5]
		: getFrontHexsides(attacker.facing).map((f) => f / 60);

	const results: Unit[] = [];
	for (const u of units) {
		if (u.player === attacker.player) continue;
		const targetHex = grid.getHex(u.coordinates);
		if (!targetHex) continue;
		const dist = hexDistance(attackerHex, targetHex);
		if (dist === 0 || dist > def.firingRange) continue;
		if (!isInFrontArc(attackerHex, targetHex, frontDirIndices, allAround)) continue;
		if (!hasLineOfSight(attacker.coordinates, u.coordinates, grid, units)) continue;
		results.push(u);
	}
	return results;
}

/**
 * Resolves a single fire action against an eligible target. Pure: does not
 * mutate inputs and does not enforce eligibility (caller filters via
 * `getValidFireTargets`). The RNG is consumed up to twice — once for the hit
 * roll and (only on a hit) once more for the doubled-damage roll.
 */
export function resolveFireAction(
	attacker: Unit,
	target: Unit,
	grid: Grid<HexCell>,
	rng: () => number = Math.random
): FireResult {
	const def = getUnitDefinition(attacker.type);
	const attackerHex = grid.getHex(attacker.coordinates)!;
	const targetHex = grid.getHex(target.coordinates)!;
	const dist = hexDistance(attackerHex, targetHex);

	const baseHitChance = def.baseHitChance;
	const coverModifier = getTerrainCoverModifier(targetHex.terrain);
	const longRangeModifier =
		attacker.type === UnitType.ARTILLERY && dist >= ARTILLERY_LONG_RANGE_MIN_DIST
			? ARTILLERY_LONG_RANGE_PENALTY
			: 0;
	const finalHitChance = Math.max(
		0,
		Math.min(1, baseHitChance + coverModifier + longRangeModifier)
	);

	const hit = rng() < finalHitChance;
	let damage: 0 | 1 | 2 = 0;
	if (hit) {
		damage = rng() < DOUBLE_DAMAGE_CHANCE ? 2 : 1;
	}

	return {
		attackerId: attacker.id,
		targetId: target.id,
		hit,
		damage,
		baseHitChance,
		coverModifier,
		longRangeModifier,
		finalHitChance
	};
}
