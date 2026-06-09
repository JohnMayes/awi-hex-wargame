# Rendering layer (`render/`) — LittleJS integration guide

This directory is the **LittleJS rendering layer** that is incrementally replacing the SVG `ui/` components. Read this before writing engine code.

- **Roadmap & phases:** `docs/littlejs-migration-roadmap.md` (R0–R11; check which phase you're in)
- **Why/architecture rationale:** `docs/littlejs-rendering-evaluation.md`
- **Status:** R0–R6 complete — **past the parity gate**. LittleJS is the default renderer (SVG retained at `/?render=svg`). The board (terrain, counters, highlights, combat overlays), input (select/move/fire/charge), and DOM chrome overlay are all in place. Next: R7 (lifecycle/mobile/a11y hardening) and R8 (PNG art). Engine lifecycle + draw loop live in `engine.ts`; coordinate/picking glue in `boardGeometry.ts`; click→store routing in `boardInput.ts`; `LittleBoard.svelte` is now a thin mount wrapper. The DOM chrome (top/bottom bars, banner) lives in `+page.svelte` as shared snippets, overlaid over the body-rooted canvas with `pointer-events` discipline (a `swallowPointer` attachment stops `mousedown`/`touchstart` from reaching the engine's `document` listeners).

## This is NOT the LittleJS-AI workflow

The sibling `../LittleJS-AI/` repo (and its `CLAUDE.md`) assume a **global `<script>`, no-bundler, standalone-`games/`-folder, 4-space-indent** workflow. **Ours is the opposite** — do not copy its setup/structure conventions verbatim. Here:

- **ESM via Vite.** Import from the `littlejsengine` npm package (a namespace object, referred to as `LJS` in our code), never a global `<script>` tag. Engine globals are accessed as `LJS.drawPoly`, `LJS.vec2`, etc.
- **Client-only mount.** `engineInit` touches `document`, so call it **only inside `onMount`** (we use `await import('littlejsengine')` there). The page stays SSR'd; the engine simply never runs server-side. Never call engine APIs at module top level or in a `$derived`/`$effect` that can run during SSR.
- **Project style:** tabs + the repo Prettier config (`pnpm format`). Not 4-space.
- **Validate `.svelte`** with the Svelte MCP autofixer before finishing (see root `CLAUDE.md`).

## Hard-won conventions (confirmed in R0)

- **Y-flip is the whole coordinate bridge.** honeycomb-grid is pixel-space **Y-down** (topLeft origin); LittleJS world space is **Y-up**. Convert every honeycomb point with `LJS.vec2(p.x, -p.y)`. Hex geometry stays in honeycomb (`hex.corners`, `hex.x/y`, `store.takesCordsReturnsPos`) — never recompute it here.
- **Camera fit:** `scale = min(canvasW/boardW, canvasH/boardH) * 0.95`; `cameraPos = (cx, -cy)` (board-bounds center, Y-flipped). Recompute in `gameUpdatePost` so resize is handled for free.
- **Use the camera setters, never assignment.** `LJS.cameraPos` / `LJS.cameraScale` are read-only ESM live bindings — `LJS.cameraPos = ...` throws. Use `LJS.setCameraPos(...)` / `LJS.setCameraScale(...)`.
- **No clean shutdown exists → single-instance singleton.** LittleJS stores no `requestAnimationFrame` handle and attaches non-removable `document` input listeners, so the RAF loop and listeners **cannot be torn down**. Guard so `engineInit` runs **once per page load**; on unmount, hide canvases (don't try to stop the loop). Full lifecycle hardening is **R7**.
- **HMR:** the engine can't be hot-patched cleanly (would stack a second loop), so `LittleBoard.svelte` forces a full reload via `import.meta.hot.accept(() => location.reload())`.
- **`setDebugWatermark` may be stripped** from production builds — call it guarded: `LJS.setDebugWatermark?.(false)`.

## The store contract (the only coupling)

The render layer is a **pure consumer** of `GameStore` — never put game logic, rules, or RNG in a render callback. Svelte _pushes_; LittleJS _pulls_ — read current state every frame in callbacks (no `$effect` needed for the board):

- **Read:** `store.grid`, `store.units`, `store.validMoveTargets`/`validFireTargets`/`validChargeTargets`, `store.selectedUnit`, `store.turn`, `store.activePlayer`, `store.victoryOutcome`, `store.isGameOver`.
- **Write (on input):** `selectUnit`, `beginAction('move'|'fire')`, `moveUnit`, `fireAt`, `chargeAt`, `endPlayerTurn`.

Reading a runes `$state`/`$derived` from a plain engine callback returns the current value — that's fine and intended.

## Use engine helpers — don't reimplement

Before writing a utility, check the API. Reach for: `isOverlapping` (AABB), `screenToWorld`/`worldToScreen`, `isOnScreen` (culling), `Timer` (timed events), `keyDirection()`/`gamepadStick()` (input), `mousePos` (already world-space)/`mouseWasPressed(0)` (fires once per click/tap, incl. touch). Don't redefine `Vector2`/math built-ins.

## Common LittleJS pitfalls

- `drawCircle`/`drawEllipse` size is **diameter, not radius**.
- World space is **Y-up** (gravity is −Y) — the reason for our flip.
- `drawText` is **world-space**; `drawTextScreen` is **screen/pixel-space** (use the latter for HUD).
- `ParticleEmitter.speed` is **units per frame**, not per second (relevant at R10).
- Angles are **clockwise-positive** in LittleJS (Box2D is the opposite, if ever used).

## Where to look things up (version-accurate, no vendored copies)

Installed engine is `littlejsengine@^1.18.18`. Authoritative sources, all at stable paths:

- **Full typed API surface:** `node_modules/littlejsengine/dist/littlejs.d.ts` — always matches the installed version; grep this first.
- **Integration how-tos:** `node_modules/littlejsengine/FAQ.md` — has dedicated sections for _ES module_, _TypeScript_, _Vite_, _camera/world coordinates_, _tile function_, _particles_, _on-screen culling_, _touch input_.
- **Readable source:** `node_modules/littlejsengine/src/`.
- **Examples:** `../LittleJS/examples/vite-starter/` (our bundler model) and `../LittleJS-AI/templates/boardGame.html` (closest precedent — turn-based grid + `worldPosToCell` picking). The helper modules there (`menus.js`, `gameFx.js`, `textureGenerator.js`) are **global-style and won't import into our ESM build** — reference for patterns only; port, don't copy. `gameFx.js` is the reference for R10 FX; the `.claude/skills/` (iterate-sprite, atlas-shape-art) are useful references when we hit PNG art in R8.
