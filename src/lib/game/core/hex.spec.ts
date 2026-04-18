import { describe, expect, it } from 'vitest';
import { coordsEqual, HexCell, hexDistance, getNeighbors } from './hex';
import { TerrainType } from './types';

describe('coordsEqual', () => {
	it('returns true for matching coordinates', () => {
		expect.assertions(1);
		expect(coordsEqual({ col: 0, row: 0 }, { col: 0, row: 0 })).toBe(true);
	});

	it('returns false when col differs', () => {
		expect.assertions(1);
		expect(coordsEqual({ col: 0, row: 0 }, { col: 1, row: 0 })).toBe(false);
	});

	it('returns false when row differs', () => {
		expect.assertions(1);
		expect(coordsEqual({ col: 0, row: 0 }, { col: 0, row: 1 })).toBe(false);
	});

	it('returns false when both differ', () => {
		expect.assertions(1);
		expect(coordsEqual({ col: 2, row: 3 }, { col: 4, row: 5 })).toBe(false);
	});
});

describe('HexCell.elevation', () => {
	it('returns 1 for HILLTOP', () => {
		expect.assertions(1);
		expect(HexCell.create({ col: 0, row: 0, terrain: TerrainType.HILLTOP }).elevation).toBe(1);
	});

	it('returns 0 for OPEN', () => {
		expect.assertions(1);
		expect(HexCell.create({ col: 0, row: 0, terrain: TerrainType.OPEN }).elevation).toBe(0);
	});

	it('returns 0 for WOODS', () => {
		expect.assertions(1);
		expect(HexCell.create({ col: 0, row: 0, terrain: TerrainType.WOODS }).elevation).toBe(0);
	});

	it('returns 0 for TOWN', () => {
		expect.assertions(1);
		expect(HexCell.create({ col: 0, row: 0, terrain: TerrainType.TOWN }).elevation).toBe(0);
	});

	it('returns 0 for MARSH', () => {
		expect.assertions(1);
		expect(HexCell.create({ col: 0, row: 0, terrain: TerrainType.MARSH }).elevation).toBe(0);
	});
});
