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
- Created `core/unitDefinitions.ts` — data table with all stats per type (movement, action type, range, hit chance, charge, terrain entry)
- Added `ActionType` enum (`MOVE_OR_FIRE`, `FIRE_AND_MOVE`, `MOVE_ONLY`) and `ChargeAbility` discriminated union
- Updated `Unit` type: `strengthPoints`/`maxStrengthPoints` replace `hits`; removed `movementPoints`/`inHandToHand`; added `activated`
- Updated `UnitCounter.svelte` with 6 distinguishable NATO-style SVG icons
- 6 test units (one per type) in `scenarios.ts`; 47 rules-compliance tests in `unitDefinitions.spec.ts`

---

### ~~M2: Facing & Hex Zones~~ REMOVED

Facing was implemented at this milestone and later removed in the **facing refactor** (post-M7). The `core/facing.ts` module, the `HexFacing`/`FacingZone` types, `Unit.facing`, `Unit.facingStepsUsed`, `UnitDefinition.hasFacing`, the Town all-around override, and the rotate UI were all deleted. Units now move and fire in any direction without rotation cost.

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
- `moveUnit` now gates on `activationStep === ACTION` and `activeUnitId` match (not a legacy phase); `toggleUnit` is a no-op mid-activation and on already-activated units
- Exported the `GameStore` class (alongside the existing `initGameStore`/`getGameStore` singleton helpers) so tests can instantiate hermetically with `new GameStore(structuredClone(TEST_UNITS), TEST_MAP)`
- `+page.svelte` replaces the single "Advance Phase" button with four reactively-disabled buttons (Activate Selected / Complete Action / End Activation / End Player Turn) and displays `activationStep` and `activeUnitId`
- 51 tests in `gameStore.spec.ts` covering initial state, full activation lifecycle, once-per-turn enforcement, player switch vs game-turn rollover, all guard no-ops, move-step gating, and `toggleUnit` interaction with activation

---

### ~~M5: Movement Validation~~ COMPLETE

- Created `core/movement.ts` with `getValidMoveTargets(unit, grid, units, remainingMP?)` — BFS pathfinding respecting terrain entry, stacking, Light Infantry pass-through, enemy-adjacency exclusion, and road bonus (+1 on all-road path); `remainingMP` parameter enables hex-by-hex multi-step movement for 2-MP units
- `requiresDifficultTerrainCheck` / `rollDifficultTerrainCheck` — units with `terrainCheckRequired` on a difficult terrain hex must pass ~50% roll to leave; failure exhausts all remaining MP without moving
- Replaced `hasMoved: boolean` on `Unit` with `movementPointsUsed: number` — enables incremental MP tracking
- `validMoveTargets` derived on `GameStore` recomputes after each move step with remaining MP; highlights valid hexes in the UI via `HexTile.svelte` yellow stroke overlay
- `moveUnit` validates against `validMoveTargets`, looks up step cost, increments `movementPointsUsed`
- Tests in `movement.spec.ts` (range by type, terrain entry, stacking, road bonus, edge cases); new tests in `gameStore.spec.ts` covering multi-step Dragoon movement

---

### ~~M6: Line of Sight~~ COMPLETE

- Created `core/los.ts` with `hasLineOfSight(from, to, grid, units)` — pure-geometry LOS via cube-coordinate line tracing (lerp + round-to-nearest-hex)
- Intermediate samples (excluding both endpoints) checked for blockers: Woods/Town terrain, intervening units, and Hilltops only when both endpoints are at lower elevation (so a unit on a hill sees over equal-height hills, and a hill-vs-hill exchange is unblocked)
- Hexside-tie detection by tracing the line twice with opposite-sign endpoint nudges (±1e-6); when the two traces round to different hexes, the sample is blocked if either candidate blocks (per rules §7)
- Artillery-on-Hilltop plunging-fire exception: at range ≤ 4 with exactly one blocker adjacent to either firer or target, LOS is restored — denied for two blockers, mid-line blockers, range 5+, non-Artillery on hill, or Artillery off hill
- Adjacent hexes (`hexDistance ≤ 1`) always have LOS; off-grid endpoints return false; units on the firer/target hex never block their own LOS
- 37 tests in `los.spec.ts` covering trivial cases, open-ground LOS at varied distances, all blocking-terrain types (and the non-blockers Marsh/Lake/River/Bridge/Road/Ford), unit blockers, hill elevation rules, hexside boundary ties, and all plunging-fire variants

---

### ~~M7: Firing Combat~~ COMPLETE

- Created `core/combat.ts` with `getValidFireTargets(attacker, grid, units)` and `resolveFireAction(attacker, target, grid, rng?)` returning a transparent `FireResult` (base, cover, long-range modifiers, final hit chance, hit, damage)
- Hit resolution: base hit chance per unit type, −0.15 if target in Woods/Town cover, −0.15 if attacker is Artillery firing at distance ≥3; final clamped to [0,1]; on a hit, a fresh 1/6 RNG draw upgrades 1 SP damage to 2 SP ("devastating volley"); miss does not consume the second draw
- New `firedThisActivation: boolean` on `Unit` enforces action-type gating: `MOVE_OR_FIRE` units (Line Inf, Dragoons, Artillery) cannot move after firing nor fire after moving; `FIRE_AND_MOVE` (Light Infantry) may do both in either order; `MOVE_ONLY` (Cavalry) never fire (encoded as `firingRange: 0`)
- `GameStore.fireAt(targetId, rng?)` validates against `validFireTargets`, applies clamped SP damage to the target, sets the firer's `firedThisActivation`, and returns the `FireResult`; flag is cleared in `endActivation` and `#clearActivatedFlags` (turn rollover)
- `UnitCounter.svelte` gains a `fireTarget` prop that draws a red ring around eligible targets; `+page.svelte` computes a fire-target id set from `validFireTargets` and branches the click handler to `store.fireAt(unit.id)` when the target is eligible
- Tests in `combat.spec.ts` (range, directional independence, LOS, fired flag, multi-target, base hit chances, cover, long-range, RNG-driven hit/double-damage/miss, second-draw frugality, clamping); new tests in `gameStore.spec.ts` covering hit/double/miss SP arithmetic, flag set on hit and miss, target gating, MOVE_OR_FIRE vs FIRE_AND_MOVE mutual exclusion, SP-clamp at 0, and `endActivation` clearing the flag

