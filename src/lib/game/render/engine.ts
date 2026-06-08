import type { GameStore } from '$lib/game/state/gameStore.svelte';
import { hexPixelToWorld } from './boardGeometry';
import { terrainFill, hexToRgb, hexStrokeHex, type Rgb } from './terrainStyle';
import { counterPrimitives, spAnchor, type Primitive, type Vec } from './counters';
import { resolveBoardClick } from './boardInput';

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
const SP_TEXT_SIZE = 16; // world units
const SP_TEXT_FILL = hexToRgb('#ffffff');
const SP_TEXT_OUTLINE = hexToRgb('#010203');
const HIGHLIGHT_COLOR = hexToRgb('#ffcc00'); // move-target outline (matches HexTile)
const HIGHLIGHT_WIDTH = 3;

/** honeycomb pixel point -> LittleJS world-space vec2 (Y-flip via boardGeometry). */
function toWorld(p: { x: number; y: number }) {
	const w = hexPixelToWorld(p);
	return LJS!.vec2(w.x, w.y);
}

/** Counter-local point + board pixel center -> world-space vec2 (offset then Y-flip). */
function toCounterWorld(local: Vec, center: { x: number; y: number }) {
	return toWorld({ x: center.x + local.x, y: center.y + local.y });
}

/** Normalized 0..1 RGB(+optional alpha) -> LittleJS Color. */
function color(c: Rgb, a = 1) {
	return LJS!.rgb(c.r, c.g, c.b, a);
}

const TRANSPARENT = () => color({ r: 0, g: 0, b: 0 }, 0);

/** Dispatch one counter primitive to its LittleJS draw call, in world space. */
function drawPrimitive(prim: Primitive, center: { x: number; y: number }) {
	const { drawPoly, drawLine, drawEllipse, vec2 } = LJS!;
	switch (prim.kind) {
		case 'poly':
			drawPoly(
				prim.points.map((p) => toCounterWorld(p, center)),
				prim.fill ? color(prim.fill) : TRANSPARENT(),
				prim.lineWidth ?? 0,
				prim.stroke ? color(prim.stroke) : TRANSPARENT()
			);
			break;
		case 'line':
			drawLine(
				toCounterWorld(prim.a, center),
				toCounterWorld(prim.b, center),
				prim.width,
				color(prim.color)
			);
			break;
		case 'ellipse':
			drawEllipse(
				toCounterWorld(prim.center, center),
				vec2(prim.diameter, prim.diameter),
				prim.fill ? color(prim.fill) : TRANSPARENT(),
				0,
				prim.lineWidth ?? 0,
				prim.stroke ? color(prim.stroke) : TRANSPARENT()
			);
			break;
	}
}

/** Draw every unit's counter + SP readout from the store. */
function drawCounters(store: GameStore) {
	const anchor = spAnchor();
	for (const u of store.units) {
		const center = store.takesCordsReturnsPos(u.coordinates);
		if (!center) continue;
		for (const prim of counterPrimitives(u, u.selected)) drawPrimitive(prim, center);
		// SP readout (world-space drawText renders upright; the Y-flip is only on position).
		LJS!.drawText(
			String(u.strengthPoints),
			toCounterWorld(anchor, center),
			SP_TEXT_SIZE,
			color(SP_TEXT_FILL),
			3,
			color(SP_TEXT_OUTLINE),
			'center'
		);
	}
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

// Poll input each frame: a click/tap routes to the store via the R1 pickers.
// `mousePos` is world-space and routes touch, so tap == click for free.
function gameUpdate() {
	if (!active || !LJS || !currentStore) return;
	if (LJS.mouseWasPressed(0)) resolveBoardClick(LJS.mousePos, currentStore);
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

	const { drawPoly, rgb } = LJS;
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

	// Move-range highlights (under counters), ported from HexTile's yellow outline.
	const highlight = color(HIGHLIGHT_COLOR);
	for (const t of currentStore.validMoveTargets) {
		const hex = currentStore.hexAt(t.coordinates);
		if (!hex) continue;
		drawPoly(
			hex.corners.map((c) => toWorld(c)),
			TRANSPARENT(),
			HIGHLIGHT_WIDTH,
			highlight
		);
	}

	drawCounters(currentStore);
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
		await mod.engineInit(noop, gameUpdate, gameUpdatePost, gameRender, noop);
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
