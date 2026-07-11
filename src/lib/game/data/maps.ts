import { TerrainType, type MapEdge } from '../core/types';
import { roadEdgesFromPaths, riverEdgesFromPairs, type HexCell } from '../core/hex';
import type { OffsetCoordinates } from 'honeycomb-grid';

// PREFERRED MAP SIZE: 7 cols × 9 rows (rules §2). Author new scenario maps at this
// size unless there's a strong reason not to — it's the target the UI and playtests
// are tuned for. Larger source maps (e.g. an 8×11 conversion) should be shaved down
// to fit (see White Plains below, and docs/scenario-conversion-guide.md §1).
//
// `entrenchedEdges` / `roadEdges` / `riverEdges` / `crossingEdges` list direction
// indices (0..5, indexing `directions` in core/hex.ts) of this hex's dug-in /
// road-crossed / river / bridge-ford edges — authored as plain arrays, stored as
// Sets on the HexCell. Road and river edges must be authored symmetrically across
// a shared edge (see `roadConnects` / `riverBlocks`). `exitEdge` marks the hex an
// intentional board exit for that edge (see `exit_units`) — independent of roads.
export type MapDefinition = (Pick<HexCell, 'terrain'> &
	OffsetCoordinates & {
		entrenchedEdges?: readonly number[];
		roadEdges?: readonly number[];
		riverEdges?: readonly number[];
		crossingEdges?: readonly number[];
		exitEdge?: MapEdge;
		objective?: boolean;
	})[];

export const TEST_MAP: MapDefinition = [
	{ col: 0, row: 0, terrain: TerrainType.WOODS },
	{ col: 0, row: 1, terrain: TerrainType.OPEN },
	{ col: 0, row: 2, terrain: TerrainType.WOODS },
	{ col: 0, row: 3, terrain: TerrainType.WOODS },
	{ col: 1, row: 0, terrain: TerrainType.OPEN },
	{ col: 1, row: 1, terrain: TerrainType.OPEN },
	{ col: 1, row: 2, terrain: TerrainType.OPEN },
	{ col: 1, row: 3, terrain: TerrainType.OPEN },
	{ col: 2, row: 0, terrain: TerrainType.TOWN },
	{ col: 2, row: 1, terrain: TerrainType.OPEN },
	{ col: 2, row: 2, terrain: TerrainType.HILLTOP },
	{ col: 2, row: 3, terrain: TerrainType.OPEN },
	{ col: 3, row: 0, terrain: TerrainType.OPEN },
	{ col: 3, row: 1, terrain: TerrainType.OPEN },
	{ col: 3, row: 2, terrain: TerrainType.HILLTOP },
	{ col: 3, row: 3, terrain: TerrainType.OPEN },
	{ col: 4, row: 0, terrain: TerrainType.OPEN },
	{ col: 4, row: 1, terrain: TerrainType.OPEN },
	{ col: 4, row: 2, terrain: TerrainType.WOODS },
	{ col: 4, row: 3, terrain: TerrainType.WOODS },
	{ col: 5, row: 0, terrain: TerrainType.OPEN },
	{ col: 5, row: 1, terrain: TerrainType.OPEN },
	{ col: 5, row: 2, terrain: TerrainType.MARSH },
	{ col: 5, row: 3, terrain: TerrainType.OPEN }
];

// Pitched-battle field: 7 columns × 9 rows (rules §2), symmetric about the
// centre under the point reflection (col, row) → (6 - col, 8 - row). Open
// everywhere except a central objective hill and mirrored woods/town cover, so
// neither side is favoured.
const PITCHED_BATTLE_FEATURES: Record<string, TerrainType> = {
	'3,4': TerrainType.HILLTOP, // central objective (self-symmetric)
	'1,4': TerrainType.WOODS, // flank woods (self-symmetric pair)
	'5,4': TerrainType.WOODS,
	'2,2': TerrainType.TOWN, // mirrored towns
	'4,6': TerrainType.TOWN,
	'4,2': TerrainType.WOODS, // mirrored approach woods
	'2,6': TerrainType.WOODS
};

