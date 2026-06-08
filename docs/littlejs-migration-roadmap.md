# LittleJS Rendering Migration — Implementation Roadmap

Companion to [`littlejs-rendering-evaluation.md`](./littlejs-rendering-evaluation.md). That report concluded the swap is viable as a **hybrid** (LittleJS canvas for the board, Svelte DOM for chrome) confined to the ~580 LOC render layer, with `core/`, `data/`, `state/`, and their tests untouched.

This roadmap decomposes that swap into dependency-ordered phases, modelled on the M0–M13 milestones in `README.md`. Rendering milestones are prefixed **R** to keep them distinct from the game-logic milestones (M). Each phase ends playable or A/B-toggleable; nothing in the tested core moves until the final decommission.

## Conventions

- **Renderer toggle.** From R0 the route chooses renderer via a flag (`?render=ljs` query param or a `RENDERER` const). SVG stays the default and fully functional until the **Parity Gate (R6)**, so every phase is A/B-comparable and instantly reversible.
- **New code lives in `src/lib/game/render/`** — parallel to the existing `ui/`, never importing into `core/`/`state/`. The store contract (§2 of the report) is the only coupling: read `store.*`, call `store.method()`.
- **Test-first for pure modules** — same rule as `core/`. Coordinate/picking math gets Node `.spec.ts` before wiring. Canvas behaviour is covered by Playwright interaction tests that drive synthetic clicks and assert on **store state**, not pixels.

---

### ~~R0: Spike & Mount~~ COMPLETE

Proved the engine mounts inside SvelteKit, client-only, and draws the board from store data. All three unknowns killed: SSR/build is safe, the Y-flip renders upright, and the teardown story is now concrete.

- `LittleBoard.svelte`: dynamic `import('littlejsengine')` + `engineInit(...)` called **only inside `onMount`**, so it never runs during SSR. Engine wiring is inlined for the spike (extracted to `render/engine.ts` + `boardGeometry.ts` in R1/R2)
- Draws the full `PITCHED_BATTLE` grid via `drawPoly(hex.corners.map(c => vec2(c.x, -c.y)))` plus asymmetric unit dots as the orientation check — **Y-flip confirmed upright** against the SVG layout
- Camera fit: `scale = min(canvasW/boardW, canvasH/boardH) * 0.95`, `cameraPos = (cx, -cy)`, recomputed each frame in `gameUpdatePost` (resize-free) — **confirmed correct**
- `?render=ljs` toggle in `+page.svelte`; SVG remains the default, existing markup wrapped untouched in the `{:else}` branch
- `import.meta.hot.accept(() => location.reload())` — **full reload confirmed** on dev edits
- **Single-instance guard is mandatory** (the page kept exactly one canvas pair across nav, confirmed): LittleJS stores no RAF handle and its `document` listeners are non-removable, so there is no clean shutdown. R0 mounts a body-rooted singleton and hides/shows canvases on unmount; the RAF + listener leak is real and **deferred to R7**

**Files:** new `src/lib/game/render/LittleBoard.svelte`; `+page.svelte` (toggle). (`littlejsengine` was already a dependency.)
**Verified:** `pnpm check` 0 errors; `pnpm build` SSR-safe; Svelte autofixer clean; 530 server tests pass; dev serves `/` and `/?render=ljs` at 200. Manual: Y-flip upright, camera good, single canvas pair on nav, full reload on HMR. (Pre-existing browser test `page.svelte.spec.ts` fails independently of this change — strict-mode multi-match on counter `<svg>`s.)
**Carried into later phases:** Y-flip `vec2(p.x, -p.y)` → R1; camera-fit formula → R2; no-shutdown leak inventory + body-rooted-vs-container mounting decision → R7/R6.

---

### ~~R1: Coordinate & Picking Bridge~~ COMPLETE

Extracted the renderer-neutral geometry glue as **pure functions**, so it's Node-testable and the spike's ad-hoc Y-flip is now a single audited conversion.

