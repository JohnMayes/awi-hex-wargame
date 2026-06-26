import { TerrainType, UnitType } from './types';

export type TerrainDefinition = {
	readonly blocksLOS: boolean;
	readonly providesCover: boolean;
	readonly isImpassable: boolean;
	readonly isElevated: boolean;
	readonly isDifficultTerrain: boolean;
	// null = all units may enter; array = only these unit types may enter
	readonly allowedUnitTypes: readonly UnitType[] | null;
};

export const terrainDefinitions: Readonly<Record<TerrainType, TerrainDefinition>> = {
	[TerrainType.OPEN]: {
		blocksLOS: false,
		providesCover: false,
		isImpassable: false,
		isElevated: false,
		isDifficultTerrain: false,
		allowedUnitTypes: null
	},
	[TerrainType.WOODS]: {
		blocksLOS: true,
		providesCover: true,
		isImpassable: false,
		isElevated: false,
		isDifficultTerrain: false,
		allowedUnitTypes: [UnitType.LIGHT_INFANTRY]
	},
	[TerrainType.TOWN]: {
		blocksLOS: true,
		providesCover: true,
		isImpassable: false,
		isElevated: false,
		isDifficultTerrain: false,
		allowedUnitTypes: [UnitType.LINE_INFANTRY, UnitType.LIGHT_INFANTRY]
	},
	[TerrainType.MARSH]: {
		blocksLOS: false,
		providesCover: false,
		isImpassable: true,
		isElevated: false,
		isDifficultTerrain: false,
		allowedUnitTypes: null
	},
	[TerrainType.LAKE]: {
		blocksLOS: false,
		providesCover: false,
		isImpassable: true,
		isElevated: false,
		isDifficultTerrain: false,
		allowedUnitTypes: null
	},
	[TerrainType.RIVER]: {
		blocksLOS: false,
		providesCover: false,
		isImpassable: true,
		isElevated: false,
		isDifficultTerrain: false,
		allowedUnitTypes: null
	},
	[TerrainType.FORD]: {
		blocksLOS: false,
		providesCover: false,
		isImpassable: false,
		isElevated: false,
		isDifficultTerrain: false,
		allowedUnitTypes: null
	},
	[TerrainType.BRIDGE]: {
		blocksLOS: false,
		providesCover: false,
		isImpassable: false,
		isElevated: false,
		isDifficultTerrain: false,
		allowedUnitTypes: null
	},
	[TerrainType.HILLTOP]: {
		blocksLOS: true,
		providesCover: false,
		isImpassable: false,
		isElevated: true,
		isDifficultTerrain: true,
		allowedUnitTypes: null
	},
	// A razed town (see scenario torchRule). Behaves exactly like OPEN — burning a
	// TOWN hex strips its cover and LOS block via the normal terrain reads — but is a
	// distinct type so it renders as charred ground and is countable for victory.
	[TerrainType.BURNED]: {
		blocksLOS: false,
		providesCover: false,
		isImpassable: false,
		isElevated: false,
		isDifficultTerrain: false,
		allowedUnitTypes: null
	}
};

/**
 * Returns whether a unit type may enter a terrain hex.
 * Impassable terrain (MARSH, LAKE, RIVER) blocks all units.
 * WOODS and TOWN restrict entry to specific unit types.
 */
export function canUnitEnterTerrain(unitType: UnitType, terrainType: TerrainType): boolean {
	const def = terrainDefinitions[terrainType];
	if (def.isImpassable) return false;
	if (def.allowedUnitTypes === null) return true;
	return (def.allowedUnitTypes as UnitType[]).includes(unitType);
}

/**
 * Returns the hit chance modifier for a target in this terrain.
 * WOODS and TOWN provide cover: -0.15. All other terrain: 0.
 */
export function getTerrainCoverModifier(terrainType: TerrainType): number {
	return terrainDefinitions[terrainType].providesCover ? -0.15 : 0;
}

/**
 * Returns whether this terrain type can block line of sight.
 * The full elevation-dependent LOS check is handled in los.ts (M6).
 */
export function doesTerrainBlockLOS(terrainType: TerrainType): boolean {
	return terrainDefinitions[terrainType].blocksLOS;
}

/**
 * Returns the elevation of this terrain type: 1 for HILLTOP, 0 for all others.
 */
export function getTerrainElevation(terrainType: TerrainType): number {
	return terrainDefinitions[terrainType].isElevated ? 1 : 0;
}
