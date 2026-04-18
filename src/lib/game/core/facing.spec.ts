import { describe, expect, it } from 'vitest';
import {
	facingStepsBetween,
	getFrontHexsides,
	getRearHexsides,
	getZone,
	rotateFacing
} from './facing';
import { HexFacing } from './types';

// Zone truth table (derived from flat-top hexside geometry, clockwise from N):
// Facing N  → front: N, NE, NW   | rear: S, SE, SW
// Facing NE → front: NE, SE, N   | rear: SW, S, NW
// Facing SE → front: SE, S, NE   | rear: NW, SW, N
// Facing S  → front: S, SW, SE   | rear: N, NW, NE
// Facing SW → front: SW, NW, S   | rear: NE, N, SE
// Facing NW → front: NW, N, SW   | rear: SE, NE, S

describe('getFrontHexsides', () => {
	describe('facing N', () => {
		it('includes N (the faced hexside)', () => {
			expect.assertions(1);
			expect(getFrontHexsides(HexFacing.N)).toContain(HexFacing.N);
		});
		it('includes NE (one step CW)', () => {
			expect.assertions(1);
			expect(getFrontHexsides(HexFacing.N)).toContain(HexFacing.NE);
		});
		it('includes NW (one step CCW)', () => {
			expect.assertions(1);
			expect(getFrontHexsides(HexFacing.N)).toContain(HexFacing.NW);
		});
		it('excludes S', () => {
			expect.assertions(1);
			expect(getFrontHexsides(HexFacing.N)).not.toContain(HexFacing.S);
		});
		it('excludes SE', () => {
			expect.assertions(1);
			expect(getFrontHexsides(HexFacing.N)).not.toContain(HexFacing.SE);
		});
		it('excludes SW', () => {
			expect.assertions(1);
			expect(getFrontHexsides(HexFacing.N)).not.toContain(HexFacing.SW);
		});
		it('returns exactly 3 hexsides', () => {
			expect.assertions(1);
			expect(getFrontHexsides(HexFacing.N)).toHaveLength(3);
		});
	});

	describe('facing NE', () => {
		it('includes NE (the faced hexside)', () => {
			expect.assertions(1);
			expect(getFrontHexsides(HexFacing.NE)).toContain(HexFacing.NE);
		});
		it('includes SE (one step CW)', () => {
			expect.assertions(1);
			expect(getFrontHexsides(HexFacing.NE)).toContain(HexFacing.SE);
		});
		it('includes N (one step CCW)', () => {
			expect.assertions(1);
			expect(getFrontHexsides(HexFacing.NE)).toContain(HexFacing.N);
		});
		it('excludes SW', () => {
			expect.assertions(1);
			expect(getFrontHexsides(HexFacing.NE)).not.toContain(HexFacing.SW);
		});
		it('excludes S', () => {
			expect.assertions(1);
			expect(getFrontHexsides(HexFacing.NE)).not.toContain(HexFacing.S);
		});
		it('excludes NW', () => {
			expect.assertions(1);
			expect(getFrontHexsides(HexFacing.NE)).not.toContain(HexFacing.NW);
		});
	});

	describe('facing SE', () => {
		it('includes SE (the faced hexside)', () => {
			expect.assertions(1);
			expect(getFrontHexsides(HexFacing.SE)).toContain(HexFacing.SE);
		});
		it('includes S (one step CW)', () => {
			expect.assertions(1);
			expect(getFrontHexsides(HexFacing.SE)).toContain(HexFacing.S);
		});
		it('includes NE (one step CCW)', () => {
			expect.assertions(1);
			expect(getFrontHexsides(HexFacing.SE)).toContain(HexFacing.NE);
		});
		it('excludes NW', () => {
			expect.assertions(1);
			expect(getFrontHexsides(HexFacing.SE)).not.toContain(HexFacing.NW);
		});
		it('excludes SW', () => {
			expect.assertions(1);
			expect(getFrontHexsides(HexFacing.SE)).not.toContain(HexFacing.SW);
		});
		it('excludes N', () => {
			expect.assertions(1);
			expect(getFrontHexsides(HexFacing.SE)).not.toContain(HexFacing.N);
		});
	});

	describe('facing S', () => {
		it('includes S (the faced hexside)', () => {
			expect.assertions(1);
			expect(getFrontHexsides(HexFacing.S)).toContain(HexFacing.S);
		});
		it('includes SW (one step CW)', () => {
			expect.assertions(1);
			expect(getFrontHexsides(HexFacing.S)).toContain(HexFacing.SW);
		});
		it('includes SE (one step CCW)', () => {
			expect.assertions(1);
			expect(getFrontHexsides(HexFacing.S)).toContain(HexFacing.SE);
		});
		it('excludes N', () => {
			expect.assertions(1);
			expect(getFrontHexsides(HexFacing.S)).not.toContain(HexFacing.N);
		});
		it('excludes NW', () => {
			expect.assertions(1);
			expect(getFrontHexsides(HexFacing.S)).not.toContain(HexFacing.NW);
		});
		it('excludes NE', () => {
			expect.assertions(1);
			expect(getFrontHexsides(HexFacing.S)).not.toContain(HexFacing.NE);
		});
	});

	describe('facing SW', () => {
		it('includes SW (the faced hexside)', () => {
			expect.assertions(1);
			expect(getFrontHexsides(HexFacing.SW)).toContain(HexFacing.SW);
		});
		it('includes NW (one step CW)', () => {
			expect.assertions(1);
			expect(getFrontHexsides(HexFacing.SW)).toContain(HexFacing.NW);
		});
		it('includes S (one step CCW)', () => {
			expect.assertions(1);
			expect(getFrontHexsides(HexFacing.SW)).toContain(HexFacing.S);
		});
		it('excludes NE', () => {
			expect.assertions(1);
			expect(getFrontHexsides(HexFacing.SW)).not.toContain(HexFacing.NE);
		});
		it('excludes N', () => {
			expect.assertions(1);
			expect(getFrontHexsides(HexFacing.SW)).not.toContain(HexFacing.N);
		});
		it('excludes SE', () => {
			expect.assertions(1);
			expect(getFrontHexsides(HexFacing.SW)).not.toContain(HexFacing.SE);
		});
	});

	describe('facing NW', () => {
		it('includes NW (the faced hexside)', () => {
			expect.assertions(1);
			expect(getFrontHexsides(HexFacing.NW)).toContain(HexFacing.NW);
		});
		it('includes N (one step CW, wraps from idx 5 → 0)', () => {
			expect.assertions(1);
			expect(getFrontHexsides(HexFacing.NW)).toContain(HexFacing.N);
		});
		it('includes SW (one step CCW)', () => {
			expect.assertions(1);
			expect(getFrontHexsides(HexFacing.NW)).toContain(HexFacing.SW);
		});
		it('excludes SE', () => {
			expect.assertions(1);
			expect(getFrontHexsides(HexFacing.NW)).not.toContain(HexFacing.SE);
		});
		it('excludes NE', () => {
			expect.assertions(1);
			expect(getFrontHexsides(HexFacing.NW)).not.toContain(HexFacing.NE);
		});
		it('excludes S', () => {
			expect.assertions(1);
			expect(getFrontHexsides(HexFacing.NW)).not.toContain(HexFacing.S);
		});
	});
});

