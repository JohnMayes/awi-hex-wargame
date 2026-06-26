import type { OffsetCoordinates } from 'honeycomb-grid';
import { defineHex, Orientation } from 'honeycomb-grid';
import { TerrainType } from './types';

export function coordsEqual(a: OffsetCoordinates, b: OffsetCoordinates): boolean {
	return a.col === b.col && a.row === b.row;
}

export class HexCell extends defineHex({
	dimensions: 60,
	origin: 'topLeft',
	orientation: Orientation.FLAT
}) {
	terrain!: TerrainType;
	// Direction indices (0..5, indexing `directions`) of this hex's edges that are
	// entrenched — a hex-owned, directional terrain feature. It modifies combat for
	// attacks that cross the edge it faces (charge defense + fire cover) but has no
	// effect on movement or LOS. Empty for the vast majority of hexes.
	entrenchedEdges: ReadonlySet<number> = new Set();
	// Direction indices (0..5) of the edges a road crosses in this hex. A road
	// overlays the hex's real terrain (it is not a terrain type): it grants the
	// movement bonus (see `roadConnects`) and renders as a line through the hex
	// center and each edge midpoint. Must be authored symmetrically — if this hex
	// lists the edge toward a neighbor, that neighbor lists the reciprocal edge.
	roadEdges: ReadonlySet<number> = new Set();

	get elevation(): number {
		return this.terrain === TerrainType.HILLTOP ? 1 : 0;
	}

	static create(
		config: OffsetCoordinates & {
			terrain: TerrainType;
			entrenchedEdges?: readonly number[];
			roadEdges?: readonly number[];
		}
	) {
		const cell = new HexCell(config);
		cell.terrain = config.terrain;
		if (config.entrenchedEdges?.length) cell.entrenchedEdges = new Set(config.entrenchedEdges);
		if (config.roadEdges?.length) cell.roadEdges = new Set(config.roadEdges);
		return cell;
	}
}

export const directions = [
	[1, 0],
	[1, -1],
	[0, -1],
	[-1, 0],
	[-1, 1],
	[0, 1]
];

export function getNeighbors(hex: HexCell, map: Map<string, HexCell>): HexCell[] {
	return directions
		.map(([dq, dr]) => map.get(`${hex.q + dq},${hex.r + dr}`))
		.filter(Boolean) as HexCell[];
}

export function hexDistance(a: HexCell, b: HexCell): number {
	return (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2;
}

/**
 * Direction index (0..5, indexing `directions`) of the edge of `from` that faces
 * `toward`: the `directions` step whose cube vector best aligns with the bearing
 * `toward − from`. Exact for adjacent hexes; a sensible front-facing approximation
 * for distant ones. Ties resolve to the lowest index. (Same dot-product alignment
 * as `retreat.ts`'s push scoring — kept standalone rather than shared.)
 */
export function edgeToward(from: HexCell, toward: HexCell): number {
	const bq = toward.q - from.q;
	const br = toward.r - from.r;
	const bs = -bq - br;
	let best = 0;
	let bestScore = -Infinity;
	for (let d = 0; d < 6; d++) {
		const [dq, dr] = directions[d];
		const ds = -dq - dr;
		const score = dq * bq + dr * br + ds * bs;
		if (score > bestScore) {
			bestScore = score;
			best = d;
		}
	}
	return best;
}

/**
 * True when the edge of `defender`'s hex facing `attacker` is entrenched — i.e. an
 * attack from `attacker` crosses `defender`'s works. Directional: an entrenchment
 * only protects the side it faces.
 */
export function isEntrenchedToward(defender: HexCell, attacker: HexCell): boolean {
	return defender.entrenchedEdges.has(edgeToward(defender, attacker));
}

/**
 * True when a road segment crosses the shared edge between adjacent `from` and
 * `to` — i.e. the step is "along the road" for the movement bonus. Requires both
 * hexes to list the shared edge (the edge of `from` facing `to`, and its
 * reciprocal on `to`), so a half-authored road never grants the bonus.
 * `edgeToward` is exact for adjacent hexes.
 */
export function roadConnects(from: HexCell, to: HexCell): boolean {
	const d = edgeToward(from, to);
	return from.roadEdges.has(d) && to.roadEdges.has((d + 3) % 6);
}
