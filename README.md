# AWI Hex & Counter Wargame

A digital hex-and-counter wargame for the Horse and Musket era (1700–1860), built with SvelteKit and Svelte 5. Derived from Neil Thomas' *One-Hour Wargames* and *Simplicity in Practice* systems.

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

### M4: Turn & Activation Model

**This is the biggest architectural change.** Replace the phase-based system with unit-by-unit activation per rules §5.

**Rules model:** Each game turn has two player turns. During a player turn, the player activates units one at a time in any order. Each activation follows: Command Check → Action → Charge Resolution → Morale Check.

**Replace `Phase` enum** with `ActivationStep`:
```
AWAITING_ACTIVATION → COMMAND_CHECK → ACTION → CHARGE_RESOLUTION → MORALE_CHECK → ACTIVATION_COMPLETE
```

**New GameStore state:**
- `turn`, `activePlayer`, `activationStep`, `activeUnitId`
- Remove `currentPhase`

**New GameStore methods:**
- `activateUnit(id)` — begin activation sequence for a unit
- `completeAction()` — advance through activation steps
- `endActivation()` — mark unit as activated, return to AWAITING_ACTIVATION
- `endPlayerTurn()` — switch players (or advance game turn)

**Stub the command check and morale check steps** — they'll be implemented in M9/M10.

**Depends on:** M1 (activated flag on Unit)
**Files:** `types.ts`, `gameStore.svelte.ts` (major rewrite), `+page.svelte` (UI flow)
**Tests:** Full activation lifecycle — activate unit, complete action, end activation, next unit, end player turn, switch players, advance game turn. Cannot activate twice. Only active player's units.

---

### M5: Movement Validation

Replace unrestricted `moveUnit()` with rules-compliant movement.

**New `core/movement.ts`:**
- `getValidMoveTargets(unit, grid, units)` → set of legal destination hexes
- Movement through front hexsides only (uses M2 facing zones)
- Respect movement allowance (from M1 unit definitions)
- Terrain entry restrictions (from M3)
- Stacking: 1 unit per hex, no moving through occupied hexes (Light Infantry exception: may pass through friendly)
- Facing change: 1 vertex during move, up to 2 if stationary (costs the action)
- Road bonus: +1 hex if entire path on road, not approaching enemy
- Non-charging units cannot voluntarily move adjacent to enemy

**Difficult terrain check:** Units with `terrainCheckRequired` in a difficult terrain hex must pass ~50% check to leave. Failure spends the action.

**Pathfinding:** BFS/flood-fill from unit position through front hexsides, respecting terrain and stacking.

**Depends on:** M2 (facing zones), M3 (terrain effects)
**Files:** new `core/movement.ts`, `gameStore.svelte.ts`, `HexTile.svelte` (highlight valid targets)
**Tests:** Movement range per unit type. Terrain blocking. Stacking. Light Infantry pass-through. Facing constraints. Road bonus. Difficult terrain check.

---

### M6: Line of Sight

Implement center-to-center LOS tracing for firing eligibility.

**New `core/los.ts`:**
- `hasLineOfSight(from, to, grid, units)` → boolean
- Trace line from hex center to hex center using cube coordinates
- Check intervening hexes for: Woods (blocks), Towns (blocks), Hills (blocks between lower units), other units (block)
- Hexside-boundary ambiguity: if line runs exactly along a hexside and one adjacent hex blocks → blocked
- Artillery-on-hill exception: may fire over 1 adjacent unit/terrain at max range (4 hexes)

**Algorithm:** Cube-coordinate line drawing (lerp + round to nearest hex).

**Depends on:** M3 (terrain LOS properties)
**Files:** new `core/los.ts`, additions to `hex.ts` if needed
**Tests:** Clear LOS, blocked by woods/town/unit/hill, LOS over hill from hill, artillery plunging fire, hexside boundary edge case.

---

### M7: Firing Combat

Implement the fire action with hit resolution per rules §6.2.

**New `core/combat.ts`:**
- `getValidFireTargets(unit, grid, units)` → eligible targets (in range, in arc, with LOS)
- **Must fire at closest eligible target** in firing arc
- `resolveFireAction(attacker, target, grid)` → `FireResult`
- Base hit chance per unit type (65% line infantry, 50% others)
- Modifiers: target in cover (−15%), artillery at 3+ hex range (−15%)
- Hit → 1 SP damage. On hit, ~1-in-6 additional chance → 2 SP damage instead
- Light Infantry special: may fire AND move (or move AND fire) in same activation

**RNG design:** Accept injectable random function for testability, default to `Math.random`.

**Depends on:** M2 (arc of fire from facing zones), M6 (LOS)
**Files:** new `core/combat.ts`, `gameStore.svelte.ts`
**Tests:** Target selection (range, arc, LOS, closest-target rule). Hit resolution. Cover modifier. Artillery long-range. Double damage roll.

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