describe('getRearHexsides', () => {
	describe('facing N', () => {
		it('includes S (directly opposite)', () => {
			expect.assertions(1);
			expect(getRearHexsides(HexFacing.N)).toContain(HexFacing.S);
		});
		it('includes SE (two steps CW)', () => {
			expect.assertions(1);
			expect(getRearHexsides(HexFacing.N)).toContain(HexFacing.SE);
		});
		it('includes SW (two steps CCW)', () => {
			expect.assertions(1);
			expect(getRearHexsides(HexFacing.N)).toContain(HexFacing.SW);
		});
		it('excludes N', () => {
			expect.assertions(1);
			expect(getRearHexsides(HexFacing.N)).not.toContain(HexFacing.N);
		});
		it('excludes NE', () => {
			expect.assertions(1);
			expect(getRearHexsides(HexFacing.N)).not.toContain(HexFacing.NE);
		});
		it('excludes NW', () => {
			expect.assertions(1);
			expect(getRearHexsides(HexFacing.N)).not.toContain(HexFacing.NW);
		});
		it('returns exactly 3 hexsides', () => {
			expect.assertions(1);
			expect(getRearHexsides(HexFacing.N)).toHaveLength(3);
		});
	});

	describe('facing NE', () => {
		it('includes SW (directly opposite)', () => {
			expect.assertions(1);
			expect(getRearHexsides(HexFacing.NE)).toContain(HexFacing.SW);
		});
		it('includes S (two steps CW)', () => {
			expect.assertions(1);
			expect(getRearHexsides(HexFacing.NE)).toContain(HexFacing.S);
		});
		it('includes NW (two steps CCW)', () => {
			expect.assertions(1);
			expect(getRearHexsides(HexFacing.NE)).toContain(HexFacing.NW);
		});
		it('excludes NE', () => {
			expect.assertions(1);
			expect(getRearHexsides(HexFacing.NE)).not.toContain(HexFacing.NE);
		});
		it('excludes SE', () => {
			expect.assertions(1);
			expect(getRearHexsides(HexFacing.NE)).not.toContain(HexFacing.SE);
		});
		it('excludes N', () => {
			expect.assertions(1);
			expect(getRearHexsides(HexFacing.NE)).not.toContain(HexFacing.N);
		});
	});

	describe('facing SE', () => {
		it('includes NW (directly opposite)', () => {
			expect.assertions(1);
			expect(getRearHexsides(HexFacing.SE)).toContain(HexFacing.NW);
		});
		it('includes SW (two steps CW)', () => {
			expect.assertions(1);
			expect(getRearHexsides(HexFacing.SE)).toContain(HexFacing.SW);
		});
		it('includes N (two steps CCW, wraps)', () => {
			expect.assertions(1);
			expect(getRearHexsides(HexFacing.SE)).toContain(HexFacing.N);
		});
		it('excludes SE', () => {
			expect.assertions(1);
			expect(getRearHexsides(HexFacing.SE)).not.toContain(HexFacing.SE);
		});
		it('excludes S', () => {
			expect.assertions(1);
			expect(getRearHexsides(HexFacing.SE)).not.toContain(HexFacing.S);
		});
		it('excludes NE', () => {
			expect.assertions(1);
			expect(getRearHexsides(HexFacing.SE)).not.toContain(HexFacing.NE);
		});
	});

	describe('facing S', () => {
		it('includes N (directly opposite)', () => {
			expect.assertions(1);
			expect(getRearHexsides(HexFacing.S)).toContain(HexFacing.N);
		});
		it('includes NW (two steps CW, wraps)', () => {
			expect.assertions(1);
			expect(getRearHexsides(HexFacing.S)).toContain(HexFacing.NW);
		});
		it('includes NE (two steps CCW)', () => {
			expect.assertions(1);
			expect(getRearHexsides(HexFacing.S)).toContain(HexFacing.NE);
		});
		it('excludes S', () => {
			expect.assertions(1);
			expect(getRearHexsides(HexFacing.S)).not.toContain(HexFacing.S);
		});
		it('excludes SW', () => {
			expect.assertions(1);
			expect(getRearHexsides(HexFacing.S)).not.toContain(HexFacing.SW);
		});
		it('excludes SE', () => {
			expect.assertions(1);
			expect(getRearHexsides(HexFacing.S)).not.toContain(HexFacing.SE);
		});
	});

	describe('facing SW', () => {
		it('includes NE (directly opposite)', () => {
			expect.assertions(1);
			expect(getRearHexsides(HexFacing.SW)).toContain(HexFacing.NE);
		});
		it('includes N (two steps CW, wraps)', () => {
			expect.assertions(1);
			expect(getRearHexsides(HexFacing.SW)).toContain(HexFacing.N);
		});
		it('includes SE (two steps CCW)', () => {
			expect.assertions(1);
			expect(getRearHexsides(HexFacing.SW)).toContain(HexFacing.SE);
		});
		it('excludes SW', () => {
			expect.assertions(1);
			expect(getRearHexsides(HexFacing.SW)).not.toContain(HexFacing.SW);
		});
		it('excludes NW', () => {
			expect.assertions(1);
			expect(getRearHexsides(HexFacing.SW)).not.toContain(HexFacing.NW);
		});
		it('excludes S', () => {
			expect.assertions(1);
			expect(getRearHexsides(HexFacing.SW)).not.toContain(HexFacing.S);
		});
	});

	describe('facing NW', () => {
		it('includes SE (directly opposite)', () => {
			expect.assertions(1);
			expect(getRearHexsides(HexFacing.NW)).toContain(HexFacing.SE);
		});
		it('includes NE (two steps CW)', () => {
			expect.assertions(1);
			expect(getRearHexsides(HexFacing.NW)).toContain(HexFacing.NE);
		});
		it('includes S (two steps CCW)', () => {
			expect.assertions(1);
			expect(getRearHexsides(HexFacing.NW)).toContain(HexFacing.S);
		});
		it('excludes NW', () => {
			expect.assertions(1);
			expect(getRearHexsides(HexFacing.NW)).not.toContain(HexFacing.NW);
		});
		it('excludes N', () => {
			expect.assertions(1);
			expect(getRearHexsides(HexFacing.NW)).not.toContain(HexFacing.N);
		});
		it('excludes SW', () => {
			expect.assertions(1);
			expect(getRearHexsides(HexFacing.NW)).not.toContain(HexFacing.SW);
		});
	});
});