// Entrenched edges by hex "col,row" → edge direction indices (indexing `directions`
// in core/hex.ts). Demo data so the feature is visible/playable: the central hill is
// dug in on two opposite faces, giving a defender there cover + charge-defense against
// attacks crossing those edges. Self-symmetric, so neither side is favoured.
const PITCHED_BATTLE_ENTRENCHMENTS: Record<string, readonly number[]> = {
	'3,4': [2, 5]
};

// Objective markers (cosmetic star): the central objective hill.
const PITCHED_BATTLE_OBJECTIVES = new Set(['3,4']);

export const PITCHED_BATTLE_MAP: MapDefinition = Array.from({ length: 7 }, (_, col) =>
	Array.from({ length: 9 }, (_, row) => ({
		col,
		row,
		terrain: PITCHED_BATTLE_FEATURES[`${col},${row}`] ?? TerrainType.OPEN,
		entrenchedEdges: PITCHED_BATTLE_ENTRENCHMENTS[`${col},${row}`],
		objective: PITCHED_BATTLE_OBJECTIVES.has(`${col},${row}`)
	}))
).flat();

// Bunker Hill (accurate map, 17 June 1775) — 7 cols × 9 rows, north = row 0
// (Causeway / Mystic River), British attack from the south (Boston Harbour, high
// rows). Adapted from the ARW-series map; see docs/bunker-hill-conversion.md.
// Non-OPEN hexes only; everything else is plains. School Hill is woods (accurate
// variant). Charlestown (TOWN) is razable via the scenario torchRule.
const BUNKER_HILL_FEATURES: Record<string, TerrainType> = {
	// Water: Mystic River bay (NE), Boston Harbour (S), harbour shore (SW).
	'0,0': TerrainType.LAKE,
	'6,0': TerrainType.LAKE,
	'6,1': TerrainType.LAKE,
	'6,2': TerrainType.LAKE,
	'0,6': TerrainType.LAKE,
	'0,7': TerrainType.LAKE,
	'0,8': TerrainType.LAKE,
	'1,8': TerrainType.LAKE,
	'5,8': TerrainType.LAKE,
	'6,8': TerrainType.LAKE,
	// Hills: Bunker (upper-centre), Breeds (centre), Moulton's (lower-right).
	'2,1': TerrainType.HILLTOP,
	'3,1': TerrainType.HILLTOP,
	'2,4': TerrainType.HILLTOP,
	'3,4': TerrainType.HILLTOP,
	'4,4': TerrainType.HILLTOP,
	'6,6': TerrainType.HILLTOP,
	'6,7': TerrainType.HILLTOP,
	// Woods: School Hill (left-centre) + scattered stands.
	'0,4': TerrainType.WOODS,
	'2,0': TerrainType.WOODS,
	'5,0': TerrainType.WOODS,
	'1,2': TerrainType.WOODS,
	'4,2': TerrainType.WOODS,
	'2,3': TerrainType.WOODS,
	'5,3': TerrainType.WOODS,
	// Charlestown (razable town), lower-left.
	'1,6': TerrainType.TOWN,
	'1,7': TerrainType.TOWN
};

const BUNKER_HILL_COLS = 7;
const BUNKER_HILL_ROWS = 9;

// Two roads down from the Charlestown Neck (north), one skirting each side of the
// Bunker/Breeds hill spine (the hills were never roaded through), meeting at the
// southern landing (3,8). Authored as the ordered hexes each road runs through;
// roadEdgesFromPaths derives the per-hex edge indices and throws if a step isn't
// adjacent. A leading off-board hex ({ row: -1 }) gives each road its north-edge
// exit stub. A road overlays terrain, so a road hex keeps its own terrain (the
// west road runs through Charlestown town 1,6/1,7).
const rc = (col: number, row: number): OffsetCoordinates => ({ col, row });
const BUNKER_HILL_ROADS = roadEdgesFromPaths(
	[
		// West: north exit -> down col 1 through Charlestown -> east to the landing
		[rc(1, -1), rc(1, 0), rc(1, 1), rc(1, 2), rc(1, 3), rc(1, 4), rc(1, 5), rc(1, 6), rc(1, 7), rc(2, 8), rc(3, 8)], // prettier-ignore
		// East: north exit -> east to col 5 -> down past Moulton's -> west to the landing
		[rc(3, -1), rc(3, 0), rc(4, 1), rc(5, 1), rc(5, 2), rc(5, 3), rc(5, 4), rc(5, 5), rc(5, 6), rc(5, 7), rc(4, 8), rc(3, 8)] // prettier-ignore
	],
	(c) => c.col >= 0 && c.col < BUNKER_HILL_COLS && c.row >= 0 && c.row < BUNKER_HILL_ROWS
);

