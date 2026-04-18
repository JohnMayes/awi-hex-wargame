import { describe, expect, it } from 'vitest';
import {
	canUnitEnterTerrain,
	doesTerrainBlockLOS,
	getTerrainCoverModifier,
	getTerrainElevation,
	terrainDefinitions
} from './terrain';
import { TerrainType, UnitType } from './types';

describe('terrainDefinitions', () => {
	it('has an entry for every TerrainType enum value', () => {
		expect.assertions(10);
		for (const type of Object.values(TerrainType)) {
			expect(terrainDefinitions[type]).toBeDefined();
		}
	});

	it('has exactly 10 terrain types defined', () => {
		expect.assertions(1);
		expect(Object.keys(terrainDefinitions)).toHaveLength(10);
	});
});

// ─── canUnitEnterTerrain ────────────────────────────────────────────────────

describe('canUnitEnterTerrain', () => {
	describe('OPEN — all units may enter', () => {
		it('LINE_INFANTRY may enter', () => {
			expect.assertions(1);
			expect(canUnitEnterTerrain(UnitType.LINE_INFANTRY, TerrainType.OPEN)).toBe(true);
		});
		it('LIGHT_INFANTRY may enter', () => {
			expect.assertions(1);
			expect(canUnitEnterTerrain(UnitType.LIGHT_INFANTRY, TerrainType.OPEN)).toBe(true);
		});
		it('DRAGOONS may enter', () => {
			expect.assertions(1);
			expect(canUnitEnterTerrain(UnitType.DRAGOONS, TerrainType.OPEN)).toBe(true);
		});
		it('LIGHT_HORSE may enter', () => {
			expect.assertions(1);
			expect(canUnitEnterTerrain(UnitType.LIGHT_HORSE, TerrainType.OPEN)).toBe(true);
		});
		it('HORSE may enter', () => {
			expect.assertions(1);
			expect(canUnitEnterTerrain(UnitType.HORSE, TerrainType.OPEN)).toBe(true);
		});
		it('ARTILLERY may enter', () => {
			expect.assertions(1);
			expect(canUnitEnterTerrain(UnitType.ARTILLERY, TerrainType.OPEN)).toBe(true);
		});
	});

	describe('WOODS — only Light Infantry may enter', () => {
		it('LIGHT_INFANTRY may enter', () => {
			expect.assertions(1);
			expect(canUnitEnterTerrain(UnitType.LIGHT_INFANTRY, TerrainType.WOODS)).toBe(true);
		});
		it('LINE_INFANTRY may not enter', () => {
			expect.assertions(1);
			expect(canUnitEnterTerrain(UnitType.LINE_INFANTRY, TerrainType.WOODS)).toBe(false);
		});
		it('DRAGOONS may not enter', () => {
			expect.assertions(1);
			expect(canUnitEnterTerrain(UnitType.DRAGOONS, TerrainType.WOODS)).toBe(false);
		});
		it('LIGHT_HORSE may not enter', () => {
			expect.assertions(1);
			expect(canUnitEnterTerrain(UnitType.LIGHT_HORSE, TerrainType.WOODS)).toBe(false);
		});
		it('HORSE may not enter', () => {
			expect.assertions(1);
			expect(canUnitEnterTerrain(UnitType.HORSE, TerrainType.WOODS)).toBe(false);
		});
		it('ARTILLERY may not enter', () => {
			expect.assertions(1);
			expect(canUnitEnterTerrain(UnitType.ARTILLERY, TerrainType.WOODS)).toBe(false);
		});
	});

	describe('TOWN — Infantry and Light Infantry only', () => {
		it('LINE_INFANTRY may enter', () => {
			expect.assertions(1);
			expect(canUnitEnterTerrain(UnitType.LINE_INFANTRY, TerrainType.TOWN)).toBe(true);
		});
		it('LIGHT_INFANTRY may enter', () => {
			expect.assertions(1);
			expect(canUnitEnterTerrain(UnitType.LIGHT_INFANTRY, TerrainType.TOWN)).toBe(true);
		});
		it('DRAGOONS may not enter', () => {
			expect.assertions(1);
			expect(canUnitEnterTerrain(UnitType.DRAGOONS, TerrainType.TOWN)).toBe(false);
		});
		it('LIGHT_HORSE may not enter', () => {
			expect.assertions(1);
			expect(canUnitEnterTerrain(UnitType.LIGHT_HORSE, TerrainType.TOWN)).toBe(false);
		});
		it('HORSE may not enter', () => {
			expect.assertions(1);
			expect(canUnitEnterTerrain(UnitType.HORSE, TerrainType.TOWN)).toBe(false);
		});
		it('ARTILLERY may not enter', () => {
			expect.assertions(1);
			expect(canUnitEnterTerrain(UnitType.ARTILLERY, TerrainType.TOWN)).toBe(false);
		});
	});

	describe('MARSH — impassable to all units', () => {
		it('LINE_INFANTRY may not enter', () => {
			expect.assertions(1);
			expect(canUnitEnterTerrain(UnitType.LINE_INFANTRY, TerrainType.MARSH)).toBe(false);
		});
		it('LIGHT_INFANTRY may not enter', () => {
			expect.assertions(1);
			expect(canUnitEnterTerrain(UnitType.LIGHT_INFANTRY, TerrainType.MARSH)).toBe(false);
		});
		it('DRAGOONS may not enter', () => {
			expect.assertions(1);
			expect(canUnitEnterTerrain(UnitType.DRAGOONS, TerrainType.MARSH)).toBe(false);
		});
		it('LIGHT_HORSE may not enter', () => {
			expect.assertions(1);
			expect(canUnitEnterTerrain(UnitType.LIGHT_HORSE, TerrainType.MARSH)).toBe(false);
		});
		it('HORSE may not enter', () => {
			expect.assertions(1);
			expect(canUnitEnterTerrain(UnitType.HORSE, TerrainType.MARSH)).toBe(false);
		});
		it('ARTILLERY may not enter', () => {
			expect.assertions(1);
			expect(canUnitEnterTerrain(UnitType.ARTILLERY, TerrainType.MARSH)).toBe(false);
		});
	});

	describe('LAKE — impassable to all units', () => {
		it('LINE_INFANTRY may not enter', () => {
			expect.assertions(1);
			expect(canUnitEnterTerrain(UnitType.LINE_INFANTRY, TerrainType.LAKE)).toBe(false);
		});
		it('LIGHT_INFANTRY may not enter', () => {
			expect.assertions(1);
			expect(canUnitEnterTerrain(UnitType.LIGHT_INFANTRY, TerrainType.LAKE)).toBe(false);
		});
		it('DRAGOONS may not enter', () => {
			expect.assertions(1);
			expect(canUnitEnterTerrain(UnitType.DRAGOONS, TerrainType.LAKE)).toBe(false);
		});
		it('LIGHT_HORSE may not enter', () => {
			expect.assertions(1);
			expect(canUnitEnterTerrain(UnitType.LIGHT_HORSE, TerrainType.LAKE)).toBe(false);
		});
		it('HORSE may not enter', () => {
			expect.assertions(1);
			expect(canUnitEnterTerrain(UnitType.HORSE, TerrainType.LAKE)).toBe(false);
		});
		it('ARTILLERY may not enter', () => {
			expect.assertions(1);
			expect(canUnitEnterTerrain(UnitType.ARTILLERY, TerrainType.LAKE)).toBe(false);
		});
	});

	describe('RIVER — impassable (must use FORD or BRIDGE)', () => {
		it('LINE_INFANTRY may not enter', () => {
			expect.assertions(1);
			expect(canUnitEnterTerrain(UnitType.LINE_INFANTRY, TerrainType.RIVER)).toBe(false);
		});
		it('LIGHT_INFANTRY may not enter', () => {
			expect.assertions(1);
			expect(canUnitEnterTerrain(UnitType.LIGHT_INFANTRY, TerrainType.RIVER)).toBe(false);
		});
		it('DRAGOONS may not enter', () => {
			expect.assertions(1);
			expect(canUnitEnterTerrain(UnitType.DRAGOONS, TerrainType.RIVER)).toBe(false);
		});
		it('LIGHT_HORSE may not enter', () => {
			expect.assertions(1);
			expect(canUnitEnterTerrain(UnitType.LIGHT_HORSE, TerrainType.RIVER)).toBe(false);
		});
		it('HORSE may not enter', () => {
			expect.assertions(1);
			expect(canUnitEnterTerrain(UnitType.HORSE, TerrainType.RIVER)).toBe(false);
		});
		it('ARTILLERY may not enter', () => {
			expect.assertions(1);
			expect(canUnitEnterTerrain(UnitType.ARTILLERY, TerrainType.RIVER)).toBe(false);
		});
	});

	describe('FORD — all units may enter', () => {
		it('LINE_INFANTRY may enter', () => {
			expect.assertions(1);
			expect(canUnitEnterTerrain(UnitType.LINE_INFANTRY, TerrainType.FORD)).toBe(true);
		});
		it('LIGHT_INFANTRY may enter', () => {
			expect.assertions(1);
			expect(canUnitEnterTerrain(UnitType.LIGHT_INFANTRY, TerrainType.FORD)).toBe(true);
		});
		it('DRAGOONS may enter', () => {
			expect.assertions(1);
			expect(canUnitEnterTerrain(UnitType.DRAGOONS, TerrainType.FORD)).toBe(true);
		});
		it('LIGHT_HORSE may enter', () => {
			expect.assertions(1);
			expect(canUnitEnterTerrain(UnitType.LIGHT_HORSE, TerrainType.FORD)).toBe(true);
		});
		it('HORSE may enter', () => {
			expect.assertions(1);
			expect(canUnitEnterTerrain(UnitType.HORSE, TerrainType.FORD)).toBe(true);
		});
		it('ARTILLERY may enter', () => {
			expect.assertions(1);
			expect(canUnitEnterTerrain(UnitType.ARTILLERY, TerrainType.FORD)).toBe(true);
		});
	});

	describe('BRIDGE — all units may enter', () => {
		it('LINE_INFANTRY may enter', () => {
			expect.assertions(1);
			expect(canUnitEnterTerrain(UnitType.LINE_INFANTRY, TerrainType.BRIDGE)).toBe(true);
		});
		it('LIGHT_INFANTRY may enter', () => {
			expect.assertions(1);
			expect(canUnitEnterTerrain(UnitType.LIGHT_INFANTRY, TerrainType.BRIDGE)).toBe(true);
		});
		it('DRAGOONS may enter', () => {
			expect.assertions(1);
			expect(canUnitEnterTerrain(UnitType.DRAGOONS, TerrainType.BRIDGE)).toBe(true);
		});
		it('LIGHT_HORSE may enter', () => {
			expect.assertions(1);
			expect(canUnitEnterTerrain(UnitType.LIGHT_HORSE, TerrainType.BRIDGE)).toBe(true);
		});
		it('HORSE may enter', () => {
			expect.assertions(1);
			expect(canUnitEnterTerrain(UnitType.HORSE, TerrainType.BRIDGE)).toBe(true);
		});
		it('ARTILLERY may enter', () => {
			expect.assertions(1);
			expect(canUnitEnterTerrain(UnitType.ARTILLERY, TerrainType.BRIDGE)).toBe(true);
		});
	});

	describe('ROAD — all units may enter', () => {
		it('LINE_INFANTRY may enter', () => {
			expect.assertions(1);
			expect(canUnitEnterTerrain(UnitType.LINE_INFANTRY, TerrainType.ROAD)).toBe(true);
		});
		it('LIGHT_INFANTRY may enter', () => {
			expect.assertions(1);
			expect(canUnitEnterTerrain(UnitType.LIGHT_INFANTRY, TerrainType.ROAD)).toBe(true);
		});
		it('DRAGOONS may enter', () => {
			expect.assertions(1);
			expect(canUnitEnterTerrain(UnitType.DRAGOONS, TerrainType.ROAD)).toBe(true);
		});
		it('LIGHT_HORSE may enter', () => {
			expect.assertions(1);
			expect(canUnitEnterTerrain(UnitType.LIGHT_HORSE, TerrainType.ROAD)).toBe(true);
		});
		it('HORSE may enter', () => {
			expect.assertions(1);
			expect(canUnitEnterTerrain(UnitType.HORSE, TerrainType.ROAD)).toBe(true);
		});
		it('ARTILLERY may enter', () => {
			expect.assertions(1);
			expect(canUnitEnterTerrain(UnitType.ARTILLERY, TerrainType.ROAD)).toBe(true);
		});
	});

	describe('HILLTOP — all units may enter', () => {
		it('LINE_INFANTRY may enter', () => {
			expect.assertions(1);
			expect(canUnitEnterTerrain(UnitType.LINE_INFANTRY, TerrainType.HILLTOP)).toBe(true);
		});
		it('LIGHT_INFANTRY may enter', () => {
			expect.assertions(1);
			expect(canUnitEnterTerrain(UnitType.LIGHT_INFANTRY, TerrainType.HILLTOP)).toBe(true);
		});
		it('DRAGOONS may enter', () => {
			expect.assertions(1);
			expect(canUnitEnterTerrain(UnitType.DRAGOONS, TerrainType.HILLTOP)).toBe(true);
		});
		it('LIGHT_HORSE may enter', () => {
			expect.assertions(1);
			expect(canUnitEnterTerrain(UnitType.LIGHT_HORSE, TerrainType.HILLTOP)).toBe(true);
		});
		it('HORSE may enter', () => {
			expect.assertions(1);
			expect(canUnitEnterTerrain(UnitType.HORSE, TerrainType.HILLTOP)).toBe(true);
		});
		it('ARTILLERY may enter', () => {
			expect.assertions(1);
			expect(canUnitEnterTerrain(UnitType.ARTILLERY, TerrainType.HILLTOP)).toBe(true);
		});
	});
});