describe('getZone', () => {
	describe('facing N — allAround=false', () => {
		it('N direction → front', () => {
			expect.assertions(1);
			expect(getZone(HexFacing.N, HexFacing.N, false)).toBe('front');
		});
		it('NE direction → front', () => {
			expect.assertions(1);
			expect(getZone(HexFacing.N, HexFacing.NE, false)).toBe('front');
		});
		it('NW direction → front', () => {
			expect.assertions(1);
			expect(getZone(HexFacing.N, HexFacing.NW, false)).toBe('front');
		});
		it('S direction → rear', () => {
			expect.assertions(1);
			expect(getZone(HexFacing.N, HexFacing.S, false)).toBe('rear');
		});
		it('SE direction → rear', () => {
			expect.assertions(1);
			expect(getZone(HexFacing.N, HexFacing.SE, false)).toBe('rear');
		});
		it('SW direction → rear', () => {
			expect.assertions(1);
			expect(getZone(HexFacing.N, HexFacing.SW, false)).toBe('rear');
		});
	});

	describe('facing NE — allAround=false', () => {
		it('NE direction → front', () => {
			expect.assertions(1);
			expect(getZone(HexFacing.NE, HexFacing.NE, false)).toBe('front');
		});
		it('SE direction → front', () => {
			expect.assertions(1);
			expect(getZone(HexFacing.NE, HexFacing.SE, false)).toBe('front');
		});
		it('N direction → front', () => {
			expect.assertions(1);
			expect(getZone(HexFacing.NE, HexFacing.N, false)).toBe('front');
		});
		it('SW direction → rear', () => {
			expect.assertions(1);
			expect(getZone(HexFacing.NE, HexFacing.SW, false)).toBe('rear');
		});
		it('S direction → rear', () => {
			expect.assertions(1);
			expect(getZone(HexFacing.NE, HexFacing.S, false)).toBe('rear');
		});
		it('NW direction → rear', () => {
			expect.assertions(1);
			expect(getZone(HexFacing.NE, HexFacing.NW, false)).toBe('rear');
		});
	});

	describe('facing SE — allAround=false', () => {
		it('SE direction → front', () => {
			expect.assertions(1);
			expect(getZone(HexFacing.SE, HexFacing.SE, false)).toBe('front');
		});
		it('S direction → front', () => {
			expect.assertions(1);
			expect(getZone(HexFacing.SE, HexFacing.S, false)).toBe('front');
		});
		it('NE direction → front', () => {
			expect.assertions(1);
			expect(getZone(HexFacing.SE, HexFacing.NE, false)).toBe('front');
		});
		it('NW direction → rear', () => {
			expect.assertions(1);
			expect(getZone(HexFacing.SE, HexFacing.NW, false)).toBe('rear');
		});
		it('SW direction → rear', () => {
			expect.assertions(1);
			expect(getZone(HexFacing.SE, HexFacing.SW, false)).toBe('rear');
		});
		it('N direction → rear', () => {
			expect.assertions(1);
			expect(getZone(HexFacing.SE, HexFacing.N, false)).toBe('rear');
		});
	});

	describe('facing S — allAround=false', () => {
		it('S direction → front', () => {
			expect.assertions(1);
			expect(getZone(HexFacing.S, HexFacing.S, false)).toBe('front');
		});
		it('SW direction → front', () => {
			expect.assertions(1);
			expect(getZone(HexFacing.S, HexFacing.SW, false)).toBe('front');
		});
		it('SE direction → front', () => {
			expect.assertions(1);
			expect(getZone(HexFacing.S, HexFacing.SE, false)).toBe('front');
		});
		it('N direction → rear', () => {
			expect.assertions(1);
			expect(getZone(HexFacing.S, HexFacing.N, false)).toBe('rear');
		});
		it('NW direction → rear', () => {
			expect.assertions(1);
			expect(getZone(HexFacing.S, HexFacing.NW, false)).toBe('rear');
		});
		it('NE direction → rear', () => {
			expect.assertions(1);
			expect(getZone(HexFacing.S, HexFacing.NE, false)).toBe('rear');
		});
	});

	describe('facing SW — allAround=false', () => {
		it('SW direction → front', () => {
			expect.assertions(1);
			expect(getZone(HexFacing.SW, HexFacing.SW, false)).toBe('front');
		});
		it('NW direction → front', () => {
			expect.assertions(1);
			expect(getZone(HexFacing.SW, HexFacing.NW, false)).toBe('front');
		});
		it('S direction → front', () => {
			expect.assertions(1);
			expect(getZone(HexFacing.SW, HexFacing.S, false)).toBe('front');
		});
		it('NE direction → rear', () => {
			expect.assertions(1);
			expect(getZone(HexFacing.SW, HexFacing.NE, false)).toBe('rear');
		});
		it('N direction → rear', () => {
			expect.assertions(1);
			expect(getZone(HexFacing.SW, HexFacing.N, false)).toBe('rear');
		});
		it('SE direction → rear', () => {
			expect.assertions(1);
			expect(getZone(HexFacing.SW, HexFacing.SE, false)).toBe('rear');
		});
	});

	describe('facing NW — allAround=false', () => {
		it('NW direction → front', () => {
			expect.assertions(1);
			expect(getZone(HexFacing.NW, HexFacing.NW, false)).toBe('front');
		});
		it('N direction → front (CW wrap)', () => {
			expect.assertions(1);
			expect(getZone(HexFacing.NW, HexFacing.N, false)).toBe('front');
		});
		it('SW direction → front', () => {
			expect.assertions(1);
			expect(getZone(HexFacing.NW, HexFacing.SW, false)).toBe('front');
		});
		it('SE direction → rear', () => {
			expect.assertions(1);
			expect(getZone(HexFacing.NW, HexFacing.SE, false)).toBe('rear');
		});
		it('NE direction → rear', () => {
			expect.assertions(1);
			expect(getZone(HexFacing.NW, HexFacing.NE, false)).toBe('rear');
		});
		it('S direction → rear', () => {
			expect.assertions(1);
			expect(getZone(HexFacing.NW, HexFacing.S, false)).toBe('rear');
		});
	});

	describe('allAround=true overrides facing (Light Infantry / Town)', () => {
		it('facing N, direction S → front', () => {
			expect.assertions(1);
			expect(getZone(HexFacing.N, HexFacing.S, true)).toBe('front');
		});
		it('facing N, direction SE → front', () => {
			expect.assertions(1);
			expect(getZone(HexFacing.N, HexFacing.SE, true)).toBe('front');
		});
		it('facing N, direction SW → front', () => {
			expect.assertions(1);
			expect(getZone(HexFacing.N, HexFacing.SW, true)).toBe('front');
		});
		it('facing S, direction N → front', () => {
			expect.assertions(1);
			expect(getZone(HexFacing.S, HexFacing.N, true)).toBe('front');
		});
		it('facing NE, direction SW → front', () => {
			expect.assertions(1);
			expect(getZone(HexFacing.NE, HexFacing.SW, true)).toBe('front');
		});
		it('facing SW, direction NE → front', () => {
			expect.assertions(1);
			expect(getZone(HexFacing.SW, HexFacing.NE, true)).toBe('front');
		});
	});
});

