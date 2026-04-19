# AWI Hex & Counter Wargame

A digital hex-and-counter wargame for the Horse and Musket era (1700–1860), built with SvelteKit and Svelte 5. Derived from Neil Thomas' _One-Hour Wargames_ and _Simplicity in Practice_ systems.

## Development

```sh
pnpm install      # Install dependencies
pnpm dev          # Start dev server
pnpm check        # Type checking
pnpm test         # Run all tests
pnpm format       # Auto-format with Prettier
```

## Game Rules

`rules/living-rules.md` is the authoritative rules document. All implementation should be validated against it.

---

## Implementation Roadmap

Each milestone builds on the previous ones. Dependencies are noted where they exist.

### ~~M0: Bug Fixes & Cleanup~~ COMPLETE

- Fixed `unitAt()` object-reference comparison bug — now uses `coordsEqual()` helper
- Fixed typos: `MapDeffintion`, `restGameStore`, `#clearUnitFLags`
- Removed incorrect `MovementAllowance` and `AttackRange` constants
- Fixed `TEST_UNITS` placeholder values (`hits: 15` → `4`)
- Standardized on `OffsetCoordinates` (col/row) for `Unit.coordinates` — added `coordsEqual()` to `hex.ts`
- Added `hex.spec.ts` with `coordsEqual` tests

---

### ~~M1: Unit Type Overhaul~~ COMPLETE

- Replaced 4 generic types with 6 rules-accurate types: `LINE_INFANTRY`, `LIGHT_INFANTRY`, `DRAGOONS`, `LIGHT_HORSE`, `HORSE`, `ARTILLERY`
- Created `core/unitDefinitions.ts` — data table with all stats per type (movement, action type, range, hit chance, facing, charge, terrain entry)
- Added `ActionType` enum (`MOVE_OR_FIRE`, `FIRE_AND_MOVE`, `MOVE_ONLY`) and `ChargeAbility` discriminated union
- Updated `Unit` type: `strengthPoints`/`maxStrengthPoints` replace `hits`; removed `movementPoints`/`inHandToHand`; added `activated`
- Updated `UnitCounter.svelte` with 6 distinguishable NATO-style SVG icons
- 6 test units (one per type) in `scenarios.ts`; 47 rules-compliance tests in `unitDefinitions.spec.ts`

---

### ~~M2: Facing & Hex Zones~~ COMPLETE

- Created `core/facing.ts` with 5 pure functions: `getFrontHexsides`, `getRearHexsides`, `getZone`, `rotateFacing`, `facingStepsBetween`
- Front arc = faced hexside + 1 step CW + 1 step CCW (3 hexsides); rear arc = opposite 3
- `getZone` accepts `allAround: boolean` for Light Infantry (`hasFacing: false`) and units in Towns — callers compute this flag, keeping `facing.ts` free of unit-type and terrain imports
- `HexFacing` degree values double as clockwise step indices (`value / 60` → 0–5), confirmed against honeycomb-grid flat-top cube coordinate deltas — no angular offset between facing and neighbor directions
- Added `FacingZone = 'front' | 'rear'` to `types.ts`
- 139 exhaustive tests in `facing.spec.ts`: all 36 facing × hexside zone combinations, wrap-around rotation, minimum-arc step calculation, allAround overrides

---

### ~~M3: Terrain System~~ COMPLETE

- Created `core/terrain.ts` — `TerrainDefinition` type and `terrainDefinitions` data table for all 10 terrain types, plus 4 helper functions: `canUnitEnterTerrain`, `getTerrainCoverModifier`, `doesTerrainBlockLOS`, `getTerrainElevation`
- `allowedUnitTypes: readonly UnitType[] | null` in each definition encodes entry restrictions (null = all units); `isImpassable` short-circuits `canUnitEnterTerrain` before allowedUnitTypes is consulted
- WOODS and TOWN have cover (−0.15 hit chance modifier); WOODS, TOWN, and HILLTOP block LOS; only HILLTOP is elevated (elevation 1) and difficult terrain
- Added `elevation` getter to `HexCell` in `hex.ts` (HILLTOP → 1, all others → 0); no `terrain.ts` import needed — logic is inline
- 132 tests in `terrain.spec.ts` (all 60 terrain × unit entry combinations + LOS, cover, elevation, and all definition properties per terrain type); 5 elevation getter tests added to `hex.spec.ts`

---

### ~~M4: Turn & Activation Model~~ COMPLETE