// Entrenched edges on Breeds & Bunker Hill, facing the British (south) approach.
// Directions 0/4/5 are the southern arc on our flat-top offset grid (verified:
// those neighbours sit at greater screen-Y). Combat is bearing-based, so this
// protects the defenders against any attack coming from the south.
const BUNKER_HILL_SOUTH_ARC = [0, 4, 5] as const;
const BUNKER_HILL_ENTRENCHMENTS: Record<string, readonly number[]> = {
	'2,1': BUNKER_HILL_SOUTH_ARC,
	'3,1': BUNKER_HILL_SOUTH_ARC,
	'2,4': BUNKER_HILL_SOUTH_ARC,
	'3,4': BUNKER_HILL_SOUTH_ARC,
	'4,4': BUNKER_HILL_SOUTH_ARC,
	'5,4': BUNKER_HILL_SOUTH_ARC // rightmost Colonial line (open ground, still dug in)
};

// Objective markers (cosmetic star): the two Charlestown town hexes (razable via torchRule).
const BUNKER_HILL_OBJECTIVES = new Set(['1,6', '1,7']);

export const BUNKER_HILL_MAP: MapDefinition = Array.from({ length: BUNKER_HILL_COLS }, (_, col) =>
	Array.from({ length: BUNKER_HILL_ROWS }, (_, row) => ({
		col,
		row,
		terrain: BUNKER_HILL_FEATURES[`${col},${row}`] ?? TerrainType.OPEN,
		entrenchedEdges: BUNKER_HILL_ENTRENCHMENTS[`${col},${row}`],
		roadEdges: BUNKER_HILL_ROADS[`${col},${row}`],
		objective: BUNKER_HILL_OBJECTIVES.has(`${col},${row}`)
	}))
).flat();

// White Plains (28 Oct 1776) — 7 cols × 9 rows (the preferred map size, rules §2),
// north = row 0 (the Exit, on the road off the top edge), British attack from the
// south (high rows). Adapted from the ARW-series map, whose 8×11 board was shaved to
// fit: the right-most column and the top+bottom rows were dropped and rows renumbered
// −1. The Bronx River is a
// hex-side feature (riverEdges) winding diagonally down the map: it wraps the east
// face of Chatterton's Hill, then veers west in the lower-left to exit the west edge
// (~row 7) — isolating the west bank (cols 0-1 rows 0-7 + the top of col 2) from the
// connected east bank (White Plains, the exit road, the British staging ground, and
// the reunited bottom-left corner). The single crossing is the bridge on the (1,6)-(2,6) edge,
// carried by the west road. The main road winds north→south through White Plains
// (east of the river); the west road crosses the bridge and forks off the west
// edge. Woods are Light-Inf-only route-around scenery; swamp (MARSH) is difficult
// terrain passable to infantry only.
const WHITE_PLAINS_COLS = 7;
const WHITE_PLAINS_ROWS = 9;

const WHITE_PLAINS_FEATURES: Record<string, TerrainType> = {
	// Chatterton's Hill (west of the river) + Wolf Pitt Hill (upper-right).
	'1,3': TerrainType.HILLTOP,
	'0,4': TerrainType.HILLTOP,
	'1,4': TerrainType.HILLTOP,
	'5,0': TerrainType.HILLTOP,
	'6,0': TerrainType.HILLTOP,
	'5,1': TerrainType.HILLTOP,
	'6,1': TerrainType.HILLTOP,
	// White Plains village (the road runs through it).
	'3,4': TerrainType.TOWN,
	// (The Bronx River is now hex-side terrain — see WHITE_PLAINS_RIVER below.)
	// Scattered woods (route-around; Light-Inf-only) along the edges.
	'0,2': TerrainType.WOODS,
	'0,8': TerrainType.WOODS,
	// Swamp (MARSH — difficult terrain, infantry only).
	'0,3': TerrainType.MARSH,
	'6,3': TerrainType.MARSH,
	'6,6': TerrainType.MARSH
};

