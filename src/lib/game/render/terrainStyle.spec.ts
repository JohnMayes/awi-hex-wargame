import { describe, expect, it } from 'vitest';
import { TerrainType } from '../core/types';
import { terrainHexColors, terrainFill, hexToRgb } from './terrainStyle';

describe('terrainStyle', () => {
	it('maps every TerrainType to a 6-digit hex color', () => {
		for (const t of Object.values(TerrainType)) {
			expect(terrainHexColors[t]).toMatch(/^#[0-9a-fA-F]{6}$/);
		}
	});

	it('parses hex into normalized 0..1 rgb', () => {
		expect(hexToRgb('#000000')).toEqual({ r: 0, g: 0, b: 0 });
		expect(hexToRgb('#ffffff')).toEqual({ r: 1, g: 1, b: 1 });
		expect(hexToRgb('#ff0000')).toEqual({ r: 1, g: 0, b: 0 });
		const mid = hexToRgb('#808080');
		expect(mid.r).toBeCloseTo(128 / 255);
		expect(mid.g).toBeCloseTo(128 / 255);
		expect(mid.b).toBeCloseTo(128 / 255);
	});

	it('returns in-range rgb for every terrain', () => {
		for (const t of Object.values(TerrainType)) {
			const c = terrainFill(t);
			for (const channel of [c.r, c.g, c.b]) {
				expect(channel).toBeGreaterThanOrEqual(0);
				expect(channel).toBeLessThanOrEqual(1);
			}
		}
	});

	it('terrainFill matches the hex palette entry', () => {
		for (const t of Object.values(TerrainType)) {
			expect(terrainFill(t)).toEqual(hexToRgb(terrainHexColors[t]));
		}
	});
});
