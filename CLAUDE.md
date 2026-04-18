# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AWI Hex & Counter Wargame — a Svelte-based digital hex wargame for the Horse and Musket era (1700–1860). Renders an SVG hex grid with unit counters, turn-based phased gameplay, and scenario based maps. Built on honeycomb-grid for hex math. Uses native SVG for rendering.

## Commands

```sh
pnpm dev          # Start dev server (Vite)
pnpm build        # Production build
pnpm check        # SvelteKit sync + svelte-check (type checking)
pnpm check:watch  # Type checking in watch mode
pnpm lint         # Prettier check
pnpm format       # Prettier auto-format
pnpm test         # Run all tests once (CI mode)
pnpm test:unit    # Run tests in watch mode (Vitest)
```

## Code Style

Prettier with: tabs, single quotes, no trailing commas, 100 char print width. Svelte files use the `svelte` parser. Run `pnpm format` to auto-format.

## Testing

Vitest with two test projects configured in `vite.config.ts`:

- **Browser tests** (`*.svelte.spec.ts` / `*.svelte.test.ts`): Run in headless Chromium via Playwright. For Svelte component tests.
- **Server tests** (`*.spec.ts` / `*.test.ts`): Run in Node. For pure logic/unit tests.

All tests require assertions (`expect.requireAssertions` is enabled).

## Architecture

### Layered game structure in `src/lib/game/`

```
core/    → Pure logic, no Svelte dependency
  types.ts            Enums (TerrainType, UnitType, HexFacing), Unit/Leader types
  unitDefinitions.ts  Data table: per-unit-type stats (movement, range, hit chance, actions, charge rules)
  hex.ts              HexCell class extending honeycomb-grid's defineHex (flat-top, 60px, topLeft origin)
  facing.ts           Front/rear zone calculation from hexside facing direction
  terrain.ts          Terrain effect definitions (LOS, cover, entry restrictions, elevation)
  movement.ts         Movement validation, pathfinding, valid target calculation
  los.ts              Line of sight tracing (center-to-center, blocking checks)
  combat.ts           Firing and charge resolution
  morale.ts           Morale checks on taking hits
  retreat.ts          Retreat hex selection
  command.ts          Leaders, command radius, command checks
  victory.ts          Victory condition evaluation

data/    → Static game data
  scenarios.ts  Scenario definitions (map, units, leaders, victory conditions)

state/   → Reactive state management
  gameStore.svelte.ts   Singleton GameStore class using Svelte 5 runes ($state, $derived)

ui/      → Svelte components
  HexTile.svelte       Hex polygon rendering with terrain-based colors
  UnitCounter.svelte   SVG unit icons for all 6 unit types
```

### Key patterns

- **Svelte 5 runes only** — uses `$state`, `$derived`, `$effect`. No legacy stores or lifecycle functions.
- **Pure functions in core/, orchestration in GameStore** — all game logic lives in `core/` as pure functions with no Svelte dependency. The store calls these and applies results to reactive state. RNG is injectable for testability.
- **Immutable state updates** — units array is replaced via `.map()` on mutation, not mutated in place.
- **Unit-by-unit activation** — per rules §5, players activate one unit at a time (not phase-based). Each activation follows: Command Check → Action → Charge Resolution → Morale Check.
- **6 unit types** — Line Infantry, Light Infantry, Dragoons, Light Horse, Horse, Artillery — each with distinct stats and rules defined in `unitDefinitions.ts`.
- **Strength Points** — units have SP (default 4). Eliminated at 0 SP. SP drives combat resolution and morale.
- **Player model**: Two players (0 and 1); player 0 is blue, player 1 is red.

### Hex grid

Uses `honeycomb-grid` library. HexCell extends `defineHex` with flat-top orientation, 60px dimensions, topLeft origin. Cube coordinates (`q`, `r`) are used for neighbor lookups and distance calculations.

## Game Rules

`rules/living-rules.md` is the authoritative game rules document. It defines unit types, terrain effects, facing, sequence of play, firing, charging, LOS, command, morale, and victory conditions. Section 14 has digital implementation notes. Consult this when implementing game mechanics.

## Roadmap

See `README.md` for the full implementation roadmap (M0–M13). Milestones are dependency-ordered from bug fixes through unit types, terrain, activation model, movement, LOS, combat, morale, command, scenarios, and UI.
