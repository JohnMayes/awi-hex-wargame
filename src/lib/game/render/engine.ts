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
// One-time init guard. `mountBoard` is async and the engine can never be torn
// down, so two interleaved mounts must not both reach `engineInit`; the first
// call owns this promise and the rest await it (see `mountBoard`).
let startPromise: Promise<void> | null = null;
let visibilityBound = false; // our `visibilitychange` listener is attached once
let active = false;
let wantActive = false;
let currentStore: GameStore | null = null;
let bounds: Bounds | null = null;

// Largest backing-store the engine may allocate. The engine default (1920×1080)
// caps `mainCanvasSize` and then sets CSS size to maxSize/devicePixelRatio, so on
// a tall high-DPI phone (e.g. 932 CSS px at dpr 3 → 2796 > 1080) the canvas would
// collapse to a fraction of the viewport. 4096 is the universally-safe WebGL
// canvas/texture dimension and covers every current device at dpr ≤ 3.
const CANVAS_MAX = 4096;

const CAMERA_FIT = 0.95; // leave a small margin around the board
const HEX_LINE_WIDTH = 1; // world units; matches HexTile's thin black border
const SP_TEXT_SIZE = 16; // world units
const SP_TEXT_FILL = hexToRgb('#ffffff');
const SP_TEXT_OUTLINE = hexToRgb('#010203');
const HIGHLIGHT_COLOR = hexToRgb('#ffcc00'); // move-target outline (matches HexTile)
const HIGHLIGHT_WIDTH = 3;
const TARGET_COLOR = hexToRgb('#cc2222'); // valid fire/charge target hex tint
const TARGET_ALPHA = 0.35; // subtle translucent fill
const DIM_ALPHA = 0.4; // activated (spent) counters fade back
// Armed/pending action: bolder than the "available" tiers above so the tapped
// target reads as committed-pending vs merely-reachable.
const PENDING_MOVE_COLOR = hexToRgb('#5aa9e6'); // light blue: armed move destination
const PENDING_MOVE_ALPHA = 0.5;
const PENDING_COMBAT_COLOR = hexToRgb('#ff2d2d'); // bold red: armed fire/charge target
const PENDING_COMBAT_ALPHA = 0.6;

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

/** Dispatch one counter primitive to its LittleJS draw call, in world space.
 * `alpha` scales every color (used to fade activated/spent counters). */
function drawPrimitive(prim: Primitive, center: { x: number; y: number }, alpha = 1) {
	const { drawPoly, drawLine, drawEllipse, vec2 } = LJS!;
	switch (prim.kind) {
		case 'poly':
			drawPoly(
				prim.points.map((p) => toCounterWorld(p, center)),
				prim.fill ? color(prim.fill, alpha) : TRANSPARENT(),
				prim.lineWidth ?? 0,
				prim.stroke ? color(prim.stroke, alpha) : TRANSPARENT()
			);
			break;
		case 'line':
			drawLine(
				toCounterWorld(prim.a, center),
				toCounterWorld(prim.b, center),
				prim.width,
				color(prim.color, alpha)
			);
			break;
		case 'ellipse':
			drawEllipse(
				toCounterWorld(prim.center, center),
				vec2(prim.diameter, prim.diameter),
				prim.fill ? color(prim.fill, alpha) : TRANSPARENT(),
				0,
				prim.lineWidth ?? 0,
				prim.stroke ? color(prim.stroke, alpha) : TRANSPARENT()
			);
			break;
	}
}

/** Draw every unit's counter + SP readout from the store. Activated (spent)
 * units fade back so the available ones read as actionable. */
