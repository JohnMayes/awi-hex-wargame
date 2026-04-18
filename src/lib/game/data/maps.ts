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