// ─── doesTerrainBlockLOS ────────────────────────────────────────────────────

describe('doesTerrainBlockLOS', () => {
	it('WOODS blocks LOS', () => {
		expect.assertions(1);
		expect(doesTerrainBlockLOS(TerrainType.WOODS)).toBe(true);
	});
	it('TOWN blocks LOS', () => {
		expect.assertions(1);
		expect(doesTerrainBlockLOS(TerrainType.TOWN)).toBe(true);
	});
	it('HILLTOP blocks LOS (elevation-dependent check handled in M6)', () => {
		expect.assertions(1);
		expect(doesTerrainBlockLOS(TerrainType.HILLTOP)).toBe(true);
	});
	it('OPEN does not block LOS', () => {
		expect.assertions(1);
		expect(doesTerrainBlockLOS(TerrainType.OPEN)).toBe(false);
	});
	it('MARSH does not block LOS', () => {
		expect.assertions(1);
		expect(doesTerrainBlockLOS(TerrainType.MARSH)).toBe(false);
	});
	it('LAKE does not block LOS', () => {
		expect.assertions(1);
		expect(doesTerrainBlockLOS(TerrainType.LAKE)).toBe(false);
	});
	it('RIVER does not block LOS', () => {
		expect.assertions(1);
		expect(doesTerrainBlockLOS(TerrainType.RIVER)).toBe(false);
	});
	it('FORD does not block LOS', () => {
		expect.assertions(1);
		expect(doesTerrainBlockLOS(TerrainType.FORD)).toBe(false);
	});
	it('BRIDGE does not block LOS', () => {
		expect.assertions(1);
		expect(doesTerrainBlockLOS(TerrainType.BRIDGE)).toBe(false);
	});
	it('ROAD does not block LOS', () => {
		expect.assertions(1);
		expect(doesTerrainBlockLOS(TerrainType.ROAD)).toBe(false);
	});
});

