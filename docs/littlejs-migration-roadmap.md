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

### R1: Coordinate & Picking Bridge

Extract the renderer-neutral geometry glue as **pure functions** so it's Node-testable and the spike's ad-hoc Y-flip becomes a single audited conversion.

- `boardGeometry.ts`: `worldToHexPixel` / `hexPixelToWorld` (the Y-flip + any camera offset), and `pickHex(worldPos, grid)` wrapping honeycomb's `pointToHex`
- `pickUnit(worldPos, units, grid)`: world coord → unit at that hex (coordinate compare, reusing `coordsEqual`)
- All functions take plain inputs (no `mousePos`/engine globals) so they unit-test without a browser

**Files:** new `src/lib/game/render/boardGeometry.ts`
**Tests:** new `boardGeometry.spec.ts` (Node) — round-trip world↔pixel, Y-flip correctness, `pickHex` at hex centers and near hexside boundaries, off-grid → null, `pickUnit` hit/miss/empty-hex
**Depends on:** R0

---

### R2: Static Board Rendering + Camera

Render the real terrain board with a camera that fits any scenario map, replacing the spike's outline.

- Port terrain → color from `HexTile.svelte:12` into `terrainStyle.ts`; fill each hex via `drawPoly`
- Camera fit: compute map pixel bounds (as `+page.svelte:47-58` does for the SVG viewBox) and set `cameraPos`/`cameraScale` to center-and-fit; recompute on canvas resize
- Hex borders/stroke to match current look

**Files:** new `src/lib/game/render/terrainStyle.ts`; `LittleBoard.svelte`; new `render/engine.ts` (gameInit/gameRender wiring)
**Tests:** `terrainStyle.spec.ts` (every `TerrainType` maps to a color); manual visual parity vs SVG at several window sizes / mobile viewport
**Depends on:** R1

---

### R3: Unit Counter Rendering

Draw the 6 unit types from `store.units`, as immediate-mode shapes first (PNG deferred to R8 so we adopt LittleJS before any art exists).

- Port the NATO symbols in `UnitCounter.svelte` (rects/lines/circles per type) to `drawPoly`/`drawLine`/`drawRect`/`drawEllipse` in `counters.ts`
- Player color fill (blue/red), `selected` gold outline, SP readout via `drawText`
- Position via `store.takesCordsReturnsPos(unit.coordinates)` → world (reuse R1 conversion)

**Files:** new `src/lib/game/render/counters.ts`; `engine.ts`
**Tests:** `counters.spec.ts` for any pure shape-geometry helpers; manual visual parity (all 6 types, both players, selected state, SP)
**Depends on:** R2

---

### R4: Input — Selection & Movement

Make the canvas interactive. Poll input in `gameUpdate`, resolve to a hex/unit, route to the store — mirroring the click branching in `+page.svelte:99-107`.

- `gameUpdate`: on `mouseWasPressed(0)`, use R1 `pickUnit`/`pickHex` on `mousePos`; branch to `store.selectUnit` / `store.beginAction('move')` / `store.moveUnit(coords)`
- Render `store.validMoveTargets` as the yellow highlight overlay (port from `HexTile.svelte:35`)
- Touch parity: confirm tap == click via LittleJS touch routing

**Files:** `engine.ts`; `LittleBoard.svelte`
**Tests:** Playwright interaction test — synthetic click at a unit's screen pixel selects it (assert `store.selectedUnit`); click a highlighted hex moves it (assert `store.units` coords). Drive via the R1 conversion to compute click pixels.
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
