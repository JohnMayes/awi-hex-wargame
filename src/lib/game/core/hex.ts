import type { OffsetCoordinates } from 'honeycomb-grid';
import { defineHex, Orientation } from 'honeycomb-grid';
import { TerrainType } from './types';

export function coordsEqual(a: OffsetCoordinates, b: OffsetCoordinates): boolean {
  return a.col === b.col && a.row === b.row;
}

export class HexCell extends defineHex({ dimensions: 60, origin: 'topLeft', orientation: Orientation.FLAT }) {
  terrain!: TerrainType;

  get elevation(): number {
    return this.terrain === TerrainType.HILLTOP ? 1 : 0;
  }

  static create(config: OffsetCoordinates & { terrain: TerrainType }) {
    const cell = new HexCell(config);
    cell.terrain = config.terrain;
    return cell;
  }
}

export const directions = [
  [1, 0], [1, -1], [0, -1],
  [-1, 0], [-1, 1], [0, 1]
];

export function getNeighbors(hex: HexCell, map: Map<string, HexCell>): HexCell[] {
  return directions
    .map(([dq, dr]) => map.get(`${hex.q + dq},${hex.r + dr}`))
    .filter(Boolean) as HexCell[];
}

export function hexDistance(a: HexCell, b: HexCell): number {
  return (
    Math.abs(a.q - b.q) +
    Math.abs(a.q + a.r - b.q - b.r) +
    Math.abs(a.r - b.r)
  ) / 2;
}