function drawCounters(store: GameStore) {
	const anchor = spAnchor();
	for (const u of store.units) {
		const center = store.takesCordsReturnsPos(u.coordinates);
		if (!center) continue;
		const a = u.activated ? DIM_ALPHA : 1;
		for (const prim of counterPrimitives(u, u.selected)) drawPrimitive(prim, center, a);
		// SP readout (world-space drawText renders upright; the Y-flip is only on position).
		LJS!.drawText(
			String(u.strengthPoints),
			toCounterWorld(anchor, center),
			SP_TEXT_SIZE,
			color(SP_TEXT_FILL, a),
			3,
			color(SP_TEXT_OUTLINE, a),
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

	// Valid combat targets: a subtle red fill on the target hex (fire + charge,
	// unified) — the "available" tier. The armed target gets the bold tier below.
	const targetTint = color(TARGET_COLOR, TARGET_ALPHA);
	for (const t of [...currentStore.validFireTargets, ...currentStore.validChargeTargets]) {
		const hex = currentStore.hexAt(t.coordinates);
		if (hex)
			drawPoly(
				hex.corners.map((c) => toWorld(c)),
				targetTint,
				0
			);
	}

	// Armed/pending action (tapped once, awaiting confirm): a bold fill on top of
	// the available tiers — light blue for a move destination, bold red for a
	// fire/charge target.
	const pending = currentStore.pendingAction;
	if (pending) {
		const hex =
			pending.kind === 'move'
				? currentStore.hexAt(pending.coords)
				: (() => {
						const target = currentStore.units.find((u) => u.id === pending.targetId);
						return target ? currentStore.hexAt(target.coordinates) : null;
					})();
		if (hex) {
			const fill =
				pending.kind === 'move'
					? color(PENDING_MOVE_COLOR, PENDING_MOVE_ALPHA)
					: color(PENDING_COMBAT_COLOR, PENDING_COMBAT_ALPHA);
			drawPoly(
				hex.corners.map((c) => toWorld(c)),
				fill,
				0
			);
		}
	}

	drawCounters(currentStore);
}

function noop() {}

function showCanvases() {
	// Explicit z-index (not the engine's default `auto`) so the DOM chrome overlay
	// reliably paints above both canvases regardless of the page's stacking chain.
	if (LJS?.mainCanvas) {
		LJS.mainCanvas.style.display = '';
		LJS.mainCanvas.style.zIndex = '0';
	}
	if (LJS?.glCanvas) {
		LJS.glCanvas.style.display = '';
		LJS.glCanvas.style.zIndex = '0';
	}
}

function hideCanvases() {
	if (LJS?.mainCanvas) LJS.mainCanvas.style.display = 'none';
	if (LJS?.glCanvas) LJS.glCanvas.style.display = 'none';
}

// Pause the engine simulation whenever the board is unmounted or the tab is
// hidden. `setPaused(true)` halts `gameUpdate` (our input polling) and object
// updates; `gameUpdatePost` + render still run, so the board stays correct and
// resumes instantly. This stops a backgrounded board from polling input and
// avoids a catch-up burst on return, on top of the browser's own hidden-tab RAF
// throttling. Visibility is read live, so it is correct even if the document is
// already hidden at mount time.
function applyPauseState() {
	LJS?.setPaused(!wantActive || document.hidden);
}

function onVisibilityChange() {
	applyPauseState();
}

/** Import the engine and run `engineInit` exactly once for the page lifetime. */
async function startEngine(): Promise<void> {
	const mod = await import('littlejsengine');
	LJS = mod;
	// Must be set before engineInit (affects canvas/init setup). Raise the
	// backing-store cap so tall high-DPI phones aren't downscaled (see CANVAS_MAX).
	mod.setCanvasMaxSize?.(mod.vec2(CANVAS_MAX, CANVAS_MAX));
	await mod.engineInit(noop, gameUpdate, gameUpdatePost, gameRender, noop);
	mod.setDebugWatermark?.(false); // may be absent in production builds
	// The canvas is an opaque bitmap with no keyboard/AT affordance (board
	// interaction is touch/pointer only — a documented gap; the accessible
	// controls live in the DOM chrome). Label it so AT at least announces it.
	mod.mainCanvas?.setAttribute('aria-label', 'Game board');
	if (!visibilityBound) {
		document.addEventListener('visibilitychange', onVisibilityChange);
		visibilityBound = true; // engine is a page-lifetime singleton; attach once
	}
}

/** Start (or re-show) the board for `store`. Safe to call on every component mount. */
export async function mountBoard(store: GameStore): Promise<void> {
	wantActive = true;
	currentStore = store;
	bounds = computeBounds(store);

	// Single-instance guard: the first mount owns init; concurrent/later mounts
	// await the same promise rather than creating a second (un-tearable) engine.
	if (!startPromise) startPromise = startEngine();
	await startPromise;

	if (!wantActive) {
		// Component unmounted while the engine was loading — stay hidden/paused.
		hideCanvases();
		applyPauseState();
		return;
	}
	showCanvases();
	active = true;
	applyPauseState();
}

/** Stop rendering, pause the simulation, and hide the canvases. */
export function unmountBoard(): void {
	wantActive = false;
	active = false;
	// KNOWN LEAK: the RAF loop and document input listeners can't be removed
	// (LittleJS exposes no shutdown). We hide the body-level canvases and pause
	// the simulation, so a swapped-out board neither shows nor polls input — the
	// production-safe answer given the single-instance singleton model.
	hideCanvases();
	applyPauseState();
}
