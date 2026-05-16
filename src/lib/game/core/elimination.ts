import type { Leader } from './command';
import type { Unit } from './types';

export type EliminationResult = {
	eliminatedUnitIds: string[];
	eliminatedLeaderIds: string[];
};

/**
 * Per rules §10. Pure: does not mutate inputs.
 *
 * - A unit with strengthPoints ≤ 0 is removed.
 * - A leader whose attached unit no longer exists in the surviving set is
 *   removed with NO replacement (distinct from §8.3 casualty replacement,
 *   which `resolveLeaderCasualty` handles separately).
 *
 * Iteration order of returned arrays matches input iteration order so callers
 * can rely on deterministic ordering for tests. Idempotent: a clean state in
 * yields a clean state out with empty id lists.
 */
export function applyEliminations(
	units: readonly Unit[],
	leaders: readonly Leader[]
): { units: Unit[]; leaders: Leader[]; result: EliminationResult } {
	const eliminatedUnitIds: string[] = [];
	const survivingUnits: Unit[] = [];
	for (const u of units) {
		if (u.strengthPoints <= 0) {
			eliminatedUnitIds.push(u.id);
		} else {
			survivingUnits.push(u);
		}
	}

	const survivingUnitIds = new Set(survivingUnits.map((u) => u.id));
	const eliminatedLeaderIds: string[] = [];
	const survivingLeaders: Leader[] = [];
	for (const l of leaders) {
		if (!survivingUnitIds.has(l.attachedToUnitId)) {
			eliminatedLeaderIds.push(l.id);
		} else {
			survivingLeaders.push(l);
		}
	}

	return {
		units: survivingUnits,
		leaders: survivingLeaders,
		result: { eliminatedUnitIds, eliminatedLeaderIds }
	};
}