// ─── getTerrainCoverModifier ────────────────────────────────────────────────

describe('getTerrainCoverModifier', () => {
	it('WOODS provides -0.15 cover modifier', () => {
		expect.assertions(1);
		expect(getTerrainCoverModifier(TerrainType.WOODS)).toBe(-0.15);
	});
	it('TOWN provides -0.15 cover modifier', () => {
		expect.assertions(1);
		expect(getTerrainCoverModifier(TerrainType.TOWN)).toBe(-0.15);
	});
	it('OPEN provides no cover (0)', () => {
		expect.assertions(1);
		expect(getTerrainCoverModifier(TerrainType.OPEN)).toBe(0);
	});
	it('HILLTOP provides no cover (0)', () => {
		expect.assertions(1);
		expect(getTerrainCoverModifier(TerrainType.HILLTOP)).toBe(0);
	});
	it('MARSH provides no cover (0)', () => {
		expect.assertions(1);
		expect(getTerrainCoverModifier(TerrainType.MARSH)).toBe(0);
	});
	it('LAKE provides no cover (0)', () => {
		expect.assertions(1);
		expect(getTerrainCoverModifier(TerrainType.LAKE)).toBe(0);
	});
	it('RIVER provides no cover (0)', () => {
		expect.assertions(1);
		expect(getTerrainCoverModifier(TerrainType.RIVER)).toBe(0);
	});
	it('FORD provides no cover (0)', () => {
		expect.assertions(1);
		expect(getTerrainCoverModifier(TerrainType.FORD)).toBe(0);
	});
	it('BRIDGE provides no cover (0)', () => {
		expect.assertions(1);
		expect(getTerrainCoverModifier(TerrainType.BRIDGE)).toBe(0);
	});
	it('ROAD provides no cover (0)', () => {
		expect.assertions(1);
		expect(getTerrainCoverModifier(TerrainType.ROAD)).toBe(0);
	});
});

