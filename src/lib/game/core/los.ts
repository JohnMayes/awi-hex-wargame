import type { Grid, OffsetCoordinates } from 'honeycomb-grid';
import { HexCell, coordsEqual, hexDistance } from './hex';
import { TerrainType, UnitType, type Unit } from './types';
import { doesTerrainBlockLOS, getTerrainElevation } from './terrain';

type Cube = { q: number; r: number };
type FracCube = { q: number; r: number; s: number };
type Sample = { primary: Cube; alternate: Cube | null };

const cubeKey = (q: number, r: number) => `${q},${r}`;
const offsetKey = (col: number, row: number) => `${col},${row}`;

function cubeRound(frac: FracCube): Cube {
	let q = Math.round(frac.q);
	let r = Math.round(frac.r);
	const s = Math.round(frac.s);
	const dq = Math.abs(q - frac.q);
	const dr = Math.abs(r - frac.r);
	const ds = Math.abs(s - frac.s);
	if (dq > dr && dq > ds) q = -r - s;
	else if (dr > ds) r = -q - s;
	// else: keep q,r; s = -q-r (not returned)
	return { q, r };
}

/**
 * Sample integer-hex points along the cube line from `a` to `b`, excluding the
 * two endpoints. Returns `dist - 1` samples. When the lerped midpoint falls on
 * a hexside (a tie under cube rounding), `alternate` is the other candidate;
 * otherwise it is `null`. Detected by tracing twice with opposite-sign nudges.
 */
function lineSamples(a: HexCell, b: HexCell, dist: number): Sample[] {
	const eps1 = 1e-6;
	const eps2 = 2e-6;
	const out: Sample[] = [];
	for (let i = 1; i < dist; i++) {
		const t = i / dist;
		const traceWith = (sign: number): Cube => {
			const aq = a.q + sign * eps1;
			const ar = a.r + sign * eps2;
			const bq = b.q + sign * eps1;
			const br = b.r + sign * eps2;
			const q = aq + (bq - aq) * t;
			const r = ar + (br - ar) * t;
			return cubeRound({ q, r, s: -q - r });
		};
		const primary = traceWith(+1);
		const alt = traceWith(-1);
		out.push({
			primary,
			alternate: primary.q === alt.q && primary.r === alt.r ? null : alt
		});
	}
	return out;
}

function hexBlocks(
	cube: Cube,
	hexMap: Map<string, HexCell>,
	unitByKey: Map<string, Unit>,
	fromKey: string,
	toKey: string,
	sourceElev: number,
	targetElev: number
): boolean {
	const hex = hexMap.get(cubeKey(cube.q, cube.r));
	if (!hex) return false; // off-map sample doesn't block
	const offKey = offsetKey(hex.col, hex.row);
	if (offKey === fromKey || offKey === toKey) return false;

	if (hex.terrain === TerrainType.HILLTOP) {
		// Hills only block when both endpoints are at lower elevation (rules §7).
		const elev = getTerrainElevation(hex.terrain);
		if (elev > sourceElev && elev > targetElev) return true;
	} else if (doesTerrainBlockLOS(hex.terrain)) {
		return true;
	}

	if (unitByKey.has(offKey)) return true;
	return false;
}

/**
 * Returns true if there is line of sight from `from` to `to` per rules §7.
 * Pure geometry: facing arcs are NOT considered (combat module composes those).
 *
 * Blocks: Woods, Town, intervening units, and Hilltops between two
 * lower-elevation endpoints. Hexside ties are blocked if either candidate
 * blocks. Adjacent hexes always have LOS.
 *
 * Plunging fire exception: an Artillery unit on a Hilltop may see over a
 * single intervening blocker (terrain or unit) at range ≤ 4, provided the
 * blocker is adjacent to either the firer or the target.
 */
export function hasLineOfSight(
	from: OffsetCoordinates,
	to: OffsetCoordinates,
	grid: Grid<HexCell>,
	units: readonly Unit[]
): boolean {
	const fromHex = grid.getHex(from);
	const toHex = grid.getHex(to);
	if (!fromHex || !toHex) return false;

	const dist = hexDistance(fromHex, toHex);
	if (dist <= 1) return true;

	const hexMap = new Map<string, HexCell>();
	for (const hex of grid) hexMap.set(cubeKey(hex.q, hex.r), hex);

	const unitByKey = new Map<string, Unit>();
	for (const u of units) unitByKey.set(offsetKey(u.coordinates.col, u.coordinates.row), u);

	const fromKey = offsetKey(from.col, from.row);
	const toKey = offsetKey(to.col, to.row);
	const sourceElev = getTerrainElevation(fromHex.terrain);
	const targetElev = getTerrainElevation(toHex.terrain);

	const samples = lineSamples(fromHex, toHex, dist);

	let blockers = 0;
	let firstBlockerIndex = -1;
	for (let i = 0; i < samples.length; i++) {
		const { primary, alternate } = samples[i];
		const pBlocked = hexBlocks(primary, hexMap, unitByKey, fromKey, toKey, sourceElev, targetElev);
		const aBlocked =
			alternate !== null
				? hexBlocks(alternate, hexMap, unitByKey, fromKey, toKey, sourceElev, targetElev)
				: false;
		// Tie: blocked if either side blocks (rules §7).
		// Non-tie: alternate is null and aBlocked is false, so this reduces to pBlocked.
		if (pBlocked || aBlocked) {
			blockers += 1;
			if (firstBlockerIndex < 0) firstBlockerIndex = i;
		}
	}

	if (blockers === 0) return true;

	const sourceUnit = units.find((u) => coordsEqual(u.coordinates, from));
	const isPlungingFire =
		sourceUnit?.type === UnitType.ARTILLERY &&
		fromHex.terrain === TerrainType.HILLTOP &&
		dist <= 4 &&
		blockers === 1 &&
		(firstBlockerIndex === 0 || firstBlockerIndex === samples.length - 1);

	return isPlungingFire;
}