- Deleted `Phase` enum and `advancePhase()`; replaced with `ActivationStep` (`AWAITING_ACTIVATION` → `COMMAND_CHECK` → `ACTION` → `CHARGE_RESOLUTION` → `MORALE_CHECK` → `ACTIVATION_COMPLETE`) and four lifecycle methods on `GameStore`: `activateUnit(id)`, `completeAction()`, `endActivation()`, `endPlayerTurn()`
- `GameStore` state now tracks `activationStep` and `activeUnitId` in place of `currentPhase`; `activated` flag on each unit is cleared only at game-turn rollover (not at player-turn switch), enforcing once-per-game-turn activation
- `COMMAND_CHECK`, `CHARGE_RESOLUTION`, and `MORALE_CHECK` steps are instantaneous auto-pass stubs for M4 — the state machine still enters each step so M7/M9/M10 can slot in real logic without restructuring
- `moveUnit`/`changeFacing` now gate on `activationStep === ACTION` and `activeUnitId` match (not a legacy phase); `toggleUnit` is a no-op mid-activation and on already-activated units
- Exported the `GameStore` class (alongside the existing `initGameStore`/`getGameStore` singleton helpers) so tests can instantiate hermetically with `new GameStore(structuredClone(TEST_UNITS), TEST_MAP)`
- `+page.svelte` replaces the single "Advance Phase" button with four reactively-disabled buttons (Activate Selected / Complete Action / End Activation / End Player Turn) and displays `activationStep` and `activeUnitId`
- 51 tests in `gameStore.spec.ts` covering initial state, full activation lifecycle, once-per-turn enforcement, player switch vs game-turn rollover, all guard no-ops, move/facing step gating, and `toggleUnit` interaction with activation

---

### ~~M5: Movement Validation~~ COMPLETE

- Created `core/movement.ts` with `getValidMoveTargets(unit, grid, units, remainingMP?)` — BFS pathfinding through front-arc hexsides respecting terrain entry, stacking, Light Infantry pass-through, enemy-adjacency exclusion, and road bonus (+1 on all-road path); `remainingMP` parameter enables hex-by-hex multi-step movement for 2-MP units
- `requiresDifficultTerrainCheck` / `rollDifficultTerrainCheck` — units with `terrainCheckRequired` on a difficult terrain hex must pass ~50% roll to leave; failure exhausts all remaining MP without moving
- Replaced `hasMoved: boolean` on `Unit` with `movementPointsUsed: number` and `facingStepsUsed: number` — enables incremental MP tracking and decouples facing rotation from movement consumption
- Facing rule revised for digital play: 1-step rotation is valid at any point during a move (before, during, or after); only a 2-step stationary pivot consumes the full move action and blocks subsequent hex movement
- `validMoveTargets` derived on `GameStore` recomputes after each move step with remaining MP; highlights valid hexes in the UI via `HexTile.svelte` yellow stroke overlay
- `moveUnit` validates against `validMoveTargets`, looks up step cost, increments `movementPointsUsed`; `changeFacing` caps total rotation at 1 step if any MP have been spent, 2 steps if stationary
- 42 tests in `movement.spec.ts` (range by type, all 6 facing arcs, all-around overrides, terrain entry, stacking, road bonus, edge cases); 14 new tests in `gameStore.spec.ts` covering multi-step Dragoon movement, rotate-before-move, 2-step pivot blocking movement, and second-rotation rejection

---

### ~~M6: Line of Sight~~ COMPLETE

- Created `core/los.ts` with `hasLineOfSight(from, to, grid, units)` — pure-geometry LOS via cube-coordinate line tracing (lerp + round-to-nearest-hex), no facing-arc dependency (combat module composes that in M7)
- Intermediate samples (excluding both endpoints) checked for blockers: Woods/Town terrain, intervening units, and Hilltops only when both endpoints are at lower elevation (so a unit on a hill sees over equal-height hills, and a hill-vs-hill exchange is unblocked)
- Hexside-tie detection by tracing the line twice with opposite-sign endpoint nudges (±1e-6); when the two traces round to different hexes, the sample is blocked if either candidate blocks (per rules §7)
- Artillery-on-Hilltop plunging-fire exception: at range ≤ 4 with exactly one blocker adjacent to either firer or target, LOS is restored — denied for two blockers, mid-line blockers, range 5+, non-Artillery on hill, or Artillery off hill
- Adjacent hexes (`hexDistance ≤ 1`) always have LOS; off-grid endpoints return false; units on the firer/target hex never block their own LOS
- 37 tests in `los.spec.ts` covering trivial cases, open-ground LOS at varied distances, all blocking-terrain types (and the non-blockers Marsh/Lake/River/Bridge/Road/Ford), unit blockers, hill elevation rules, hexside boundary ties, and all plunging-fire variants

