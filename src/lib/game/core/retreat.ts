import type { Grid, OffsetCoordinates } from 'honeycomb-grid';
import { HexCell, directions } from './hex';
import { canUnitEnterTerrain } from './terrain';
import type { Unit } from './types';

/**
 * Returns the best legal retreat hex for a defender being forced out by an
 * attack from `attackerOrigin`. Picks the neighbor most aligned with the
 * push direction (defender − attackerOrigin), filtering out off-map hexes,
 * terrain the defender cannot enter, and occupied hexes. Returns null if
 * no candidate is legal — the caller converts that into extra hits.
 *
 * Retreat is forced movement: a candidate hex adjacent to another enemy is
 * still permitted (unlike normal movement endpoint selection). Ties on
 * alignment score break on lowest direction index for determinism.
 */
export function getRetreatHex(
	defender: Unit,
	attackerOrigin: OffsetCoordinates,
	grid: Grid<HexCell>,
	units: readonly Unit[]
): OffsetCoordinates | null {
	const defenderHex = grid.getHex(defender.coordinates);
	const originHex = grid.getHex(attackerOrigin);
	if (!defenderHex || !originHex) return null;

	const pushQ = defenderHex.q - originHex.q;
	const pushR = defenderHex.r - originHex.r;
	const pushS = -pushQ - pushR;

	const hexMap = new Map<string, HexCell>();
	for (const hex of grid) hexMap.set(`${hex.q},${hex.r}`, hex);

	const occupied = new Set<string>();
	for (const u of units) {
		if (u.id === defender.id) continue;
		if (u.strengthPoints <= 0) continue;
		occupied.add(`${u.coordinates.col},${u.coordinates.row}`);
	}

	let bestScore = -Infinity;
	let bestCandidate: OffsetCoordinates | null = null;
	let bestDirIdx = Infinity;

	for (let dirIdx = 0; dirIdx < 6; dirIdx++) {
		const [dq, dr] = directions[dirIdx];
		const ds = -dq - dr;
		const neighbor = hexMap.get(`${defenderHex.q + dq},${defenderHex.r + dr}`);
		if (!neighbor) continue;
		if (!canUnitEnterTerrain(defender.type, neighbor.terrain)) continue;
		if (occupied.has(`${neighbor.col},${neighbor.row}`)) continue;

		const score = dq * pushQ + dr * pushR + ds * pushS;
		if (score > bestScore || (score === bestScore && dirIdx < bestDirIdx)) {
			bestScore = score;
			bestCandidate = { col: neighbor.col, row: neighbor.row };
			bestDirIdx = dirIdx;
		}
	}

	return bestCandidate;
}
