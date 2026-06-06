# Evaluation: LittleJS as the Rendering Layer for the AWI Hex Wargame

**Date:** 2026-06-05
**Author:** investigation report
**Verdict:** ✅ **Viable — and the codebase is unusually well-suited to it.** Recommended as a hybrid (LittleJS canvas for the board, Svelte DOM for UI chrome), not a wholesale rewrite.

---

## 1. What we have today

The project is already render-agnostic in practice, not just in aspiration. Layering (verified against `src/lib/game/`):

| Layer                     | Files                                                                                                                              | LOC      | Svelte dependency                | Touched by a renderer swap?               |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | -------- | -------------------------------- | ----------------------------------------- |
| `core/` — pure logic      | hex, terrain, movement, los, combat, charge, morale, command, retreat, elimination, victory, types, unitDefinitions, log, scenario | ~1,900   | **none**                         | **No**                                    |
| `data/` — static          | maps, scenarios                                                                                                                    | ~245     | none                             | No                                        |
| `state/` — reactive store | `gameStore.svelte.ts`                                                                                                              | 713      | runes only (`$state`/`$derived`) | **No** (see §4)                           |
| `ui/` + route — render    | `HexTile.svelte` (52), `UnitCounter.svelte` (188), `+page.svelte` (341)                                                            | **~580** | heavy (SVG)                      | **Yes — this is the only layer replaced** |

The render surface to replace is **~580 LOC out of ~9,330**. The other ~8,750 LOC — including ~5,000 LOC of `core/` tests and the 1,805-LOC `gameStore.spec.ts` — is fully insulated. None of `core/`, `state/`, or the tests import anything from `ui/` or reference SVG.

### The single most important finding: pixel geometry already lives outside SVG

Hex→pixel math is provided by **honeycomb-grid**, not by the SVG layer. Every `HexCell` carries `.x`/`.y` (center) and `.corners` (`{x,y}[]`), computed by the library from the flat-top/60px/topLeft definition in `core/hex.ts:9`. The store already exposes this renderer-neutrally:

```ts
// gameStore.svelte.ts:138
takesCordsReturnsPos(cords) {           // hex center in pixels
  const { x, y } = this.grid.getHex(cords);
  return { x, y };
}
```

`+page.svelte` consumes `hex.corners` (HexTile) and `takesCordsReturnsPos()` (UnitCounter) — it does **not** compute any hex geometry itself. That math survives a renderer swap untouched. A LittleJS renderer reads the exact same `.corners`/`.x`/`.y` values and feeds them to `drawPoly`/`drawTile`.

---

## 2. How the current render layer is coupled to the store

The coupling is entirely **data-in / method-out**, no SVG concepts leak into the store:

**Reads (reactive):** `store.grid`, `store.units`, `store.validMoveTargets`, `store.validFireTargets`, `store.validChargeTargets`, `store.selectedUnit`, `store.turn`, `store.activePlayer`, `store.victoryOutcome`, `store.isGameOver`.

**Writes (method calls on user input):** `selectUnit(unit)`, `beginAction('move'|'fire')`, `moveUnit(coords)`, `fireAt(id)`, `chargeAt(id)`, `endPlayerTurn()`.

That's the complete contract. Any renderer that can (a) read those properties each frame and (b) call those methods on click is a drop-in replacement. SVG is satisfying this contract today; LittleJS can satisfy the identical contract.

---

## 3. What LittleJS offers (verified against the repo)

LittleJS v1.18.17 — a tiny, MIT, zero-dependency HTML5 engine (WebGL2 + Canvas2D hybrid). Confirmed capabilities relevant here:

- **ESM + TypeScript types.** `dist/littlejs.esm.js` + `dist/littlejs.d.ts`, published as `littlejsengine` on npm. There is an **official, working Vite example** (`examples/vite-starter/`) that `import`s from `littlejsengine` and builds with Vite 7 — the same Vite major this project uses.
- **Immediate-mode rendering — no scene graph required.** You can draw everything from external state in `gameRender`/`gameRenderPost`; the `EngineObject` class is optional. Confirmed by `examples/shorts/shapes.js` and the board-game template.
- **The drawing primitives we need:** `drawPoly(points,…)` (arbitrary hexagons from `cell.corners`), `drawTile(pos,size,tileInfo,color,angle)` (PNG counters), `drawRect`, `drawLine`, `drawText`, `drawEllipse`. Color/alpha/rotation supported per call.
- **Coordinate conversion built in:** `screenToWorld`/`worldToScreen`, `mousePos` (already in world space), `mouseWasPressed(0)` (fires once per click/tap).
- **Mobile + FX (the stated upside):** touch handling and an optional on-screen gamepad; particle system + effect-design tool; ZzFX procedural sound + mp3/ogg/wav; Shadertoy-style post FX.
- **Can run assetless** (pure shapes) — so the NATO counters can ship as `drawPoly`/`drawLine` calls first and migrate to PNG tiles later, incrementally.

