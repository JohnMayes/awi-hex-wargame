import type { Grid, OffsetCoordinates } from 'honeycomb-grid';
import { HexCell, coordsEqual, directions } from './hex';
import { getFrontHexsides } from './facing';
import { getUnitDefinition } from './unitDefinitions';
import { canUnitEnterTerrain, terrainDefinitions } from './terrain';
import type { Unit } from './types';

export type MoveTarget = {
	coordinates: OffsetCoordinates;
	cost: number;
	usesRoad: boolean;
};

type Mode = 'NORMAL' | 'ROAD_ONLY';

const cubeKey = (q: number, r: number) => `${q},${r}`;
const offsetKey = (col: number, row: number) => `${col},${row}`;

/**
 * Returns the set of hexes a unit may legally move to this activation, given
 * the current grid and unit positions. Excludes the unit's current hex.
 *
 * Pathfinding is a BFS in cube space that respects: movement allowance,
 * front-arc constraint, terrain entry, stacking, Light Infantry pass-through,
 * adjacency-to-enemy exclusion, and road bonus (+1 when an all-road path is
 * possible from a road start).
 */
export function getValidMoveTargets(
	unit: Unit,
	grid: Grid<HexCell>,
	units: readonly Unit[],
	remainingMP = getUnitDefinition(unit.type).movementAllowance
): MoveTarget[] {
	const def = getUnitDefinition(unit.type);
	const startHex = grid.getHex(unit.coordinates);
	if (!startHex) return [];

	const startDef = terrainDefinitions[startHex.terrain];
	const allAround = !def.hasFacing || startDef.grantAllAroundFacing;
	const frontDirIndices = allAround
		? [0, 1, 2, 3, 4, 5]
		: getFrontHexsides(unit.facing).map((f) => f / 60);

	const hexMap = new Map<string, HexCell>();
	for (const hex of grid) hexMap.set(cubeKey(hex.q, hex.r), hex);

	const unitByKey = new Map<string, Unit>();
	for (const u of units) unitByKey.set(offsetKey(u.coordinates.col, u.coordinates.row), u);

	// Hexes adjacent to any enemy unit (in cube space → offset via hexMap lookup)
	const enemyAdjKeys = new Set<string>();
	for (const u of units) {
		if (u.player === unit.player) continue;
		const enemyHex = grid.getHex(u.coordinates);
		if (!enemyHex) continue;
		for (const [dq, dr] of directions) {
			const neighbor = hexMap.get(cubeKey(enemyHex.q + dq, enemyHex.r + dr));
			if (neighbor) enemyAdjKeys.add(offsetKey(neighbor.col, neighbor.row));
		}
	}

	type State = { hex: HexCell; cost: number; mode: Mode };
	const visited = new Map<string, number>();
	const results = new Map<string, MoveTarget>();

	const seedModes: Mode[] = startDef.isRoad ? ['NORMAL', 'ROAD_ONLY'] : ['NORMAL'];
	const queue: State[] = seedModes.map((mode) => ({ hex: startHex, cost: 0, mode }));

	const considerEndpoint = (hex: HexCell, cost: number, usesRoad: boolean) => {
		if (coordsEqual(hex, unit.coordinates)) return;
		const key = offsetKey(hex.col, hex.row);
		if (unitByKey.has(key)) return; // never end occupied (Light Infantry may pass, not end)
		if (enemyAdjKeys.has(key)) return; // non-charging: no endpoint adjacent to enemy
		const prev = results.get(key);
		if (!prev || prev.cost > cost) {
			results.set(key, { coordinates: { col: hex.col, row: hex.row }, cost, usesRoad });
		}
	};

	while (queue.length > 0) {
		const { hex, cost, mode } = queue.shift()!;
		const stateKey = `${hex.q},${hex.r}|${mode}`;
		const seen = visited.get(stateKey);
		if (seen !== undefined && seen <= cost) continue;
		visited.set(stateKey, cost);

		const limit = mode === 'ROAD_ONLY' ? remainingMP + 1 : remainingMP;
		if (cost >= limit) continue;

		for (let dirIdx = 0; dirIdx < 6; dirIdx++) {
			if (mode === 'NORMAL' && !frontDirIndices.includes(dirIdx)) continue;
			// ROAD_ONLY suspends the facing arc (rules §6.1)

			const [dq, dr] = directions[dirIdx];
			const neighbor = hexMap.get(cubeKey(hex.q + dq, hex.r + dr));
			if (!neighbor) continue; // off-map

			if (!canUnitEnterTerrain(unit.type, neighbor.terrain)) continue;

			const neighborKey = offsetKey(neighbor.col, neighbor.row);
			const occupant = unitByKey.get(neighborKey);
			if (occupant) {
				if (occupant.player !== unit.player) continue; // cannot enter enemy
				if (!def.canPassThroughFriendly) continue; // blocked by friendly
			}

			if (mode === 'ROAD_ONLY') {
				if (!terrainDefinitions[neighbor.terrain].isRoad) continue;
				// Road movement may not move adjacent to an enemy at any step (rules §2)
				if (enemyAdjKeys.has(neighborKey)) continue;
			}

			const newCost = cost + 1;
			queue.push({ hex: neighbor, cost: newCost, mode });
			considerEndpoint(neighbor, newCost, mode === 'ROAD_ONLY');
		}
	}

	return [...results.values()];
}

/**
 * True when the unit must pass a check to leave its current hex (rules §6.1).
 * Applies only to units with `terrainCheckRequired` starting in a difficult
 * terrain hex.
 */
export function requiresDifficultTerrainCheck(unit: Unit, grid: Grid<HexCell>): boolean {
	const def = getUnitDefinition(unit.type);
	if (!def.terrainCheckRequired) return false;
	const hex = grid.getHex(unit.coordinates);
	if (!hex) return false;
	return terrainDefinitions[hex.terrain].isDifficultTerrain;
}

/** Returns true on pass (unit escapes difficult terrain), false on fail. ~50%. */
export function rollDifficultTerrainCheck(rng: () => number): boolean {
	return rng() >= 0.5;
}