const inWhitePlains = (c: OffsetCoordinates) =>
	c.col >= 0 && c.col < WHITE_PLAINS_COLS && c.row >= 0 && c.row < WHITE_PLAINS_ROWS;

// Main road: north exit stub (off-board (3,-1)) winding down through White Plains
// (3,4) and off the south edge (off-board (4,9)), drifting east around rows 2-3 and
// 5-8 (the exit road, east of the river). West road: from two west-edge stubs
// (off-board (-1,5)/(-1,7)) it forks at (1,6), crosses the Bronx River bridge (the
// (1,6)-(2,6) edge), and joins the main road at (4,6) — the only way the west-bank
// hill units reach the north exit. Off-board waypoints give the border hexes a road
// stub running off the map (drops as a key, keeps the on-board edge). All steps
// cube-adjacent. (Those off-map stubs also read as exit hexes — exit refactor pending.)
const WHITE_PLAINS_ROADS = roadEdgesFromPaths(
	[
		[rc(3, -1), rc(3, 0), rc(3, 1), rc(4, 2), rc(4, 3), rc(3, 3), rc(3, 4), rc(4, 5), rc(4, 6), rc(4, 7), rc(4, 8), rc(4, 9)], // prettier-ignore
		[rc(-1, 5), rc(0, 6), rc(1, 6), rc(2, 6), rc(3, 6), rc(4, 6)],
		[rc(-1, 7), rc(0, 7), rc(1, 6)]
	],
	inWhitePlains
);

// Bronx River: a sealed, winding hex-side barrier. The west bank (Chatterton's Hill
// + the NW corner) is cols 0-1 plus the top of col 2; the river is EVERY edge between
// a west-bank hex and an on-board east-bank hex, so the barrier is watertight by
// construction (the diagonal drift falls out automatically). The lone crossing is the
// bridge on the (1,6)-(2,6) edge — a river edge that is also a crossing, so it renders
// as a bridged river but is passable (see `riverBlocks`); the west road carries it.
const isWestBank = (c: OffsetCoordinates) =>
	inWhitePlains(c) && ((c.col <= 1 && c.row <= 7) || (c.col === 2 && c.row <= 2));
// Offset neighbours (col,row) on our flat-top, offset=-1 grid — even/odd columns step
// differently. riverEdgesFromPairs re-validates adjacency, so a wrong entry throws at load.
const offsetNeighbors = ({ col, row }: OffsetCoordinates): OffsetCoordinates[] => {
	const e = col % 2 === 0;
	return [
		{ col, row: row - 1 },
		{ col, row: row + 1 },
		{ col: col + 1, row: e ? row - 1 : row },
		{ col: col + 1, row: e ? row : row + 1 },
		{ col: col - 1, row: e ? row - 1 : row },
		{ col: col - 1, row: e ? row : row + 1 }
	];
};
const BRONX_RIVER_PAIRS: [OffsetCoordinates, OffsetCoordinates][] = [];
for (let col = 0; col < WHITE_PLAINS_COLS; col++)
	for (let row = 0; row < WHITE_PLAINS_ROWS; row++) {
		const west = rc(col, row);
		if (!isWestBank(west)) continue;
		for (const nb of offsetNeighbors(west))
			if (inWhitePlains(nb) && !isWestBank(nb)) BRONX_RIVER_PAIRS.push([west, nb]);
	}
const WHITE_PLAINS_RIVER = riverEdgesFromPairs(BRONX_RIVER_PAIRS, inWhitePlains);
const WHITE_PLAINS_CROSSINGS = riverEdgesFromPairs([[rc(1, 6), rc(2, 6)]], inWhitePlains);

// Exit hexes: an intentional, road-independent declaration. The only exit is the
// Colonial escape at (3,0) — the top of the col-3 road off the north edge, counting
// toward the `exit_units` victory. (The west/south road stubs run off-map but are
// NOT exits — a road leaving the map no longer implies an exit hex.)
const WHITE_PLAINS_EXITS: Record<string, MapEdge> = { '3,0': 'north' };
// Objective markers (cosmetic star): the Colonial escape exit at (3,0).
const WHITE_PLAINS_OBJECTIVES = new Set(['3,0']);