// ─── getTerrainElevation ────────────────────────────────────────────────────

describe('getTerrainElevation', () => {
	it('HILLTOP has elevation 1', () => {
		expect.assertions(1);
		expect(getTerrainElevation(TerrainType.HILLTOP)).toBe(1);
	});
	it('OPEN has elevation 0', () => {
		expect.assertions(1);
		expect(getTerrainElevation(TerrainType.OPEN)).toBe(0);
	});
	it('WOODS has elevation 0', () => {
		expect.assertions(1);
		expect(getTerrainElevation(TerrainType.WOODS)).toBe(0);
	});
	it('TOWN has elevation 0', () => {
		expect.assertions(1);
		expect(getTerrainElevation(TerrainType.TOWN)).toBe(0);
	});
	it('MARSH has elevation 0', () => {
		expect.assertions(1);
		expect(getTerrainElevation(TerrainType.MARSH)).toBe(0);
	});
	it('LAKE has elevation 0', () => {
		expect.assertions(1);
		expect(getTerrainElevation(TerrainType.LAKE)).toBe(0);
	});
	it('RIVER has elevation 0', () => {
		expect.assertions(1);
		expect(getTerrainElevation(TerrainType.RIVER)).toBe(0);
	});
	it('FORD has elevation 0', () => {
		expect.assertions(1);
		expect(getTerrainElevation(TerrainType.FORD)).toBe(0);
	});
	it('BRIDGE has elevation 0', () => {
		expect.assertions(1);
		expect(getTerrainElevation(TerrainType.BRIDGE)).toBe(0);
	});
	it('ROAD has elevation 0', () => {
		expect.assertions(1);
		expect(getTerrainElevation(TerrainType.ROAD)).toBe(0);
	});
});

