import type { Grid, OffsetCoordinates } from 'honeycomb-grid';
import { HexCell, coordsEqual, directions, roadConnects, riverBlocks } from './hex';
import { getUnitDefinition } from './unitDefinitions';
import { canUnitEnterTerrain, terrainDefinitions } from './terrain';
import type { Unit } from './types';

export type MoveTarget = {
	coordinates: OffsetCoordinates;
	cost: number;
	usesRoad: boolean;
	/**
	 * True when moving here exits the unit off the map, rather than repositioning
	 * it. Only emitted when the caller opts in (`allowExit`); the target sits on a
	 * hex explicitly declared an exit (`hex.exitEdge`) — independent of roads. The
	 * store removes the unit and records the exit instead of moving it.
	 */
	isExit?: boolean;
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
 * road — impassable terrain (LAKE/MARSH) is never crossed, and a river edge is
 * crossable only at a bridge/ford (see `riverBlocks`). Any unit may
 * voluntarily end its move adjacent to an enemy under normal movement —
 * the old "non-chargers may not move adjacent" rule was retired with the
 * same-hex charge model.
 *
 * Charges (entering an enemy's hex) are NOT covered here — see
 * `core/charge.ts` and `gameStore.chargeAt`. A road path may still march past
 * an enemy-screened hex (the terrain-bypass is ungated), but entering any
 * enemy-adjacent hex forfeits the +1 road bonus for the rest of that path (§2).
 */
export function getValidMoveTargets(
	unit: Unit,
	grid: Grid<HexCell>,
	units: readonly Unit[],
	remainingMP = getUnitDefinition(unit.type).movementAllowance,
	allowExit = false
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

	// `enemyAdj` = the road path so far has entered a hex adjacent to an enemy,
	// which forfeits the +1 road bonus for the rest of that path (see below).
	type State = { hex: HexCell; cost: number; mode: Mode; enemyAdj: boolean };
	const visited = new Map<string, number>();
	const results = new Map<string, MoveTarget>();

	const seedModes: Mode[] = startHex.roadEdges.size > 0 ? ['NORMAL', 'ROAD_ONLY'] : ['NORMAL'];
	const queue: State[] = seedModes.map((mode) => ({ hex: startHex, cost: 0, mode, enemyAdj: false }));

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
		const { hex, cost, mode, enemyAdj } = queue.shift()!;
		const stateKey = `${hex.q},${hex.r}|${mode}|${enemyAdj ? 1 : 0}`;
		const seen = visited.get(stateKey);
		if (seen !== undefined && seen <= cost) continue;
		visited.set(stateKey, cost);

		for (let dirIdx = 0; dirIdx < 6; dirIdx++) {
			const [dq, dr] = directions[dirIdx];
			const neighbor = hexMap.get(cubeKey(hex.q + dq, hex.r + dr));
			if (!neighbor) continue; // off-map

			const neighborKey = offsetKey(neighbor.col, neighbor.row);

			// A river on the shared edge blocks the step in either mode — a road over
			// an unbridged river still can't cross (only a bridge/ford crossing does).
			if (riverBlocks(hex, neighbor)) continue;

			if (mode === 'ROAD_ONLY') {
				if (!roadConnects(hex, neighbor)) continue;
				// A road carries any unit through terrain its type couldn't otherwise
				// enter (e.g. Line Infantry through woods) — the whole ROAD_ONLY path
				// starts and stays on the connected road — but never crosses truly
				// impassable terrain (LAKE/MARSH).
				if (terrainDefinitions[neighbor.terrain].isImpassable) continue;
			} else if (!canUnitEnterTerrain(unit.type, neighbor.terrain)) {
				continue;
			}

			const occupant = unitByKey.get(neighborKey);
			if (occupant) {
				if (occupant.player !== unit.player) continue; // cannot enter enemy
				if (!def.canPassThroughFriendly) continue; // blocked by friendly
			}

			// The road grants +1 MP only while the whole march stays clear of
			// enemy-adjacent hexes (rules §2); entering one forfeits the bonus for the
			// rest of the path. The road terrain-bypass itself is never gated by enemy
			// adjacency — a unit may still march the cleared lane past a screening enemy.
			const nextEnemyAdj = enemyAdj || enemyAdjKeys.has(neighborKey);
			const bonus = mode === 'ROAD_ONLY' && !nextEnemyAdj ? 1 : 0;
			const newCost = cost + 1;
			if (newCost > remainingMP + bonus) continue;

			queue.push({ hex: neighbor, cost: newCost, mode, enemyAdj: nextEnemyAdj });
			considerEndpoint(neighbor, newCost, mode === 'ROAD_ONLY');
		}
	}

	if (allowExit) {
		// An exit hex is an intentional map declaration (`hex.exitEdge`) — a unit that
		// reaches one, or starts on it, may leave the board there. We mark the target
		// isExit; deliberately independent of roads (a road running off-map is not an exit).
		const isExitHex = (hex: HexCell) => hex.exitEdge != null;
		for (const [key, target] of results) {
			const hex = grid.getHex(target.coordinates);
			if (hex && isExitHex(hex)) results.set(key, { ...target, isExit: true });
		}
		// A unit already standing on an exit hex leaves for the cost of one step.
		if (isExitHex(startHex) && remainingMP >= 1) {
			const key = offsetKey(startHex.col, startHex.row);
			if (!results.has(key))
				results.set(key, {
					coordinates: { col: startHex.col, row: startHex.row },
					cost: 1,
					usesRoad: false,
					isExit: true
				});
		}
	}

	return [...results.values()];
}

/**
 * Terrain-passable neighbours of `hex` for `unit`, ignoring unit occupancy, roads,
 * and movement allowance. This is the routing graph the AI's A* distance estimate
 * runs over (`sim/playout.ts`): it must route around *static* terrain (rivers,
 * impassable), but NOT around *transient* units — a goal screened by friendlies
 * must still read as reachable, or the unit refuses to advance. Shares the exact
 * edge rules the BFS above uses (`riverBlocks`, `canUnitEnterTerrain`), so routing
 * can never disagree with legal movement about what terrain is traversable.
 *
 * `hexMap` is a cube-key (`"q,r"`) → hex lookup — build it once and reuse across
 * calls (a fresh grid scan per neighbour lookup would be wasteful).
 */
export function passableNeighbors(
	unit: Unit,
	hex: HexCell,
	hexMap: Map<string, HexCell>
): HexCell[] {
	const out: HexCell[] = [];
	for (const [dq, dr] of directions) {
		const neighbor = hexMap.get(cubeKey(hex.q + dq, hex.r + dr));
		if (!neighbor) continue;
		if (riverBlocks(hex, neighbor)) continue;
		if (!canUnitEnterTerrain(unit.type, neighbor.terrain)) continue;
		out.push(neighbor);
	}
	return out;
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