describe('rotateFacing', () => {
	it('N + 1 step CW → NE', () => {
		expect.assertions(1);
		expect(rotateFacing(HexFacing.N, 1)).toBe(HexFacing.NE);
	});
	it('N + 2 steps CW → SE', () => {
		expect.assertions(1);
		expect(rotateFacing(HexFacing.N, 2)).toBe(HexFacing.SE);
	});
	it('N + 3 steps CW → S', () => {
		expect.assertions(1);
		expect(rotateFacing(HexFacing.N, 3)).toBe(HexFacing.S);
	});
	it('N + 4 steps CW → SW', () => {
		expect.assertions(1);
		expect(rotateFacing(HexFacing.N, 4)).toBe(HexFacing.SW);
	});
	it('N + 5 steps CW → NW', () => {
		expect.assertions(1);
		expect(rotateFacing(HexFacing.N, 5)).toBe(HexFacing.NW);
	});
	it('N + 6 steps CW → N (full circle)', () => {
		expect.assertions(1);
		expect(rotateFacing(HexFacing.N, 6)).toBe(HexFacing.N);
	});
	it('NW + 1 step CW → N (wrap from idx 5 to 0)', () => {
		expect.assertions(1);
		expect(rotateFacing(HexFacing.NW, 1)).toBe(HexFacing.N);
	});
	it('N + (-1) step CCW → NW', () => {
		expect.assertions(1);
		expect(rotateFacing(HexFacing.N, -1)).toBe(HexFacing.NW);
	});
	it('N + (-2) steps CCW → SW', () => {
		expect.assertions(1);
		expect(rotateFacing(HexFacing.N, -2)).toBe(HexFacing.SW);
	});
	it('SE + 0 steps → SE (identity)', () => {
		expect.assertions(1);
		expect(rotateFacing(HexFacing.SE, 0)).toBe(HexFacing.SE);
	});
	it('S + 3 steps CW → N (half circle)', () => {
		expect.assertions(1);
		expect(rotateFacing(HexFacing.S, 3)).toBe(HexFacing.N);
	});
	it('NE + (-1) step CCW → N', () => {
		expect.assertions(1);
		expect(rotateFacing(HexFacing.NE, -1)).toBe(HexFacing.N);
	});
});