- `render/boardGeometry.ts`: `worldToHexPixel` / `hexPixelToWorld` (the Y-flip is the entire bridge — confirmed no camera offset, since LittleJS `mousePos` is already world-space and the camera transform is the engine's job), `pickHex(world, grid)` wrapping honeycomb's `pointToHex(p, { allowOutside: false })` → `HexCell | null`, and `pickUnit(world, units, grid)` → unit via `coordsEqual` (reused from `core/hex.ts`)
- Plain `{ x, y }` inputs (a LittleJS `Vector2` satisfies it structurally); no engine import, so it's pure and Node-testable. `LittleBoard.svelte` now routes its `toWorld` and camera-center through `hexPixelToWorld` — the inline flip is gone
- Lives in `render/` (renderer/input glue, depends on `core/`, not game logic). Bounds/camera extraction stays inline in the spike until R2

**Files:** new `src/lib/game/render/boardGeometry.ts`; `LittleBoard.svelte` (uses `hexPixelToWorld`)
**Tests:** new `render/boardGeometry.spec.ts` — 9 Node tests: Y-flip negate/preserve + round-trip, `pickHex` at every hex center (world round-trip), either-side-of-a-shared-hexside, off-grid → null; `pickUnit` hit / distinguishes-units / empty-hex / off-grid → null. All green; full suite 538 passed (the lone `page.svelte.spec.ts` failure is pre-existing and unrelated).
**Depends on:** R0

---

### ~~R2: Static Board Rendering + Camera~~ COMPLETE

Rendered the real terrain board with a camera that fits any scenario map, and extracted the engine lifecycle + draw loop out of the spike component.

- `render/terrainStyle.ts` (pure): terrain fill palette mirrored from `HexTile.svelte` (removed at R11; then sole palette), `hexToRgb` (→ 0..1 for LittleJS `rgb()`), `terrainFill(terrain)`, and `hexStrokeHex` (`#000000`, matching HexTile's border). Each hex filled via `drawPoly(corners, fill, lineWidth, stroke)`
- `render/engine.ts`: owns the single-instance lifecycle (`mountBoard`/`unmountBoard` with a `wantActive` guard against unmount-during-load), camera-fit (`scale = min(cw/boardW, ch/boardH) * 0.95`, `cameraPos` = board center, recomputed each frame in `gameUpdatePost` so resize is free), and `gameRender`. Dynamic-imports `littlejsengine` inside `mountBoard`, so importing the file is SSR-safe
- `LittleBoard.svelte` reduced to a thin mount wrapper (`onMount` → `mountBoard`, cleanup → `unmountBoard`) + the HMR full-reload guard
- Unit dots remain as **explicitly-labeled placeholders** until R3 (kept so the asymmetric layout stays Y-flip-verifiable — `PITCHED_BATTLE`'s terrain is point-symmetric)

**Files:** new `src/lib/game/render/terrainStyle.ts` + `engine.ts`; `LittleBoard.svelte` (slimmed)
**Tests:** new `terrainStyle.spec.ts` (4 Node tests: every `TerrainType` → 6-digit hex, `hexToRgb` parsing, in-range rgb for all terrains, `terrainFill` matches palette). Full suite 542 passed; `pnpm build` SSR-safe; dev serves both routes at 200. Manual: terrain colors + black borders match SVG, camera fits across window/mobile sizes (confirmed).
**Depends on:** R1

---

### ~~R3: Unit Counter Rendering~~ COMPLETE

Drew the 6 unit types from `store.units` as immediate-mode shapes (PNG deferred to R8 so we adopt LittleJS before any art exists). Final art/UI tuning is a later step — this phase gets recognizable counters on the canvas.

- `render/counters.ts` (pure, engine-free): ports the NATO symbols from `UnitCounter.svelte` into renderer-neutral `Primitive` descriptors (`poly`/`line`/`ellipse`) in **counter-local pixel space** (Y-down, so the existing `toWorld()` flip renders them upright). `counterPrimitives(unit, selected)` emits the player-colored base box (gold outline when `selected`) plus the per-type glyph: Line=box+X, Light=dashed box+X, Dragoons=box+`/`+circle, Light Horse=box+`/`, Horse=box+`/`+midline, Artillery=box+circle. Colors ported via `terrainStyle.hexToRgb`. `dashedRectSegments()` tiles the light-infantry border into dashes (LittleJS has no native dash support); `spAnchor()` positions the SP label
- `engine.ts`: new `drawPrimitive()` dispatcher maps each primitive to `drawPoly`/`drawLine`/`drawEllipse` (offset by the unit's board pixel center via `store.takesCordsReturnsPos`, then `toWorld()`; transparent fill alpha for outline-only shapes; ellipse sized by **diameter**). `drawCounters()` replaces the R2 placeholder dots and adds the SP readout via world-space `drawText`. Pure `counters.ts` keeps no engine import (SSR-safe); `engine.ts` stays the sole engine consumer
- **SP readout** is per this roadmap but slightly beyond strict SVG parity — the SVG `UnitCounter.svelte` doesn't render SP. Kept as additive; not a parity risk

**Files:** new `src/lib/game/render/counters.ts` + `counters.spec.ts`; `engine.ts` (draw dispatch + SP text)
**Tests:** new `counters.spec.ts` — 10 Node tests (base poly + player colors, gold-on-select, two-diagonals for infantry, one-diagonal + midline delta for cavalry, filled player-color circle for dragoons/artillery, dashed-border tiling lies on the perimeter with the expected segment count, SP anchor quadrant). Full suite 552 passed (the lone `page.svelte.spec.ts` failure is pre-existing and unrelated). `pnpm check` 0 errors; `pnpm lint` clean; `pnpm build` SSR-safe. Manual visual parity (all 6 types, both players, selected state, SP) deferred to the art/UI pass
**Depends on:** R2

---

### ~~R4: Input — Selection & Movement~~ COMPLETE

Made the canvas interactive for selection + movement (fire/charge is R5). Polls input each frame, resolves to a hex/unit via the R1 pickers, and routes to the store — mirroring the click branching in `+page.svelte`.

- `render/boardInput.ts` (pure, engine-free, Node-testable): `resolveBoardClick(world, store, rng = Math.random)` is the whole click→store branch over the store contract — enemy-unit click → no-op (R5); friendly unit already selected → `store.beginAction('move')`; other friendly → `store.selectUnit`; else `pickHex` → `store.moveUnit`. Reuses `boardGeometry`'s `pickUnit`/`pickHex` and threads an injectable `rng` per the codebase convention
- **Move trigger (temporary until R6's DOM Move button):** `validMoveTargets` is empty until `beginAction('move')` activates the unit (`gameStore.svelte.ts:63-75`), so the canvas affordance is **a second click on the already-selected unit** to begin move (keeps select≠activate, so selection never gambles the command check)
- `engine.ts`: new `gameUpdate()` routes world-space `mousePos` to `resolveBoardClick` on `mouseWasPressed(0)` (wired into the `engineInit` gameUpdate slot; touch routes through `mousePos` for free). `gameRender` draws `validMoveTargets` as yellow outline polys (`#ffcc00`, width 3) between terrain and counters — port of `HexTile.svelte`
- `LittleBoard.svelte` unchanged — LittleJS owns the canvas input listeners; no DOM wiring needed

**Files:** new `src/lib/game/render/boardInput.ts` + `boardInput.spec.ts`; `engine.ts` (gameUpdate + input wiring + move highlights)
**Tests:** new `boardInput.spec.ts` — 5 Node tests on the same `TEST_UNITS/TEST_MAP/TEST_LEADERS` fixtures as `gameStore.spec.ts` (select on first click; begin-move on second click → `activeUnitId` set + highlights present; move on valid-hex click; enemy click ignored; off-grid no-op), driven by the R1 `hexPixelToWorld` conversion. Chose Node-testing the pure branch over the roadmap's originally-suggested Playwright canvas-pixel test (more robust; canvas wiring covered manually). Full suite 557 passed (the lone `page.svelte.spec.ts` failure is pre-existing/unrelated); `pnpm check` 0 errors; `pnpm lint` clean; `pnpm build` SSR-safe. Manual: tap-to-select → tap-again-for-highlights → tap-hex-to-move confirmed, incl. touch on a mobile viewport
**Depends on:** R3

---

### R5: Combat Targeting & Action Overlays

Complete the action loop on canvas: fire and charge, with their target overlays.

- Render `validFireTargets` (red ring) and `validChargeTargets` (orange ring) — port radii/colors from `UnitCounter.svelte:26-47`
- Route enemy-counter clicks to `store.fireAt` / `store.chargeAt` based on which target set the unit is in (same branch as `+page.svelte:102-106`)
- `beginAction('fire')` wiring

**Files:** `engine.ts`; `counters.ts` (rings)
**Tests:** Playwright — fire reduces target SP / removes eliminated unit; charge moves/eliminates per outcome (assert store state). Reuse the gameStore-level outcomes already covered by `gameStore.spec.ts`; here we only assert the click path reaches them.
**Depends on:** R4

---

### R6: DOM Chrome Integration — **PARITY GATE**

Reach full feature parity with the SVG renderer, then flip the default.

- Overlay the existing Svelte top bar (turn/player), victory banner, and bottom action bar (Move/Fire buttons, unit readout) over the canvas via CSS layering; these stay reactive runes DOM (the board-game template overlays DOM menus the same way)
- `pointer-events` discipline so chrome buttons and canvas taps don't fight
- Flip the renderer toggle default to LittleJS; SVG remains reachable behind the flag for rollback
- Preserve `env(safe-area-inset-*)` and `100dvh` handling already in `+page.svelte`

**Files:** `+page.svelte` (overlay layout, default flip); `LittleBoard.svelte`
**Tests:** full manual playthrough on desktop + mobile viewport; Playwright smoke covering a full activation (select → move → fire → end turn) and a victory banner
**Depends on:** R5
**Gate:** at this point the SVG layer is feature-complete-replaceable. Everything after is enhancement; everything before was parity.

---

### R7: Lifecycle & Mobile Hardening

Make the engine integration production-safe — the §6.2 lifecycle risks from the report.

- Single-instance guard (one engine per page); robust teardown on unmount and on hot-reload
- Resize / `devicePixelRatio` handling; orientation changes; pinch/scroll suppression as appropriate
- Accessibility: a parallel keyboard/`aria` affordance for unit selection (canvas is opaque) — or a documented, ticketed a11y gap with a DOM fallback list of units. The current SVG counters carry `role`/`tabindex`/`aria-label`/Enter-key handling (`UnitCounter.svelte:48-54`) that the canvas loses.

**Files:** `LittleBoard.svelte`; `engine.ts`; possibly a small `render/a11y.ts`
**Tests:** mount/unmount/navigate stress (no leaked loops/listeners); manual mobile device pass; keyboard-only selection if implemented
**Depends on:** R6

---

### R8: PNG Tile Art

Swap immediate-mode shapes for sprite atlases — the richer-graphics payoff.

- Counter atlas + terrain atlas in `static/`; load via `engineInit` image list; index with `tile()`
- Replace `counters.ts` `drawPoly` calls with `drawTile`; optionally tile-textured terrain in `terrainStyle.ts`
- Keep shape-drawing as a fallback path so the game is never blocked on art

**Files:** `static/` assets; `counters.ts`; `terrainStyle.ts`; `engine.ts` (image load)
**Tests:** manual visual; asset-load smoke (engine starts with atlases present); confirm shape fallback still renders if assets absent
**Depends on:** R6 (independent of R7)

---

### R9: Movement & Camera Animation

Use the RAF loop for motion that SVG made awkward.

- Tween unit position on `moveUnit`/retreat between previous and new hex centers; tween defender retreat/charge advance
- Optional camera pan to the active unit; smooth scale on resize
- Animation reads from store transitions; never blocks or mutates game logic (logic remains instantaneous; animation is cosmetic interpolation)

**Files:** `engine.ts`; new `render/animation.ts`
**Tests:** manual; assert animations are non-blocking (store state is final immediately; a fast double-input can't corrupt state)
**Depends on:** R8 (so sprites animate, not placeholder shapes) — soft dependency; can follow R7

---

### R10: Particles & Sound

The remaining engine upside: feedback FX.

- Particle bursts on fire (muzzle/smoke), charge (dust), hit/elimination
- SFX via ZzFX (procedural, no assets) or audio files; spatial pan optional
- All triggered by reading `FireResult`/`ChargeResult` already returned by `store.fireAt`/`chargeAt`

**Files:** `engine.ts`; new `render/fx.ts`; optional `static/` audio
**Tests:** manual; mute/FX-off toggle works; no FX path can throw into the update loop
**Depends on:** R9

---

### R11: Decommission SVG

Remove the old renderer once LittleJS has been the default through real use.

- Delete `HexTile.svelte`, `UnitCounter.svelte`, the `<svg>` block, and the renderer toggle
- Delete/replace obsolete browser component tests (`page.svelte.spec.ts` and any SVG-component specs); keep all `core/`/`state/` tests untouched
- Update `CLAUDE.md` (architecture: `ui/` → `render/`, SVG → LittleJS) and `README.md`

**Files:** delete `ui/HexTile.svelte`, `ui/UnitCounter.svelte`; `+page.svelte`; `CLAUDE.md`; `README.md`
**Tests:** full suite green; `pnpm check`, `pnpm lint`, `pnpm build` clean
**Depends on:** R10 (or whenever the team commits to LittleJS-only) — do not remove SVG until confidence is earned in production.

---

### Phase Dependency Graph

```
R0  Spike & Mount
 │
R1  Coordinate & Picking Bridge   (pure, Node-tested)
 │
R2  Static Board + Camera
 │
R3  Unit Counter Rendering
 │
R4  Input — Selection & Movement
 │
R5  Combat Targeting & Overlays
 │
R6  DOM Chrome Integration ───────  ★ PARITY GATE (flip default; SVG retained)
 │
 ├── R7  Lifecycle & Mobile Hardening
 │
 └── R8  PNG Tile Art ─────────────  (independent of R7)
      │
      R9  Movement & Camera Animation
      │
      R10 Particles & Sound
      │
      R11 Decommission SVG          (only after production confidence)
```

R0→R6 is a strict chain to parity. R7 and R8 fork after the gate; R9–R11 follow the art track. R7 can land any time after R6.

### Design Principles

- **Render layer is a pure consumer of the store contract** — `render/` reads `store.*` and calls `store.method()`. No game logic, no RNG, no rules ever move into a render callback. If a phase tempts you to compute a rule in `gameRender`, it belongs in `core/`.
- **`core/`, `data/`, `state/` and their tests do not move until R11** — and even then only docs/tests change, never logic. The migration's whole justification is that the tested core is insulated; honor that.
- **Pixel geometry stays in honeycomb-grid** — never reimplement hex math in the renderer. `hex.corners`, `hex.x/y`, and `pointToHex` are the source of truth; R1 only converts coordinate _spaces_, it doesn't compute hex layout.
- **Parity before juice** — reach R6 (feature parity, default-flipped, SVG retained) before any PNG/animation/FX work. The gate is the decision point to ship.
- **Always reversible, always playable** — the renderer toggle keeps SVG live through R10. No phase leaves the game unplayable, and rollback is a flag flip until R11.
- **Test what's testable; be honest about the rest** — pure bridge math gets Node specs; click→store paths get Playwright state assertions; pixel fidelity is manual visual review. Don't fake coverage of visuals.
- **Client-only by construction** — the engine touches `document`; every mount is `onMount`/`browser`-guarded so SSR/prerender never executes it.