export const WHITE_PLAINS_MAP: MapDefinition = Array.from({ length: WHITE_PLAINS_COLS }, (_, col) =>
	Array.from({ length: WHITE_PLAINS_ROWS }, (_, row) => ({
		col,
		row,
		terrain: WHITE_PLAINS_FEATURES[`${col},${row}`] ?? TerrainType.OPEN,
		roadEdges: WHITE_PLAINS_ROADS[`${col},${row}`],
		riverEdges: WHITE_PLAINS_RIVER[`${col},${row}`],
		crossingEdges: WHITE_PLAINS_CROSSINGS[`${col},${row}`],
		exitEdge: WHITE_PLAINS_EXITS[`${col},${row}`],
		objective: WHITE_PLAINS_OBJECTIVES.has(`${col},${row}`)
	}))
).flat();

// Paoli (21 Sep 1777) — 7 cols × 9 rows, north = row 0. Grey's British surprise-assault
// Wayne's camp near the Paoli Tavern. Adapted from the ARW-series map (decoded from
// paoli.pdf p2): the source 8×11 board was shaved to fit by dropping the right-most
// column (edge scenery — a hill + woods, no units). Woods run in a central band and a
// top-right stand; two hills flank a central rise. Per the conversion, woods hex (4,2)
// was opened so the Colonial camp (cols 4, rows 3-5) isn't sealed off by impassable woods
// (see docs/scenario-conversion-guide.md; WOODS is Light-Infantry-only + blocks LOS).
const PAOLI_COLS = 7;
const PAOLI_ROWS = 9;

const PAOLI_FEATURES: Record<string, TerrainType> = {
	// Hills: top-left corner + a central rise beside the camp.
	'0,0': TerrainType.HILLTOP,
	'2,3': TerrainType.HILLTOP,
	'2,4': TerrainType.HILLTOP,
	'3,3': TerrainType.HILLTOP,
	'6,1': TerrainType.HILLTOP,
	// Woods: central band (the wall Line Infantry must route around / Light Infantry
	// skirmishes through) + a top-right stand + scattered left/edge stands.
	'0,1': TerrainType.WOODS,
	'1,7': TerrainType.WOODS,
	'1,6': TerrainType.WOODS,
	'3,2': TerrainType.WOODS,
	'5,2': TerrainType.WOODS,
	'3,4': TerrainType.WOODS,
	'5,3': TerrainType.WOODS,
	'2,5': TerrainType.WOODS,
	'3,5': TerrainType.WOODS,
	'3,6': TerrainType.WOODS,
	'3,7': TerrainType.WOODS,
	'4,1': TerrainType.WOODS,
	'4,7': TerrainType.WOODS
};

// Roads (from the source map's gray network, simplified). A north–south spine down
// col 2 — the main axis of advance, running off both edges and through the south `R`
// reinforcement hex (2,7) — plus a west spur off the spine at (2,4) to the west edge,
// which the British left prong (near (0,3)) rides toward the camp. Off-board stubs
// ({row:-1}/{row:9}/{col:-1}) give the border hexes an edge stub running off the map
// (dropped as a key, on-board edge kept). +1 move only on an all-road path.
const PAOLI_ROADS = roadEdgesFromPaths(
	[
		[rc(2, -1), rc(2, 0), rc(2, 1), rc(2, 2), rc(2, 3), rc(2, 4), rc(2, 5), rc(2, 6), rc(2, 7), rc(2, 8), rc(2, 9)], // prettier-ignore
		[rc(2, 4), rc(1, 3), rc(0, 4), rc(-1, 4)]
	],
	(c) => c.col >= 0 && c.col < PAOLI_COLS && c.row >= 0 && c.row < PAOLI_ROWS
);

export const PAOLI_MAP: MapDefinition = Array.from({ length: PAOLI_COLS }, (_, col) =>
	Array.from({ length: PAOLI_ROWS }, (_, row) => ({
		col,
		row,
		terrain: PAOLI_FEATURES[`${col},${row}`] ?? TerrainType.OPEN,
		roadEdges: PAOLI_ROADS[`${col},${row}`]
	}))
).flat();
