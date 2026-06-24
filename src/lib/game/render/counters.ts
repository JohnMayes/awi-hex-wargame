import { UnitType, type Unit } from '../core/types';
import { hexToRgb, type Rgb } from './terrainStyle';

/**
 * Unit-counter geometry — the NATO symbols for the six unit types. Pure and
 * engine-free (no `littlejsengine` import) so it is unit-tested in Node and stays
 * SSR-safe; `engine.ts` is the sole consumer and turns these primitives into
 * LittleJS draw calls.
 *
 * Coordinates are in **counter-local pixel space**: origin at the counter
 * center, Y-down (the same convention as honeycomb pixel space), so `engine.ts`'s
 * existing `toWorld()` Y-flip renders them upright. `engine.ts` offsets every
 * point by the unit's board pixel position before flipping.
 */

export type Vec = { x: number; y: number };

/** A renderer-neutral draw instruction. `engine.ts` maps each to a LittleJS call. */
export type Primitive =
	| { kind: 'poly'; points: Vec[]; fill?: Rgb; lineWidth?: number; stroke?: Rgb }
	| { kind: 'line'; a: Vec; b: Vec; width: number; color: Rgb }
	| {
			kind: 'ellipse';
			center: Vec;
			diameter: number;
			fill?: Rgb;
			lineWidth?: number;
			stroke?: Rgb;
	  };

/** Counter dimensions: 80px square; fits the 120×104px flat-top hex. */
export const SIZE = 80;
const HALF = SIZE / 2;
const SYM_HALF = 28; // NATO symbol box half-extent, leaving a margin inside the counter
const SYM_WIDTH = 3; // symbol stroke width (world/pixel units)
const SELECTED_WIDTH = 2.5; // gold selection outline width
const CIRCLE_DIAMETER = 28; // dragoons/artillery center circle

// Player counter base colors.
const PLAYER_FILL: Rgb[] = [hexToRgb('#1a56db'), hexToRgb('#e02424')]; // [blue, red]
const SELECTED_STROKE = hexToRgb('#ffd700'); // gold
const SYMBOL_STROKE = hexToRgb('#010203');

/** Local point for the SP label (lower-right corner inside the counter). */
export function spAnchor(): Vec {
	return { x: HALF - 10, y: HALF - 6 };
}

/** Four corners of a box centered at the origin, walked TL→TR→BR→BL (Y-down). */
function boxCorners(half: number): Vec[] {
	return [
		{ x: -half, y: -half },
		{ x: half, y: -half },
		{ x: half, y: half },
		{ x: -half, y: half }
	];
}

/**
 * Tile a box outline (half-extent `half`) into dashed line segments — LittleJS
 * has no dash support, so the light-infantry border is drawn as discrete dashes.
 * Each edge is tiled independently; every returned point lies on the perimeter.
 */
export function dashedRectSegments(half: number, dash: number, gap: number): [Vec, Vec][] {
	const corners = boxCorners(half);
	const step = dash + gap;
	const segments: [Vec, Vec][] = [];
	for (let i = 0; i < 4; i++) {
		const start = corners[i];
		const end = corners[(i + 1) % 4];
		const dx = end.x - start.x;
		const dy = end.y - start.y;
		const len = Math.hypot(dx, dy);
		const ux = dx / len;
		const uy = dy / len;
		for (let t = 0; t < len; t += step) {
			const d = Math.min(dash, len - t);
			segments.push([
				{ x: start.x + ux * t, y: start.y + uy * t },
				{ x: start.x + ux * (t + d), y: start.y + uy * (t + d) }
			]);
		}
	}
	return segments;
}

/** A solid symbol-box outline as a closed, unfilled poly. */
function symbolBox(): Primitive {
	return {
		kind: 'poly',
		points: boxCorners(SYM_HALF),
		lineWidth: SYM_WIDTH,
		stroke: SYMBOL_STROKE
	};
}

/** A symbol stroke line between two corners of the symbol box. */
function symbolLine(a: Vec, b: Vec): Primitive {
	return { kind: 'line', a, b, width: SYM_WIDTH, color: SYMBOL_STROKE };
}

// Symbol-box corners (Y-down).
const TL = { x: -SYM_HALF, y: -SYM_HALF };
const TR = { x: SYM_HALF, y: -SYM_HALF };
const BL = { x: -SYM_HALF, y: SYM_HALF };
const BR = { x: SYM_HALF, y: SYM_HALF };

const diagBackslash = () => symbolLine(TL, BR); // "\"
const diagSlash = () => symbolLine(BL, TR); // "/"
const midline = () => symbolLine({ x: -SYM_HALF, y: 0 }, { x: SYM_HALF, y: 0 });
const centerCircle = (fill: Rgb): Primitive => ({
	kind: 'ellipse',
	center: { x: 0, y: 0 },
	diameter: CIRCLE_DIAMETER,
	fill
});

/**
 * Build the full primitive list for a unit's counter: the player-colored base
 * (gold outline when selected), then the NATO symbol for its type.
 */
export function counterPrimitives(unit: Unit, selected: boolean): Primitive[] {
	const fill = PLAYER_FILL[unit.player];
	const base: Primitive = {
		kind: 'poly',
		points: boxCorners(HALF),
		fill,
		lineWidth: selected ? SELECTED_WIDTH : 0,
		stroke: selected ? SELECTED_STROKE : undefined
	};

	const symbol: Primitive[] = [];
	switch (unit.type) {
		case UnitType.LINE_INFANTRY:
			symbol.push(symbolBox(), diagBackslash(), diagSlash());
			break;
		case UnitType.LIGHT_INFANTRY:
			for (const [a, b] of dashedRectSegments(SYM_HALF, 8, 4)) symbol.push(symbolLine(a, b));
			symbol.push(diagBackslash(), diagSlash());
			break;
		case UnitType.DRAGOONS:
			symbol.push(symbolBox(), diagSlash(), centerCircle(fill));
			break;
		case UnitType.LIGHT_HORSE:
			symbol.push(symbolBox(), diagSlash());
			break;
		case UnitType.HORSE:
			symbol.push(symbolBox(), diagSlash(), midline());
			break;
		case UnitType.ARTILLERY:
			symbol.push(symbolBox(), centerCircle(fill));
			break;
	}

	return [base, ...symbol];
}
