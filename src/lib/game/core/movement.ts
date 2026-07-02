import type { Grid, OffsetCoordinates } from 'honeycomb-grid';
import { HexCell, coordsEqual, directions, roadConnects } from './hex';
import { getUnitDefinition } from './unitDefinitions';
import { canUnitEnterTerrain, terrainDefinitions } from './terrain';
import type { Unit } from './types';

export type MoveTarget = {
	coordinates: OffsetCoordinates;
	cost: number;
	usesRoad: boolean;
};

export type MoveResult = {
	unitId: string;
	from: OffsetCoordinates;
	to: OffsetCoordinates;
	cost: number;
	moved: boolean;
	difficultTerrainCheck: { passed: boolean } | null;
};

type Mode = 'NORMAL' | 'ROAD_ONLY';

const cubeKey = (q: number, r: number) => `${q},${r}`;
const offsetKey = (col: number, row: number) => `${col},${row}`;

/**
 * Returns the set of hexes a unit may legally move to this activation, given
 * the current grid and unit positions. Excludes the unit's current hex.
 *
 * Pathfinding is a BFS in cube space that respects: movement allowance,
 * terrain entry, stacking, Light Infantry pass-through, and road bonus
 * (+1 when an all-road path is possible from a road start). A road also lets
 * any unit move through terrain its type could not otherwise enter (e.g. Line
 * Infantry through woods), as long as the entire move stays on the connected
 * road — impassable terrain (LAKE/MARSH/RIVER) is never crossed. Any unit may
 * voluntarily end its move adjacent to an enemy under normal movement —
 * the old "non-chargers may not move adjacent" rule was retired with the
 * same-hex charge model.
 *
 * Charges (entering an enemy's hex) are NOT covered here — see
 * `core/charge.ts` and `gameStore.chargeAt`. Road-bonus movement (§2) still
 * forbids ending adjacent to an enemy.
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

	const seedModes: Mode[] = startHex.roadEdges.size > 0 ? ['NORMAL', 'ROAD_ONLY'] : ['NORMAL'];
	const queue: State[] = seedModes.map((mode) => ({ hex: startHex, cost: 0, mode }));

	const considerEndpoint = (hex: HexCell, cost: number, usesRoad: boolean) => {
		if (coordsEqual(hex, unit.coordinates)) return;
		const key = offsetKey(hex.col, hex.row);
		if (unitByKey.has(key)) return; // never end occupied (Light Infantry may pass, not end)
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
			const [dq, dr] = directions[dirIdx];
			const neighbor = hexMap.get(cubeKey(hex.q + dq, hex.r + dr));
			if (!neighbor) continue; // off-map

			const neighborKey = offsetKey(neighbor.col, neighbor.row);

			if (mode === 'ROAD_ONLY') {
				if (!roadConnects(hex, neighbor)) continue;
				// A road carries any unit through terrain its type couldn't otherwise
				// enter (e.g. Line Infantry through woods) — the whole ROAD_ONLY path
				// starts and stays on the connected road — but never crosses truly
				// impassable terrain (LAKE/MARSH/RIVER).
				if (terrainDefinitions[neighbor.terrain].isImpassable) continue;
				// Road movement may not move adjacent to an enemy at any step (rules §2)
				if (enemyAdjKeys.has(neighborKey)) continue;
			} else if (!canUnitEnterTerrain(unit.type, neighbor.terrain)) {
				continue;
			}

			const occupant = unitByKey.get(neighborKey);
			if (occupant) {
				if (occupant.player !== unit.player) continue; // cannot enter enemy
				if (!def.canPassThroughFriendly) continue; // blocked by friendly
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
