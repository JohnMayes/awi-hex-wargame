import type { GameStore } from '$lib/game/state/gameStore.svelte';
import { hexPixelToWorld } from './boardGeometry';
import { terrainFill, hexToRgb, hexStrokeHex } from './terrainStyle';

/**
 * LittleJS engine bridge: owns the engine lifecycle and the board draw loop,
 * driven by `LittleBoard.svelte` (`mountBoard`/`unmountBoard`). Reads the
 * `GameStore` each frame and draws from it — a pure consumer of the store
 * contract; no game logic lives here.
 *
 * `littlejsengine` is dynamically imported inside `mountBoard` (never at module
 * top level) so importing this file is SSR-safe; `engineInit` touches `document`
 * and only ever runs client-side. See `render/CLAUDE.md`.
 */
type LJSModule = typeof import('littlejsengine');
type Bounds = { boardW: number; boardH: number; cx: number; cy: number };

// Module scope: the engine's RAF loop outlives any component instance and
// LittleJS exposes no shutdown, so we keep a single engine and toggle `active`.
let LJS: LJSModule | null = null;
let started = false;
let active = false;
let wantActive = false;
let currentStore: GameStore | null = null;
let bounds: Bounds | null = null;

const CAMERA_FIT = 0.95; // leave a small margin around the board
const HEX_LINE_WIDTH = 1; // world units; matches HexTile's thin black border

/** honeycomb pixel point -> LittleJS world-space vec2 (Y-flip via boardGeometry). */
function toWorld(p: { x: number; y: number }) {
	const w = hexPixelToWorld(p);
	return LJS!.vec2(w.x, w.y);
}

/** Board pixel extents + center, from hex corners (same min/max as the SVG viewBox). */
function computeBounds(store: GameStore): Bounds {
	const pts = [...store.grid!].flatMap((h) => h.corners);
	const xs = pts.map((p) => p.x);
	const ys = pts.map((p) => p.y);
	const minX = Math.min(...xs);
	const maxX = Math.max(...xs);
	const minY = Math.min(...ys);
	const maxY = Math.max(...ys);
	return {
		boardW: maxX - minX,
		boardH: maxY - minY,
		cx: (minX + maxX) / 2,
		cy: (minY + maxY) / 2
	};
}

// Fit the board to the canvas every frame, which also handles window resize.
function gameUpdatePost() {
	if (!active || !LJS || !bounds) return;
	const cw = LJS.mainCanvasSize.x;
	const ch = LJS.mainCanvasSize.y;
	if (!cw || !ch || !bounds.boardW || !bounds.boardH) return;
	LJS.setCameraScale(Math.min(cw / bounds.boardW, ch / bounds.boardH) * CAMERA_FIT);
	LJS.setCameraPos(toWorld({ x: bounds.cx, y: bounds.cy }));
}

function gameRender() {
	if (!active || !LJS || !currentStore) return;
	const grid = currentStore.grid;
	if (!grid) return;

	const { drawPoly, drawRect, vec2, rgb } = LJS;
	const s = hexToRgb(hexStrokeHex);
	const stroke = rgb(s.r, s.g, s.b);

	for (const hex of grid) {
		const f = terrainFill(hex.terrain);
		drawPoly(
			hex.corners.map((c) => toWorld(c)),
			rgb(f.r, f.g, f.b),
			HEX_LINE_WIDTH,
			stroke
		);
	}

	// Placeholder unit markers — real counters arrive in R3. Kept so the board
	// stays readable and the Y-flip stays visually verifiable on an asymmetric layout.
	for (const u of currentStore.units) {
		const p = currentStore.takesCordsReturnsPos(u.coordinates);
		if (!p) continue;
		drawRect(
			toWorld(p),
			vec2(20, 20),
			u.player === 0 ? rgb(0.1, 0.34, 0.86) : rgb(0.88, 0.14, 0.14)
		);
	}
}

function noop() {}

function showCanvases() {
	if (LJS?.mainCanvas) LJS.mainCanvas.style.display = '';
	if (LJS?.glCanvas) LJS.glCanvas.style.display = '';
}

function hideCanvases() {
	if (LJS?.mainCanvas) LJS.mainCanvas.style.display = 'none';
	if (LJS?.glCanvas) LJS.glCanvas.style.display = 'none';
}

/** Start (or re-show) the board for `store`. Safe to call on every component mount. */
export async function mountBoard(store: GameStore): Promise<void> {
	wantActive = true;
	currentStore = store;
	bounds = computeBounds(store);

	if (!started) {
		// Single-instance guard: never create a second engine (it can't be torn down).
		const mod = await import('littlejsengine');
		LJS = mod;
		await mod.engineInit(noop, noop, gameUpdatePost, gameRender, noop);
		started = true; // engine exists now; never init again
		mod.setDebugWatermark?.(false); // may be absent in production builds
	}

	if (!wantActive) {
		// Component unmounted while the engine was loading — stay hidden.
		hideCanvases();
		return;
	}
	showCanvases();
	active = true;
}

/** Stop rendering and hide the canvases. */
export function unmountBoard(): void {
	wantActive = false;
	active = false;
	// KNOWN LEAK (deferred to R7): the RAF loop and document input listeners can't
	// be removed; we only hide the body-level canvases so nothing lingers visually.
	hideCanvases();
}