---

### ~~M7: Firing Combat~~ COMPLETE

- Created `core/combat.ts` with `getValidFireTargets(attacker, grid, units)` and `resolveFireAction(attacker, target, grid, rng?)` returning a transparent `FireResult` (base, cover, long-range modifiers, final hit chance, hit, damage)
- Front-arc inclusion uses cube-line first-step direction with the same nudged-pair tie detection as `los.ts`; permissive at hexside boundaries (in-arc if either candidate first-neighbor is a front direction) — the asymmetry vs. LOS's restrictive tie rule is intentional and avoids prompting the user to pick a hexside
- Hit resolution: base hit chance per unit type, −0.15 if target in Woods/Town cover, −0.15 if attacker is Artillery firing at distance ≥3; final clamped to [0,1]; on a hit, a fresh 1/6 RNG draw upgrades 1 SP damage to 2 SP ("devastating volley"); miss does not consume the second draw
- New `firedThisActivation: boolean` on `Unit` enforces action-type gating: `MOVE_OR_FIRE` units (Line Inf, Dragoons, Artillery) cannot move/rotate after firing nor fire after moving/rotating; `FIRE_AND_MOVE` (Light Infantry) may do both in either order; `MOVE_ONLY` (Cavalry) never fire (encoded as `firingRange: 0`)
- `GameStore.fireAt(targetId, rng?)` validates against `validFireTargets`, applies clamped SP damage to the target, sets the firer's `firedThisActivation`, and returns the `FireResult`; flag is cleared in `endActivation` and `#clearActivatedFlags` (turn rollover)
- `UnitCounter.svelte` gains a `fireTarget` prop that draws a non-rotating red ring around eligible targets; `+page.svelte` computes a fire-target id set from `validFireTargets` and branches the click handler to `store.fireAt(unit.id)` when the target is eligible
- 29 tests in `combat.spec.ts` (range, arc/all-around/Town, LOS, fired flag, multi-target, hexside-tie permissive, base hit chances, cover, long-range, RNG-driven hit/double-damage/miss, second-draw frugality, clamping); 14 new tests in `gameStore.spec.ts` covering hit/double/miss SP arithmetic, flag set on hit and miss, target/step gating, MOVE_OR_FIRE vs FIRE_AND_MOVE mutual exclusion, SP-clamp at 0, and `endActivation` clearing the flag

---

### M8: Charge Combat

Implement charge action and opposed resolution per rules §6.3.

**Add to `core/combat.ts`:**

- `canCharge(unit, target)` → boolean (checks mayCharge, restrictions, terrain)
- Line Infantry cannot charge Cavalry types
- `resolveCharge(attacker, defender, grid)` → `ChargeResult`
- Attacker score: d6 + attacker SP + modifiers (flank/rear +1, Horse +1, defender difficult terrain −1)
- Defender score: d6 + defender SP
- Results table: attacker ≤ defender → attacker 1 hit + retreat; exceed by 1–2 → defender 1 hit + retreat; exceed by 3+ → defender 2 hits + must retreat
- Cavalry always retreat after combat if defender not eliminated

**Depends on:** M2 (flank/rear detection), M3 (terrain), M5 (charge as movement)
**Files:** `core/combat.ts`, `gameStore.svelte.ts`
**Tests:** Opposed contest with controlled RNG. All modifier combos. Retreat direction. Charge restriction enforcement.

---

### M9: Morale

Implement morale checks triggered when a unit takes hits, per rules §9.

**New `core/morale.ts`:**

- `checkMorale(unit, modifiers)` → `MoraleResult` (pass/fail)
- Base pass chance scales with remaining SP / max SP
- Modifiers: elite/veteran +1, flank/rear attack −1, out of command −1, leader attached +1
- Pass: hold position. Fail: retreat 1 hex through rear + 1 additional SP damage. Cannot retreat: 1 SP damage instead.
- **No cascading:** additional hit from failed morale does not trigger another check

**New `core/retreat.ts`:**

- `getRetreatHex(unit, attackSource, grid, units)` → best rear hex or null
- Prefer hex away from attacker, toward friendly units
- Units in Towns retreat away from attack source

