import { TerrainType } from '../core/types';
import { roadEdgesFromPaths, type HexCell } from '../core/hex';
import type { OffsetCoordinates } from 'honeycomb-grid';

// `entrenchedEdges` / `roadEdges` list direction indices (0..5, indexing
// `directions` in core/hex.ts) of this hex's dug-in / road-crossed edges —
// authored as plain arrays, stored as Sets on the HexCell. Road edges must be
// authored symmetrically across a shared edge (see `roadConnects`).
export type MapDefinition = (Pick<HexCell, 'terrain'> &
	OffsetCoordinates & {
		entrenchedEdges?: readonly number[];
		roadEdges?: readonly number[];
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

export const PITCHED_BATTLE_MAP: MapDefinition = Array.from({ length: 7 }, (_, col) =>
	Array.from({ length: 9 }, (_, row) => ({
		col,
		row,
		terrain: PITCHED_BATTLE_FEATURES[`${col},${row}`] ?? TerrainType.OPEN,
		entrenchedEdges: PITCHED_BATTLE_ENTRENCHMENTS[`${col},${row}`]
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

export const BUNKER_HILL_MAP: MapDefinition = Array.from({ length: BUNKER_HILL_COLS }, (_, col) =>
	Array.from({ length: BUNKER_HILL_ROWS }, (_, row) => ({
		col,
		row,
		terrain: BUNKER_HILL_FEATURES[`${col},${row}`] ?? TerrainType.OPEN,
		entrenchedEdges: BUNKER_HILL_ENTRENCHMENTS[`${col},${row}`],
		roadEdges: BUNKER_HILL_ROADS[`${col},${row}`]
	}))
).flat();
