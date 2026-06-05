import { TerrainType } from '../core/types';
import type { HexCell } from '../core/hex';
import type { OffsetCoordinates } from 'honeycomb-grid';

export type MapDefinition = (Pick<HexCell, 'terrain'> & OffsetCoordinates)[];

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

export const PITCHED_BATTLE_MAP: MapDefinition = Array.from({ length: 7 }, (_, col) =>
	Array.from({ length: 9 }, (_, row) => ({
		col,
		row,
		terrain: PITCHED_BATTLE_FEATURES[`${col},${row}`] ?? TerrainType.OPEN
	}))
).flat();