// ─── terrainDefinitions property checks ────────────────────────────────────

describe('grantAllAroundFacing', () => {
	it('TOWN grants all-around facing', () => {
		expect.assertions(1);
		expect(terrainDefinitions[TerrainType.TOWN].grantAllAroundFacing).toBe(true);
	});
	it('OPEN does not grant all-around facing', () => {
		expect.assertions(1);
		expect(terrainDefinitions[TerrainType.OPEN].grantAllAroundFacing).toBe(false);
	});
	it('WOODS does not grant all-around facing', () => {
		expect.assertions(1);
		expect(terrainDefinitions[TerrainType.WOODS].grantAllAroundFacing).toBe(false);
	});
	it('HILLTOP does not grant all-around facing', () => {
		expect.assertions(1);
		expect(terrainDefinitions[TerrainType.HILLTOP].grantAllAroundFacing).toBe(false);
	});
	it('MARSH does not grant all-around facing', () => {
		expect.assertions(1);
		expect(terrainDefinitions[TerrainType.MARSH].grantAllAroundFacing).toBe(false);
	});
	it('LAKE does not grant all-around facing', () => {
		expect.assertions(1);
		expect(terrainDefinitions[TerrainType.LAKE].grantAllAroundFacing).toBe(false);
	});
	it('RIVER does not grant all-around facing', () => {
		expect.assertions(1);
		expect(terrainDefinitions[TerrainType.RIVER].grantAllAroundFacing).toBe(false);
	});
	it('FORD does not grant all-around facing', () => {
		expect.assertions(1);
		expect(terrainDefinitions[TerrainType.FORD].grantAllAroundFacing).toBe(false);
	});
	it('BRIDGE does not grant all-around facing', () => {
		expect.assertions(1);
		expect(terrainDefinitions[TerrainType.BRIDGE].grantAllAroundFacing).toBe(false);
	});
	it('ROAD does not grant all-around facing', () => {
		expect.assertions(1);
		expect(terrainDefinitions[TerrainType.ROAD].grantAllAroundFacing).toBe(false);
	});
});

