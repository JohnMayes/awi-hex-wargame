<script lang="ts" module>
	// R0 SPIKE — throwaway. Mounts the LittleJS engine once per page load and
	// draws a static hex grid from the store to verify (a) it embeds in SvelteKit
	// without breaking SSR/build, (b) the honeycomb Y-down -> LittleJS Y-up flip
	// renders upright, and (c) what leaks on unmount. No input, no real counters,
	// no chrome integration — those are R3/R4/R6. See docs/littlejs-migration-roadmap.md.
	import type { GameStore } from '$lib/game/state/gameStore.svelte';

	type LJSModule = typeof import('littlejsengine');
	type Bounds = { boardW: number; boardH: number; cx: number; cy: number };

	// Module scope: shared by the engine's perpetual RAF loop, which outlives any
	// single component instance (LittleJS exposes no shutdown — see cleanup below).
	let LJS: LJSModule | null = null;
	let started = false;
	let active = false;
	let currentStore: GameStore | null = null;
	let bounds: Bounds | null = null;

	// HMR: there is no way to stop the engine's RAF loop or remove its document
	// listeners, so a partial hot-patch would stack a second engine. Force a full
	// reload instead (mirrors LittleJS's official examples/vite-starter).
	if (import.meta.hot) import.meta.hot.accept(() => location.reload());

	// Honeycomb pixel space is Y-down (topLeft origin); LittleJS world space is
	// Y-up. Negating Y is the entire bridge for R0.
	function toWorld(p: { x: number; y: number }) {
		return LJS!.vec2(p.x, -p.y);
	}

	function gameUpdatePost() {
		if (!active || !LJS || !bounds) return;
		const cw = LJS.mainCanvasSize.x;
		const ch = LJS.mainCanvasSize.y;
		if (!cw || !ch || !bounds.boardW || !bounds.boardH) return;
		// Fit the board to the canvas every frame (also handles window resize for free).
		const scale = Math.min(cw / bounds.boardW, ch / bounds.boardH) * 0.95;
		LJS.setCameraScale(scale);
		LJS.setCameraPos(LJS.vec2(bounds.cx, -bounds.cy));
	}

	function gameRender() {
		if (!active || !LJS || !currentStore) return;
		const st = currentStore;
		const grid = st.grid;
		if (!grid) return;

		const { drawPoly, drawRect, vec2, rgb } = LJS;
		const fill = rgb(0.85, 0.8, 0.7); // flat fill; terrain colors are R2
		const stroke = rgb(0, 0, 0);

		for (const hex of grid) {
			drawPoly(
				hex.corners.map((c) => toWorld(c)),
				fill,
				1,
				stroke
			);
		}

		// Orientation check: draw each unit as a plain colored dot at its hex
		// center. PITCHED_BATTLE places units asymmetrically, so a correct Y-flip
		// puts the dots where the SVG counters sit. These are NOT real counters (R3).
		for (const u of st.units) {
			const p = st.takesCordsReturnsPos(u.coordinates);
			if (!p) continue;
			drawRect(
				toWorld(p),
				vec2(20, 20),
				u.player === 0 ? rgb(0.1, 0.34, 0.86) : rgb(0.88, 0.14, 0.14)
			);
		}
	}

	function noop() {}
</script>

<script lang="ts">
	import { onMount } from 'svelte';

	let { store }: { store: GameStore } = $props();

	onMount(() => {
		currentStore = store;

		// Board bounds from hex corners — same min/max logic as the SVG viewBox
		// in +page.svelte (kept renderer-neutral; extracted to boardGeometry.ts in R1).
		const pts = [...store.grid!].flatMap((h) => h.corners);
		const xs = pts.map((p) => p.x);
		const ys = pts.map((p) => p.y);
		const minX = Math.min(...xs);
		const maxX = Math.max(...xs);
		const minY = Math.min(...ys);
		const maxY = Math.max(...ys);
		bounds = {
			boardW: maxX - minX,
			boardH: maxY - minY,
			cx: (minX + maxX) / 2,
			cy: (minY + maxY) / 2
		};

		let cancelled = false;
		void (async () => {
			// Single-instance guard: never create a second engine (it can't be torn down).
			if (!started) {
				const mod = await import('littlejsengine');
				if (cancelled) return;
				LJS = mod;
				// No rootElement -> defaults to document.body, so the canvases survive
				// this component's unmount and we can re-show them on re-mount.
				await mod.engineInit(noop, noop, gameUpdatePost, gameRender, noop);
				mod.setDebugWatermark?.(false); // may be absent in production builds
				started = true;
			}
			if (LJS?.mainCanvas) LJS.mainCanvas.style.display = '';
			if (LJS?.glCanvas) LJS.glCanvas.style.display = '';
			active = true;
		})();

		return () => {
			cancelled = true;
			active = false;
			// KNOWN LEAK (deferred to R7): the engine's RAF loop and its non-removable
			// document input listeners persist after unmount. We can only hide the
			// body-level canvases so nothing lingers visually after leaving LJS mode.
			if (LJS?.mainCanvas) LJS.mainCanvas.style.display = 'none';
			if (LJS?.glCanvas) LJS.glCanvas.style.display = 'none';
		};
	});
</script>

<!-- The engine renders to canvases appended to document.body; this component
     intentionally owns no DOM of its own. -->
