import { describe, it, expect } from 'vitest';
import { UnitType, type Unit } from '../core/types';
import { counterPrimitives, dashedRectSegments, spAnchor, SIZE, type Primitive } from './counters';
import { hexToRgb } from './terrainStyle';

const BLUE = hexToRgb('#1a56db');
const RED = hexToRgb('#e02424');
const GOLD = hexToRgb('#ffd700');

function makeUnit(type: UnitType, player: 0 | 1): Unit {
	return {
		id: `${type}-${player}`,
		type,
		player,
		coordinates: { col: 0, row: 0 },
		strengthPoints: 4,
		maxStrengthPoints: 4,
		selected: false,
		movementPointsUsed: 0,
		firedThisActivation: false,
		activated: false,
		elite: false
	};
}

const ALL_TYPES = Object.values(UnitType);

/** First primitive is always the player-colored base box. */
const base = (prims: Primitive[]) => prims[0];
const lines = (prims: Primitive[]) => prims.filter((p) => p.kind === 'line');
const ellipses = (prims: Primitive[]) => prims.filter((p) => p.kind === 'ellipse');

describe('counterPrimitives', () => {
	it('every unit type produces a non-empty list whose base is a poly', () => {
		for (const type of ALL_TYPES) {
			const prims = counterPrimitives(makeUnit(type, 0), false);
			expect(prims.length).toBeGreaterThan(0);
			expect(base(prims).kind).toBe('poly');
		}
	});

	it('base fill encodes player color (0=blue, 1=red)', () => {
		const blue = base(counterPrimitives(makeUnit(UnitType.HORSE, 0), false));
		const red = base(counterPrimitives(makeUnit(UnitType.HORSE, 1), false));
		if (blue.kind === 'poly') expect(blue.fill).toEqual(BLUE);
		if (red.kind === 'poly') expect(red.fill).toEqual(RED);
	});

	it('selection adds a gold stroke to the base; unselected has none', () => {
		const selected = base(counterPrimitives(makeUnit(UnitType.HORSE, 0), true));
		expect(selected.kind).toBe('poly');
		if (selected.kind === 'poly') {
			expect(selected.stroke).toEqual(GOLD);
			expect(selected.lineWidth).toBeGreaterThan(0);
		}
		const plain = base(counterPrimitives(makeUnit(UnitType.HORSE, 0), false));
		if (plain.kind === 'poly') {
			expect(plain.stroke).toBeUndefined();
			expect(plain.lineWidth).toBe(0);
		}
	});

	it('infantry types carry two diagonals (X)', () => {
		for (const type of [UnitType.LINE_INFANTRY, UnitType.LIGHT_INFANTRY]) {
			const prims = counterPrimitives(makeUnit(type, 0), false);
			// Two of the line primitives are full corner-to-corner diagonals.
			const diagonals = lines(prims).filter((l) => {
				if (l.kind !== 'line') return false;
				return Math.abs(l.a.x) === Math.abs(l.b.x) && l.a.x === -l.b.x && l.a.y === -l.b.y;
			});
			expect(diagonals.length).toBe(2);
		}
	});

	it('cavalry types carry one diagonal (/), horse adds a midline', () => {
		const lightHorse = counterPrimitives(makeUnit(UnitType.LIGHT_HORSE, 0), false);
		const horse = counterPrimitives(makeUnit(UnitType.HORSE, 0), false);
		// Horse has exactly one more line (the midline) than light horse.
		expect(lines(horse).length).toBe(lines(lightHorse).length + 1);
	});

	it('dragoons and artillery have a player-colored filled center circle', () => {
		for (const [type, color] of [
			[UnitType.DRAGOONS, BLUE],
			[UnitType.ARTILLERY, BLUE]
		] as const) {
			const circles = ellipses(counterPrimitives(makeUnit(type, 0), false));
			expect(circles.length).toBe(1);
			if (circles[0].kind === 'ellipse') expect(circles[0].fill).toEqual(color);
		}
	});

	it('light infantry uses a dashed border (more line primitives than line infantry)', () => {
		const light = counterPrimitives(makeUnit(UnitType.LIGHT_INFANTRY, 0), false);
		const line = counterPrimitives(makeUnit(UnitType.LINE_INFANTRY, 0), false);
		expect(lines(light).length).toBeGreaterThan(lines(line).length);
	});
});

describe('dashedRectSegments', () => {
	it('every segment endpoint lies on the box perimeter', () => {
		const half = 28;
		const segments = dashedRectSegments(half, 8, 4);
		expect(segments.length).toBeGreaterThan(0);
		for (const [a, b] of segments) {
			for (const p of [a, b]) {
				const onPerimeter =
					Math.abs(Math.abs(p.x) - half) < 1e-9 || Math.abs(Math.abs(p.y) - half) < 1e-9;
				expect(onPerimeter).toBe(true);
				expect(Math.abs(p.x)).toBeLessThanOrEqual(half + 1e-9);
				expect(Math.abs(p.y)).toBeLessThanOrEqual(half + 1e-9);
			}
		}
	});

	it('tiles each of the 4 edges by ceil(edgeLength / (dash+gap))', () => {
		const half = 28;
		const dash = 8;
		const gap = 4;
		const perEdge = Math.ceil((2 * half) / (dash + gap));
		expect(dashedRectSegments(half, dash, gap).length).toBe(perEdge * 4);
	});
});

describe('spAnchor', () => {
	it('sits in the lower-right quadrant inside the counter', () => {
		const a = spAnchor();
		expect(a.x).toBeGreaterThan(0);
		expect(a.y).toBeGreaterThan(0);
		expect(a.x).toBeLessThan(SIZE / 2);
		expect(a.y).toBeLessThan(SIZE / 2);
	});
});