### Near-exact precedent: the board-game template

`LittleJS-AI/templates/boardGame.html` is a two-player **turn-based grid game** — structurally the same problem. It demonstrates the entire pattern we'd use:

```js
function gameUpdate() {                     // poll input each frame
  hoverCell = worldPosToCell(mousePos);
  if (mouseWasPressed(0) && hoverCell) placePiece(hoverCell.row, hoverCell.col, …);
}
function gameRender() {                      // draw board from state
  drawRect(...); // board
  drawRect(getCellWorldPos(r,c), ...);       // cells
  drawTile(pos, vec2(PIECE_DIAMETER), icons.circle, color); // pieces
}
engineInit(gameInit, gameUpdate, gameUpdatePost, gameRender, gameRenderPost);
```

Swap `worldPosToCell` for honeycomb's `pointToHex`, `placePiece` for `store.moveUnit(...)`, and the piece loop for `store.units`, and you have this game's board.

---

## 4. Can we keep all game logic self-contained? — **Yes, with zero changes**

`core/` is pure functions with injectable RNG and no Svelte import — untouched. `data/` — untouched. **`gameStore.svelte.ts` is also untouched**, and this is worth stressing: the store uses runes (`$state`, `$derived`) but exposes plain data and methods. A runes `$state` field is just a reactive proxy; reading `store.units` from a _plain_ callback (like LittleJS's `gameRender`, which is not a Svelte effect) returns the current value, and `$derived` getters recompute on access. So the LittleJS render/update callbacks can read store state and call store methods directly, even though they live outside Svelte's reactivity graph. The store keeps working as the single source of truth.

The entire test suite (`*.spec.ts` in `core/` and `state/`) is unaffected — those are Node tests that never render. Only the **browser component tests** (`page.svelte.spec.ts`, and the `.svelte` components) are obsoleted.

---

## 5. Can we hook the store into the engine loop without major problems? — **Yes, with one inversion to understand**

Today Svelte **pushes**: a reactive dependency changes → the affected DOM nodes re-render. LittleJS **pulls**: a fixed 60 FPS RAF loop calls your callbacks, and you read whatever state is current. The bridge is trivial precisely because the store is a plain object graph:

```ts
// inside onMount (browser only)
import { engineInit, drawPoly, drawTile, vec2, mousePos, mouseWasPressed, screenToWorld } from 'littlejsengine';
const store = getGameStore();

function gameUpdate() {
  if (mouseWasPressed(0)) {
    const hex = pointToHex(/* flip-Y(screenToWorld? already world) */ mousePos);
    // route to store.selectUnit / moveUnit / fireAt / chargeAt based on
    // which derived target set the hex/unit is in — same branching as +page.svelte:99
  }
}
function gameRender() {
  for (const hex of store.grid) drawPoly(hex.corners.map(c => vec2(c.x, c.y)), terrainColor(hex.terrain));
  for (const t of store.validMoveTargets) /* highlight */;
  for (const u of store.units) drawTile(centerOf(u), …);   // or drawPoly NATO shapes
}
engineInit(() => {}, gameUpdate, () => {}, gameRender, () => {});
```

No `$effect` needed for the board; you simply read current state every frame. (You _may_ keep `$derived`/`$effect` for the HTML chrome — see §8.)

---

## 6. Rendering issues / risks

These are the real friction points. None is a blocker; all are known and bounded.

1. **Y-axis convention mismatch.** honeycomb-grid is Y-**down** (SVG/topLeft origin); LittleJS world space is Y-**up**. You must flip Y in one place when bridging — either negate Y when passing honeycomb pixel coords into LittleJS draw calls and when converting `mousePos` back before `pointToHex`, or set a negative `cameraScale.y`. Trivial but must be done consistently, or the board renders mirrored.

2. **LittleJS owns the page lifecycle.** `engineInit` creates its own canvas(es), appends to a root element (defaults to `document.body`, but accepts a custom `rootElement`), and runs its own RAF loop with global singletons (`cameraPos`, `time`, one engine per page). Implications:
   - **Must be client-only.** Guard `engineInit` behind `onMount`/`browser` — it touches `document`. SvelteKit SSR/prerender for that route must not execute it. (Easy; this is standard.)
   - **HMR degrades to full reload.** The official vite-starter ends with `if (import.meta.hot) import.meta.hot.accept(() => location.reload())` because partial HMR would leave ghost listeners and a duplicate RAF loop. Expect full-page reloads on save during dev.
   - **Cleanup on unmount is manual.** The engine has no first-class `destroy()`. For a single full-screen board route this is a non-issue; for embedding/teardown you'll manually remove canvases and stop the loop.

3. **Loss of DOM semantics & accessibility for the board.** The current SVG counters carry `role="button"`, `tabindex`, `aria-label`, and keyboard handlers (`UnitCounter.svelte:48-54`). A canvas is an opaque bitmap — any a11y, keyboard navigation, or focus handling must be re-implemented by hand (or kept in a parallel DOM layer). Same for the CSS niceties (hover `filter: brightness`, transitions).

4. **You hand-write hit-testing.** SVG dispatches click events per-element for free (`<polygon onclick>`, `<g onclick>`). On a canvas you get one click with a coordinate and must resolve it to a hex/unit yourself. honeycomb-grid's `pointToHex` does the hex lookup; unit picking is a coordinate compare. Modest, well-understood code — and the board-game template already shows the shape of it.

5. **Text rendering.** LittleJS `drawText` is canvas text — fine for in-world labels (SP counts, hex IDs) but coarser than DOM typography. The turn counter, victory banner, action buttons, and unit readout are better left as DOM (§8).

6. **Bundle size.** Adds the LittleJS engine (~tens of KB minified) + any PNG atlases. Negligible for a game; worth noting versus the current zero-runtime-rendering-dep setup (only honeycomb-grid).

---

## 7. What you gain (the motivation, confirmed real)

- **Mobile:** hardware-accelerated WebGL rendering, native touch input, optional on-screen controls, `touch-action` handled by the engine. Smoother than scaling a large SVG DOM tree on phones.
- **PNG tile counters & terrain:** richer art than hand-built SVG NATO symbols, via `drawTile` + sprite atlases.
- **Particles & sound:** muzzle flashes / smoke on fire, dust on charge, hit feedback; ZzFX or audio files for SFX — all first-party, no extra deps.
- **Animation:** smooth unit movement/retreat tweens and camera pan/zoom are natural in an RAF loop; awkward in declarative SVG.
- **Performance headroom:** WebGL sprite batching scales to far more counters/effects than an SVG DOM with hundreds of nodes.

---

## 8. Recommended architecture: hybrid, not wholesale

Keep Svelte for what it's best at and hand the board to LittleJS:

- **LittleJS canvas** renders the _board_ — hexes, terrain, highlights, counters, FX, animations — reading `store` each frame and calling `store` methods on tap.
- **Svelte DOM overlay** keeps the _chrome_ — top bar (turn/player), victory banner, bottom action bar (Move/Fire buttons, unit readout), menus. These are already clean DOM in `+page.svelte` and stay reactive via runes. The board-game template does exactly this (DOM menus via `menus.js` over the canvas).

This preserves accessible, styleable, reactive UI for buttons/HUD while getting WebGL/FX/mobile wins for the board, and it minimizes the rewrite to the ~240 LOC of actual board rendering (HexTile + UnitCounter + the SVG block in `+page.svelte`).

### Migration sketch (incremental, low-risk)

1. `pnpm add littlejsengine`. Spike a `LittleBoard.svelte` that mounts the engine in `onMount` over a fixed-size container; render hexes from `store.grid` via `drawPoly(cell.corners)` with terrain colors ported from `HexTile.svelte:12`. Get the Y-flip right. **Throwaway-able.**
2. Add unit rendering (port NATO shapes to `drawPoly`/`drawLine`/`drawRect`, or draw colored rects first). Add highlight overlays from the three `valid*Targets` derives.
3. Add input: `pointToHex(mousePos)` → branch to `selectUnit`/`moveUnit`/`fireAt`/`chargeAt` mirroring `+page.svelte:99-107`.
4. Keep the existing DOM top/bottom bars; delete the `<svg>` block. Swap PNG atlases in for shapes when art is ready. Layer in particles/sound last.

At every step the game stays playable, and `core/` + `state/` + their tests never move.

---

## 9. Bottom line

| Question                                                | Answer                                                                                                                                     |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Keep all game logic self-contained?                     | **Yes — zero changes** to `core/`, `data/`, `state/`, or their tests.                                                                      |
| Hook store into the engine loop without major problems? | **Yes.** Push→pull inversion only; the runes store reads fine from plain callbacks.                                                        |
| Rendering issues?                                       | **Manageable:** Y-flip, manual hit-testing, manual a11y, engine-owns-lifecycle (client-only + full-reload HMR). No blockers.               |
| Net assessment                                          | **Viable and well-aligned.** The render-agnostic design and honeycomb-owned pixel math make this close to a best case for a renderer swap. |

**Recommendation:** Proceed, as a **hybrid** (LittleJS board + Svelte DOM chrome), via the incremental spike above. The architectural investment in pure-logic/reactive-store separation pays off exactly here — the swap is confined to ~240–580 LOC and risks nothing in the tested core.
