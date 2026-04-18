import { HexFacing } from './types';
import type { FacingZone } from './types';

// Maps a HexFacing to its 0-based clockwise index (N=0, NE=1, SE=2, S=3, SW=4, NW=5)
function facingToIndex(facing: HexFacing): number {
	return facing / 60;
}

// Maps a 0-based clockwise index back to a HexFacing, with wrapping
function indexToFacing(index: number): HexFacing {
	return (((index % 6) + 6) % 6 * 60) as HexFacing;
}

/**
 * Returns the 3 front hexside directions for a given unit facing.
 * Front arc = the faced hexside plus one step clockwise and one step counter-clockwise.
 */
export function getFrontHexsides(facing: HexFacing): HexFacing[] {
	const idx = facingToIndex(facing);
	return [indexToFacing(idx), indexToFacing(idx + 1), indexToFacing(idx - 1)];
}

/**
 * Returns the 3 rear hexside directions for a given unit facing.
 * Rear arc = the 3 hexsides not in the front arc.
 */
export function getRearHexsides(facing: HexFacing): HexFacing[] {
	const idx = facingToIndex(facing);
	return [indexToFacing(idx + 3), indexToFacing(idx + 2), indexToFacing(idx + 4)];
}

/**
 * Classifies an incoming direction as 'front' or 'rear' relative to a unit's facing.
 *
 * Pass allAround=true for units with no facing (Light Infantry) or units in a Town hex —
 * they have 360° coverage and every direction is treated as front.
 */
export function getZone(unitFacing: HexFacing, direction: HexFacing, allAround: boolean): FacingZone {
	if (allAround) return 'front';
	return getFrontHexsides(unitFacing).includes(direction) ? 'front' : 'rear';
}

/**
 * Rotates a facing by the given number of clockwise steps.
 * Negative steps rotate counter-clockwise. Wraps correctly.
 */
export function rotateFacing(facing: HexFacing, steps: number): HexFacing {
	return indexToFacing(facingToIndex(facing) + steps);
}

/**
 * Returns the minimum number of 60° rotation steps between two facings (0–3).
 * Always takes the shorter arc regardless of direction.
 */
export function facingStepsBetween(from: HexFacing, to: HexFacing): number {
	const diff = Math.abs(facingToIndex(to) - facingToIndex(from));
	return Math.min(diff, 6 - diff);
}
