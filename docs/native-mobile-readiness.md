# Native-mobile readiness (Tauri / Capacitor)

The repo may eventually ship as a native mobile (or desktop) app. Tauri and Capacitor
both work by serving a **static client bundle** from a local server or the filesystem —
so the only structural requirement is that the SvelteKit build emit a self-contained
static SPA. That is already done. This doc records what's in place and the exact steps to
add a native shell **when ready** (the native deps are intentionally not installed yet).

## Already in place

- **Static SPA build.** `svelte.config.js` uses `@sveltejs/adapter-static` with
  `fallback: 'index.html'`; `src/routes/+layout.ts` sets `ssr = false`. `pnpm build`
  emits a static bundle (client assets + `index.html` shell) — no server runtime.
- **No server surface.** No `+page.server.ts`, `+server.ts`, `hooks.server.ts`, form
  actions, `load`, or `$env` — nothing to port off a server.
- **Relative asset paths.** `kit.paths.relative` defaults to `true`, so assets resolve
  under `file://`-scheme serving (how native shells load the bundle). No `paths` change
  needed unless a shell serves from a sub-path.
- **Render layer is browser-only and mobile-first.** LittleJS is dynamically imported
  inside `onMount`, the canvas is DPR-safe, input is touch/pointer-only, gestures
  (pinch/scroll/context-menu) are suppressed, and the board pauses on `visibilitychange`
  (which webviews fire on app background). See `src/lib/game/render/CLAUDE.md`.

## Steps when packaging native

### Common (both frameworks)
- **`bundleStrategy: 'single'`** — add under `kit.output` in `svelte.config.js` to collapse
  the app to a single JS/CSS request (fewer round-trips under `file://`). Deferred because
  it bloats web initial load; only worth it once native is the primary target.
- **Safe-area insets** — give the DOM chrome bars in `src/routes/+page.svelte` room under
  notches / home indicators: `<meta name="viewport" content="... viewport-fit=cover">` and
  `padding: env(safe-area-inset-*)` on the top/bottom bars. Cosmetic until on real hardware.

### Tauri (Rust; desktop + iOS/Android)
```sh
pnpm add -D @tauri-apps/cli
pnpm tauri init      # frontendDist -> ../build, devUrl -> http://localhost:5173
pnpm tauri android init   # or: pnpm tauri ios init
pnpm tauri android dev    # / build
```
Point Tauri's `frontendDist` at the `adapter-static` output dir and `beforeBuildCommand`
at `pnpm build`.

### Capacitor (web-native; iOS/Android)
```sh
pnpm add @capacitor/core && pnpm add -D @capacitor/cli
pnpm cap init         # webDir -> the adapter-static output dir
pnpm add @capacitor/ios @capacitor/android
pnpm cap add ios && pnpm cap add android
pnpm build && pnpm cap sync
pnpm cap run ios      # / android
```
Set `webDir` to the build output and run `cap sync` after every `pnpm build`.

## Notes
- Keep `ssr = false`. If a specific route ever needs prerendering for a web deploy, add
  `export const prerender = true` on that route — the `onMount` engine guard still holds.
- A native app is single-window, so the render layer's single-instance engine model (no
  teardown; pause on hide) is a fit as-is — no lifecycle rework needed.