describe('isDifficultTerrain', () => {
	it('HILLTOP is difficult terrain', () => {
		expect.assertions(1);
		expect(terrainDefinitions[TerrainType.HILLTOP].isDifficultTerrain).toBe(true);
	});
	it('OPEN is not difficult terrain', () => {
		expect.assertions(1);
		expect(terrainDefinitions[TerrainType.OPEN].isDifficultTerrain).toBe(false);
	});
	it('WOODS is not difficult terrain', () => {
		expect.assertions(1);
		expect(terrainDefinitions[TerrainType.WOODS].isDifficultTerrain).toBe(false);
	});
	it('TOWN is not difficult terrain', () => {
		expect.assertions(1);
		expect(terrainDefinitions[TerrainType.TOWN].isDifficultTerrain).toBe(false);
	});
	it('MARSH is not difficult terrain', () => {
		expect.assertions(1);
		expect(terrainDefinitions[TerrainType.MARSH].isDifficultTerrain).toBe(false);
	});
	it('LAKE is not difficult terrain', () => {
		expect.assertions(1);
		expect(terrainDefinitions[TerrainType.LAKE].isDifficultTerrain).toBe(false);
	});
	it('RIVER is not difficult terrain', () => {
		expect.assertions(1);
		expect(terrainDefinitions[TerrainType.RIVER].isDifficultTerrain).toBe(false);
	});
	it('FORD is not difficult terrain', () => {
		expect.assertions(1);
		expect(terrainDefinitions[TerrainType.FORD].isDifficultTerrain).toBe(false);
	});
	it('BRIDGE is not difficult terrain', () => {
		expect.assertions(1);
		expect(terrainDefinitions[TerrainType.BRIDGE].isDifficultTerrain).toBe(false);
	});
	it('ROAD is not difficult terrain', () => {
		expect.assertions(1);
		expect(terrainDefinitions[TerrainType.ROAD].isDifficultTerrain).toBe(false);
	});
});

