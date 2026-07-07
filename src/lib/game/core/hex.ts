import type { OffsetCoordinates } from 'honeycomb-grid';
import { defineHex, Orientation } from 'honeycomb-grid';
import { TerrainType, type MapEdge } from './types';

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
	// Direction indices (0..5) of this hex's edges a river runs along — a hex-side
	// feature (not a terrain type) that blocks movement/charge/retreat across the
	// edge (see `riverBlocks`) but has no effect on LOS or combat. Authored
	// symmetrically like roads; a crossing on the same edge (below) makes it passable.
	riverEdges: ReadonlySet<number> = new Set();
	// Direction indices (0..5) of river edges that carry a bridge or ford — the
	// crossing exception that makes an otherwise-impassable river edge passable.
	// Bridge vs ford is a rendering-only distinction; both cross identically.
	crossingEdges: ReadonlySet<number> = new Set();
	// When set, this hex is an intentional board exit: a unit may leave the map from
	// here, counting toward the `exit_units` victory condition for this edge. An
	// explicit declaration (map data) — deliberately independent of roads.
	exitEdge: MapEdge | null = null;

	get elevation(): number {
		return this.terrain === TerrainType.HILLTOP ? 1 : 0;
	}

	static create(
		config: OffsetCoordinates & {
			terrain: TerrainType;
			entrenchedEdges?: readonly number[];
			roadEdges?: readonly number[];
			riverEdges?: readonly number[];
			crossingEdges?: readonly number[];
			exitEdge?: MapEdge | null;
		}
	) {
		const cell = new HexCell(config);
		cell.terrain = config.terrain;
		if (config.entrenchedEdges?.length) cell.entrenchedEdges = new Set(config.entrenchedEdges);
		if (config.roadEdges?.length) cell.roadEdges = new Set(config.roadEdges);
		if (config.riverEdges?.length) cell.riverEdges = new Set(config.riverEdges);
		if (config.crossingEdges?.length) cell.crossingEdges = new Set(config.crossingEdges);
		if (config.exitEdge) cell.exitEdge = config.exitEdge;
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

/**
 * True when a step from adjacent `from` to `to` is blocked by a river on their
 * shared edge — i.e. both hexes list the edge as a river and neither lists it as
 * a crossing (bridge/ford). Uses the same reciprocal `(d + 3) % 6` pairing as
 * `roadConnects`, so a half-authored river never blocks. The single gate for
 * movement, charge, and retreat; rivers do not affect LOS or combat.
 */
export function riverBlocks(from: HexCell, to: HexCell): boolean {
	const d = edgeToward(from, to);
	const r = (d + 3) % 6;
	if (!(from.riverEdges.has(d) && to.riverEdges.has(r))) return false;
	return !(from.crossingEdges.has(d) && to.crossingEdges.has(r));
}

/**
 * Build a `roadEdges` map (offset-coord `"col,row"` key → sorted edge direction
 * indices) from ordered hex paths — so a road is authored as the sequence of hexes
 * it runs through, not as hand-computed per-hex edge indices. For each consecutive
 * pair the shared edge is derived with `edgeToward` and recorded on *both* hexes
 * (the reciprocity `roadConnects` requires); a step between non-adjacent hexes
 * throws, catching a path typo at load rather than as a silently broken road.
 *
 * Off-board waypoints (those failing `inBounds`) are allowed and drop out as keys —
 * prefix a path with the hex just past the border to author a road running off the
 * map edge (e.g. `{ col, row: -1 }` before the top-row hex → a north-exit stub on
 * that hex). Does not check terrain: a road overlays whatever terrain it crosses.
 */
export function roadEdgesFromPaths(
	paths: readonly (readonly OffsetCoordinates[])[],
	inBounds: (c: OffsetCoordinates) => boolean
): Record<string, readonly number[]> {
	const edges = new Map<string, Set<number>>();
	const record = (c: OffsetCoordinates, edge: number) => {
		if (!inBounds(c)) return;
		const key = `${c.col},${c.row}`;
		(edges.get(key) ?? edges.set(key, new Set()).get(key)!).add(edge);
	};
	for (const path of paths)
		for (let i = 0; i < path.length - 1; i++) {
			const from = new HexCell(path[i]);
			const to = new HexCell(path[i + 1]);
			if (hexDistance(from, to) !== 1)
				throw new Error(
					`roadEdgesFromPaths: ${from.col},${from.row} and ${to.col},${to.row} are not adjacent`
				);
			record(path[i], edgeToward(from, to));
			record(path[i + 1], edgeToward(to, from));
		}
	return Object.fromEntries([...edges].map(([key, set]) => [key, [...set].sort((a, b) => a - b)]));
}

/**
 * Build a river/crossing edge map (offset-coord `"col,row"` key → sorted edge
 * direction indices) from `[west, east]` hex pairs straddling the river. A river
 * runs *between* two hexes (unlike a road, which runs *through* a hex's center),
 * so it is authored as the adjacent pairs the water separates: for each pair the
 * shared edge is derived with `edgeToward` and recorded reciprocally on both
 * hexes (the pairing `riverBlocks` requires). Non-adjacent pairs throw, and
 * off-board hexes (failing `inBounds`) drop out — mirrors `roadEdgesFromPaths`.
 */
export function riverEdgesFromPairs(
	pairs: readonly (readonly [OffsetCoordinates, OffsetCoordinates])[],
	inBounds: (c: OffsetCoordinates) => boolean
): Record<string, readonly number[]> {
	const edges = new Map<string, Set<number>>();
	const record = (c: OffsetCoordinates, edge: number) => {
		if (!inBounds(c)) return;
		const key = `${c.col},${c.row}`;
		(edges.get(key) ?? edges.set(key, new Set()).get(key)!).add(edge);
	};
	for (const [a, b] of pairs) {
		const from = new HexCell(a);
		const to = new HexCell(b);
		if (hexDistance(from, to) !== 1)
			throw new Error(
				`riverEdgesFromPairs: ${a.col},${a.row} and ${b.col},${b.row} are not adjacent`
			);
		record(a, edgeToward(from, to));
		record(b, edgeToward(to, from));
	}
	return Object.fromEntries([...edges].map(([key, set]) => [key, [...set].sort((x, y) => x - y)]));
}