describe('facingStepsBetween', () => {
	it('same facing → 0 steps', () => {
		expect.assertions(1);
		expect(facingStepsBetween(HexFacing.N, HexFacing.N)).toBe(0);
	});
	it('N to NE → 1 step', () => {
		expect.assertions(1);
		expect(facingStepsBetween(HexFacing.N, HexFacing.NE)).toBe(1);
	});
	it('NE to N → 1 step (symmetric)', () => {
		expect.assertions(1);
		expect(facingStepsBetween(HexFacing.NE, HexFacing.N)).toBe(1);
	});
	it('N to NW → 1 step (shorter CCW arc)', () => {
		expect.assertions(1);
		expect(facingStepsBetween(HexFacing.N, HexFacing.NW)).toBe(1);
	});
	it('N to SE → 2 steps', () => {
		expect.assertions(1);
		expect(facingStepsBetween(HexFacing.N, HexFacing.SE)).toBe(2);
	});
	it('N to SW → 2 steps (shorter CCW arc via NW)', () => {
		expect.assertions(1);
		expect(facingStepsBetween(HexFacing.N, HexFacing.SW)).toBe(2);
	});
	it('N to S → 3 steps (maximum, directly opposite)', () => {
		expect.assertions(1);
		expect(facingStepsBetween(HexFacing.N, HexFacing.S)).toBe(3);
	});
	it('SE to NW → 3 steps (directly opposite)', () => {
		expect.assertions(1);
		expect(facingStepsBetween(HexFacing.SE, HexFacing.NW)).toBe(3);
	});
	it('NW to NE → 2 steps', () => {
		expect.assertions(1);
		expect(facingStepsBetween(HexFacing.NW, HexFacing.NE)).toBe(2);
	});
	it('SW to NE → 3 steps (directly opposite)', () => {
		expect.assertions(1);
		expect(facingStepsBetween(HexFacing.SW, HexFacing.NE)).toBe(3);
	});
	it('SE to S → 1 step', () => {
		expect.assertions(1);
		expect(facingStepsBetween(HexFacing.SE, HexFacing.S)).toBe(1);
	});
});