describe('isRoad', () => {
	it('ROAD is a road', () => {
		expect.assertions(1);
		expect(terrainDefinitions[TerrainType.ROAD].isRoad).toBe(true);
	});
	it('OPEN is not a road', () => {
		expect.assertions(1);
		expect(terrainDefinitions[TerrainType.OPEN].isRoad).toBe(false);
	});
	it('WOODS is not a road', () => {
		expect.assertions(1);
		expect(terrainDefinitions[TerrainType.WOODS].isRoad).toBe(false);
	});
	it('TOWN is not a road', () => {
		expect.assertions(1);
		expect(terrainDefinitions[TerrainType.TOWN].isRoad).toBe(false);
	});
	it('MARSH is not a road', () => {
		expect.assertions(1);
		expect(terrainDefinitions[TerrainType.MARSH].isRoad).toBe(false);
	});
	it('LAKE is not a road', () => {
		expect.assertions(1);
		expect(terrainDefinitions[TerrainType.LAKE].isRoad).toBe(false);
	});
	it('RIVER is not a road', () => {
		expect.assertions(1);
		expect(terrainDefinitions[TerrainType.RIVER].isRoad).toBe(false);
	});
	it('FORD is not a road', () => {
		expect.assertions(1);
		expect(terrainDefinitions[TerrainType.FORD].isRoad).toBe(false);
	});
	it('BRIDGE is not a road', () => {
		expect.assertions(1);
		expect(terrainDefinitions[TerrainType.BRIDGE].isRoad).toBe(false);
	});
	it('HILLTOP is not a road', () => {
		expect.assertions(1);
		expect(terrainDefinitions[TerrainType.HILLTOP].isRoad).toBe(false);
	});
});

describe('isImpassable', () => {
	it('MARSH is impassable', () => {
		expect.assertions(1);
		expect(terrainDefinitions[TerrainType.MARSH].isImpassable).toBe(true);
	});
	it('LAKE is impassable', () => {
		expect.assertions(1);
		expect(terrainDefinitions[TerrainType.LAKE].isImpassable).toBe(true);
	});
	it('RIVER is impassable', () => {
		expect.assertions(1);
		expect(terrainDefinitions[TerrainType.RIVER].isImpassable).toBe(true);
	});
	it('OPEN is not impassable', () => {
		expect.assertions(1);
		expect(terrainDefinitions[TerrainType.OPEN].isImpassable).toBe(false);
	});
	it('WOODS is not impassable', () => {
		expect.assertions(1);
		expect(terrainDefinitions[TerrainType.WOODS].isImpassable).toBe(false);
	});
	it('TOWN is not impassable', () => {
		expect.assertions(1);
		expect(terrainDefinitions[TerrainType.TOWN].isImpassable).toBe(false);
	});
	it('FORD is not impassable', () => {
		expect.assertions(1);
		expect(terrainDefinitions[TerrainType.FORD].isImpassable).toBe(false);
	});
	it('BRIDGE is not impassable', () => {
		expect.assertions(1);
		expect(terrainDefinitions[TerrainType.BRIDGE].isImpassable).toBe(false);
	});
	it('ROAD is not impassable', () => {
		expect.assertions(1);
		expect(terrainDefinitions[TerrainType.ROAD].isImpassable).toBe(false);
	});
	it('HILLTOP is not impassable', () => {
		expect.assertions(1);
		expect(terrainDefinitions[TerrainType.HILLTOP].isImpassable).toBe(false);
	});
});
