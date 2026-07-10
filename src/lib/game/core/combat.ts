import type { Grid } from 'honeycomb-grid';
import type { LeaderCasualtyResult } from './command';
import { HexCell, hexDistance, isEntrenchedToward } from './hex';
import { hasLineOfSight } from './los';
import type { MoraleResult } from './morale';
import { getTerrainCoverModifier, getTerrainElevation } from './terrain';
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
	elevationModifier: number;
	finalHitChance: number;
	leaderCasualty: LeaderCasualtyResult | null;
	morale: MoraleResult | null;
	eliminatedUnitIds: string[];
	eliminatedLeaderIds: string[];
};

const ARTILLERY_LONG_RANGE_PENALTY = -0.15;
const ARTILLERY_LONG_RANGE_MIN_DIST = 3;
const DOUBLE_DAMAGE_CHANCE = 1 / 6;
// Cover for a target whose entrenched edge faces the firer (matches woods/town cover,
// and stacks with it). Folded into `coverModifier`, so it surfaces in FireResult.
const ENTRENCHMENT_COVER_MODIFIER = -0.15;
// Slight bonus for firing down onto a lower-elevation target (rules §7). Same-elevation
// fire is unaffected. Folded into its own FireResult field for UI/debug visibility.
const ELEVATION_FIRE_BONUS = 0.1;

/**
 * Returns the enemy units the firing unit may legally fire on, per rules §6.2:
 * within firing range and with unblocked line of sight. Empty for units that
 * cannot fire (range 0) or have already fired this activation.
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

	const results: Unit[] = [];
	for (const u of units) {
		if (u.player === attacker.player) continue;
		const targetHex = grid.getHex(u.coordinates);
		if (!targetHex) continue;
		const dist = hexDistance(attackerHex, targetHex);
		if (dist === 0 || dist > def.firingRange) continue;
		if (!hasLineOfSight(attacker.coordinates, u.coordinates, grid, units)) continue;
		results.push(u);
	}
	return results;
}

/** Hit-chance breakdown for a fire action — the analytic core shared by
 * `resolveFireAction` (which then rolls) and `expectedFireDamage` (which
 * integrates instead of sampling). Single source of truth for the modifiers. */
function fireModifiers(
	attacker: Unit,
	target: Unit,
	grid: Grid<HexCell>
): Pick<
	FireResult,
	'baseHitChance' | 'coverModifier' | 'longRangeModifier' | 'elevationModifier' | 'finalHitChance'
> {
	const def = getUnitDefinition(attacker.type);
	const attackerHex = grid.getHex(attacker.coordinates)!;
	const targetHex = grid.getHex(target.coordinates)!;
	const dist = hexDistance(attackerHex, targetHex);

	const baseHitChance = def.baseHitChance;
	const coverModifier =
		getTerrainCoverModifier(targetHex.terrain) +
		(isEntrenchedToward(targetHex, attackerHex) ? ENTRENCHMENT_COVER_MODIFIER : 0);
	const longRangeModifier =
		attacker.type === UnitType.ARTILLERY && dist >= ARTILLERY_LONG_RANGE_MIN_DIST
			? ARTILLERY_LONG_RANGE_PENALTY
			: 0;
	const elevationModifier =
		getTerrainElevation(attackerHex.terrain) > getTerrainElevation(targetHex.terrain)
			? ELEVATION_FIRE_BONUS
			: 0;
	const finalHitChance = Math.max(
		0,
		Math.min(1, baseHitChance + coverModifier + longRangeModifier + elevationModifier)
	);
	return { baseHitChance, coverModifier, longRangeModifier, elevationModifier, finalHitChance };
}

/**
 * Expected SP damage from one fire action, computed analytically (hit chance ×
 * mean damage-on-hit) rather than by sampling. Used by AI policies to rank and
 * gate targets without an RNG roll. Ignores morale/leader knock-on effects.
 */
export function expectedFireDamage(attacker: Unit, target: Unit, grid: Grid<HexCell>): number {
	return fireModifiers(attacker, target, grid).finalHitChance * (1 + DOUBLE_DAMAGE_CHANCE);
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
	const { baseHitChance, coverModifier, longRangeModifier, elevationModifier, finalHitChance } =
		fireModifiers(attacker, target, grid);

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
		elevationModifier,
		finalHitChance,
		leaderCasualty: null,
		morale: null,
		eliminatedUnitIds: [],
		eliminatedLeaderIds: []
	};
}
