import type { Grid, OffsetCoordinates } from 'honeycomb-grid';
import type { HexCell } from './hex';
import { getRetreatHex } from './retreat';
import type { Unit } from './types';

export type MoraleResult = {
	unitId: string;
	remainingSP: number;
	maxSP: number;
	basePassChance: number;
	eliteModifier: number;
	leaderModifier: number;
	outOfCommandModifier: number;
	finalPassChance: number;
	roll: number;
	passed: boolean;
	retreatTo: OffsetCoordinates | null;
	additionalDamage: 0 | 1;
};

const MODIFIER_STEP = 0.15;

function clamp01(value: number): number {
	if (value < 0) return 0;
	if (value > 1) return 1;
	return value;
}

/**
 * Per rules §9. Caller must invoke with post-trigger state: `unit` and `units`
 * already reflect the SP reduction (and any coordinate change) from the
 * triggering hit. Caller must skip this entirely when `unit.strengthPoints <= 0`.
 *
 * Pass: hold position. Fail: retreat 1 hex via getRetreatHex AND take +1 SP;
 * if no legal retreat hex exists, take +1 SP without moving. No cascading —
 * the +1 SP never triggers another morale check.
 */
export function checkMorale(
	unit: Unit,
	attackerOrigin: OffsetCoordinates,
	grid: Grid<HexCell>,
	units: readonly Unit[],
	opts: { leaderAttached: boolean; outOfCommand: boolean },
	rng: () => number
): MoraleResult {
	const basePassChance = unit.strengthPoints / unit.maxStrengthPoints;
	const eliteModifier = unit.elite ? MODIFIER_STEP : 0;
	const leaderModifier = opts.leaderAttached ? MODIFIER_STEP : 0;
	const outOfCommandModifier = opts.outOfCommand ? -MODIFIER_STEP : 0;
	const finalPassChance = clamp01(
		basePassChance + eliteModifier + leaderModifier + outOfCommandModifier
	);
	const roll = rng();
	const passed = roll < finalPassChance;

	if (passed) {
		return {
			unitId: unit.id,
			remainingSP: unit.strengthPoints,
			maxSP: unit.maxStrengthPoints,
			basePassChance,
			eliteModifier,
			leaderModifier,
			outOfCommandModifier,
			finalPassChance,
			roll,
			passed: true,
			retreatTo: null,
			additionalDamage: 0
		};
	}

	const retreatTo = getRetreatHex(unit, attackerOrigin, grid, units);
	return {
		unitId: unit.id,
		remainingSP: unit.strengthPoints,
		maxSP: unit.maxStrengthPoints,
		basePassChance,
		eliteModifier,
		leaderModifier,
		outOfCommandModifier,
		finalPassChance,
		roll,
		passed: false,
		retreatTo,
		additionalDamage: 1
	};
}