---

### ~~M8: Charge Combat (Same-Hex Resolution)~~ COMPLETE

- Created `core/charge.ts` with `canCharge(attacker, defender)`, `getValidChargeTargets(attacker, grid, units)`, and `resolveCharge(attacker, defender, attackerOrigin, grid, units, rng?)` returning a transparent `ChargeResult` (scores, damage, outcome, retreat coords, advance flag)
- Same-hex spatial model: the attacker enters the defender's hex to resolve combat. On a winning charge the attacker advances into the (now-empty) defender hex; on a losing charge the attacker bounces back to its starting hex. Stacking is preserved everywhere except inside `chargeAt`, which applies the post-resolution state atomically — no external observer sees the transient overlap
- MP-based charge range: BFS in cube space finds the minimum-cost path to the defender, treating the defender's hex as enterable only as the final step. Terrain entry, friendly stacking, and `firedThisActivation` gates are honored
- Outcome table (per rules §6.3, transposed onto same-hex): `attacker_repulsed` (delta ≤ 0: 1 hit, attacker bounces, defender unchanged); `defender_retreats` (delta 1–2: 1 hit, defender retreats); `defender_holds` (delta 1–2 _and_ defender on difficult terrain → auto-hold per rules; OR no legal retreat hex → extra hit converts mandatory retreat to a hit); `defender_eliminated` (defender SP ≤ 0 after damage). Delta ≥ 3 → 2 hits + mandatory retreat (auto-hold ignored)
- Cavalry-retreats-after-combat (rules §6.3): Dragoons, Light Horse, and Horse return to origin even on a winning non-eliminating charge. Line Infantry advances on any defender displacement
- Pulled `core/retreat.ts` forward from M9 (was M9-scoped): `getRetreatHex(defender, attackerOrigin, grid, units)` picks the legal neighbor most aligned with the push vector via cube-coordinate dot product, ties broken by lowest direction index for determinism. Retreat is forced movement — candidates adjacent to other enemies are still legal endpoints
- Charge UI folds into `'move'` action mode (no new action mode). `+page.svelte` adds a `chargeTargetIds` derived; the enemy-counter click handler branches `selectUnit → fireAt → chargeAt` based on which target set the unit is in. `UnitCounter.svelte` gains a `chargeTarget` prop rendering an orange ring at a distinct radius from the red fire-target ring so the two never visually collide (in practice only one set is non-empty per mode)
- `chargeAt` in `gameStore.svelte.ts` validates against `validChargeTargets`, runs the difficult-terrain check on leaving the attacker's hex (same as `moveUnit`), calls `resolveCharge`, applies SP damage and coordinate moves atomically, filters eliminated units out, and finishes the activation regardless of outcome
- 13 tests in `retreat.spec.ts` (direction selection per attacker position, blocking by friendly/enemy/terrain/off-map, tie-breaking); 34 tests in `charge.spec.ts` (eligibility per unit-type matrix, reachability via BFS, terrain entry, all outcome branches, Horse +1, difficult-terrain modifier and auto-hold, no-retreat extra-hits conversion); 12 new tests in `gameStore.spec.ts` covering charge gating per action mode, advance/bounce coordinate transitions, defender elimination removing the unit, attacker SP damage, and activation lifecycle reset

---

### M9: Morale

Implement morale checks triggered when a unit takes hits, per rules §9. Retreat selection (`core/retreat.ts`) already shipped with M8.

**New `core/morale.ts`:**

- `checkMorale(unit, modifiers)` → `MoraleResult` (pass/fail)
- Base pass chance scales with remaining SP / max SP
- Modifiers: elite/veteran +1, out of command −1, leader attached +1
- Pass: hold position. Fail: retreat 1 hex via the existing `getRetreatHex` + 1 additional SP damage. Cannot retreat: 1 SP damage instead.
- **No cascading:** additional hit from failed morale does not trigger another check

**Depends on:** M7/M8 (combat triggers morale)
**Files:** new `core/morale.ts`, `gameStore.svelte.ts`
**Tests:** Morale at various SP ratios. All modifier combos. Blocked retreat penalty. No cascade.

---

### M10: Command & Control

Implement leaders, command radius, and command checks per rules §8.

**New `core/command.ts`:**

- `Leader` type: id, attachedToUnitId, commandRadius (default 2)
- `isInCommand(unit, leaders, grid)` → boolean (within any friendly leader's radius)
- `resolveCommandCheck(unit, leaders)` → boolean (50% base, −15% if far out of range)
- Fail: the activation is wasted — the unit may not move, fire, or charge
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
- Unit setup per side (type, position, SP, quality modifiers)
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
- Unit info: SP, type, leader, activated status
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
 ├── M2  Facing & Zones (later removed in facing refactor)
 │    │
 ├── M3  Terrain System
 │    │
 └── M4  Turn & Activation ──┐
      │                       │
      M5  Movement ───────────┘  (needs M3, M4)
      │
      M6  Line of Sight          (needs M3)
      │
      M7  Firing Combat           (needs M6)
      │
      M8  Charge Combat           (needs M3, M5)
      │
      M9  Morale                  (needs M7/M8)
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