**Depends on:** M7/M8 (combat triggers morale), M2 (rear hexsides for retreat)
**Files:** new `core/morale.ts`, new `core/retreat.ts`, `gameStore.svelte.ts`
**Tests:** Morale at various SP ratios. All modifier combos. Retreat selection. Blocked retreat penalty. No cascade.

---

### M10: Command & Control

Implement leaders, command radius, and command checks per rules §8.

**New `core/command.ts`:**

- `Leader` type: id, attachedToUnitId, commandRadius (default 2)
- `isInCommand(unit, leaders, grid)` → boolean (within any friendly leader's radius)
- `resolveCommandCheck(unit, leaders)` → boolean (50% base, −15% if far out of range)
- Fail: unit may only change facing this activation
- Leader casualty: ~15% chance when attached unit takes hits → replacement leader with radius −1

**Leader allocation:** 1 per 2 units (rounded down, minimum 1), assigned at scenario setup.

**Depends on:** M4 (COMMAND_CHECK activation step)
**Files:** new `core/command.ts`, `types.ts` (Leader type), `gameStore.svelte.ts`, `scenarios.ts`
**Tests:** Command radius. In/out of command. Check resolution. Casualty and replacement. Degrading radius.

---

### M11: Elimination & Retreat

Formalize unit removal and retreat finalization.

- Unit eliminated when SP reaches 0 → removed from game
- If eliminated unit had attached leader: leader removed with **no replacement** (rules §10)
- Contrast with leader killed by casualty check (§8.3): **does** get replacement
- Check victory conditions after elimination (M12)

**Depends on:** M9 (retreat system), M10 (leader attachment)
**Files:** `core/combat.ts` or new `core/elimination.ts`, `gameStore.svelte.ts`
**Tests:** Elimination at 0 SP. Leader removal distinction. Victory check trigger.

---

### M12: Scenarios & Victory

Replace hardcoded test data with a scenario system.

**`Scenario` type:**

- Map definition (6×6 grid per rules §2, replacing current 5×4 test map)
- Unit setup per side (type, position, facing, SP, quality modifiers)
- Leader assignments
- First player, turn limit (default 15)
- Victory conditions (objective hexes, elimination count, hold for N turns, exit map edge)

**New `core/victory.ts`:**

- `checkVictoryConditions(scenario, gameState)` → result or null
- Evaluated at end of each full game turn

**GameStore init** takes a `Scenario` instead of raw units + map.

**Files:** `scenarios.ts` (major expansion), new `core/victory.ts`, `gameStore.svelte.ts`, `maps.ts` (absorbed into scenarios)
**Tests:** Scenario loading. Victory condition evaluation.

---

### M13: UI Polish

Minimal but functional interface for all game mechanics. Build only after core systems work.

- Activation UI: show available/activated units, current activation step
- Action panel: available actions per unit type and state
- Movement overlay: highlight valid hexes
- Combat feedback: targets, results, damage
- Unit info: SP, type, facing, leader, activated status
- Game HUD: turn, active player, victory progress
- End-turn confirmation if un-activated units remain

**Files:** `+page.svelte`, `HexTile.svelte`, `UnitCounter.svelte`, new components as needed

---

### Milestone Dependency Graph

```
M0  Bug Fixes
 │
M1  Unit Types
 │
 ├── M2  Facing & Zones
 │    │
 ├── M3  Terrain System
 │    │
 └── M4  Turn & Activation ──┐
      │                       │
      M5  Movement ───────────┘  (needs M2, M3, M4)
      │
      M6  Line of Sight          (needs M3)
      │
      M7  Firing Combat           (needs M2, M6)
      │
      M8  Charge Combat           (needs M2, M3, M5)
      │
      M9  Morale                  (needs M7/M8, M2)
      │
      M10 Command & Control       (needs M4)
      │
      M11 Elimination & Retreat   (needs M9, M10)
      │
      M12 Scenarios & Victory
      │
      M13 UI Polish
```

### Design Principles

- **All game logic in `core/` as pure functions** — no Svelte imports, no side effects. Accept an RNG parameter where randomness is needed.
- **GameStore orchestrates, core/ computes** — the store calls pure functions and applies results to reactive state. Keeps logic testable.
- **Immutable unit updates** — continue replacing the units array via `.map()`, not mutating in place.
- **Test-first for core modules** — every `core/` module gets a companion `.spec.ts` with server-side tests before wiring into the store or UI.
