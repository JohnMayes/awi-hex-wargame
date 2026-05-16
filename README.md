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

### ~~M9: Morale~~ COMPLETE

- Created `core/morale.ts` with `checkMorale(unit, attackerOrigin, grid, units, { leaderAttached, outOfCommand }, rng)` → transparent `MoraleResult` (base/final pass chance, per-modifier breakdown, roll, passed, retreatTo, additionalDamage)
- Pass chance formula: `clamp(remainingSP / maxSP + 0.15·elite + 0.15·leaderAttached − 0.15·outOfCommand, 0, 1)` — `±0.15` step mirrors the cover/long-range modifiers in `combat.ts`. Pass test is strict `roll < finalPassChance` so a clamped-to-0 chance never passes
- Fail behavior: retreat 1 hex via `getRetreatHex` (M8) AND take +1 SP; if no legal retreat hex, take +1 SP without moving. **No cascade** — the failed-morale extra hit never triggers another check
- Added `elite: boolean` to `Unit` (default `false` on all TEST_UNITS); `outOfCommand` and `leaderAttached` are wired to `false` from the store until M10 lands
- `FireResult` and `ChargeResult` extended with `morale: MoraleResult | null`. Morale runs immediately inside `fireAt`/`chargeAt`, folded into the same atomic `units.map(...)` that applies the triggering damage — observers never see an intermediate state. `ActivationStep.MORALE_CHECK` remains a transient pass-through in `#finishActivation()`
- Charge gating: morale fires on any damaging non-eliminating charge (`defender_retreats` and `defender_holds`). `attacker_repulsed` (no defender hit) and `defender_eliminated` (post-charge SP 0) skip morale. On `defender_retreats` + morale-fail, the second forced retreat originates from the defender's post-charge hex with source = attacker's post-resolution coords (per literal §9.1)
- 12 tests in `morale.spec.ts` (SP ratios, modifier stacking, ±-clamp at 0/1, retreat direction, no-legal-retreat, determinism, transparency); 9 new tests in `gameStore.spec.ts` covering the fire path (miss / 1-dmg + morale pass / 1-dmg + morale fail with retreat / eliminating-damage skips morale / no-cascade rng count) and the charge path (attacker_repulsed, defender_eliminated, defender_retreats with morale fail overriding coords, defender_retreats with morale pass)

---

### ~~M10: Command & Control~~ COMPLETE

- Created `core/command.ts` with `Leader` type (`id`, `attachedToUnitId`, `commandRadius`), `getAttachedLeader`, `isInCommand`, and transparent resolvers `resolveCommandCheck` → `CommandCheckResult` and `resolveLeaderCasualty` → `{ result: LeaderCasualtyResult | null, leaders: Leader[] }`. Reuses `hexDistance` from `hex.ts:42` for radius and nearest-leader lookups; same-side filter via the host unit's `player`
- Command check formula (§8.2): in-command units skip the roll (`roll: 0`, `finalPassChance: 1`); out-of-command units roll vs. base 50%, with a −15% `farPenalty` when distance to nearest friendly leader > 2× that leader's radius. Pass test is strict `roll < finalPassChance`. Boundary is inclusive (`D ≤ R` = in command)
- Leader casualty (§8.3): ~15% chance per hit. On casualty, the original leader is removed and a replacement is attached to the nearest leaderless friendly unit (excluding the dying leader's own host); tie-break by lowest unit id. Replacement radius = `max(0, original − 1)`. Replacement ids carry a `-r{n}` suffix for traceable lineage. If no leaderless friendly unit exists, the leader vanishes with no replacement
- Added `leaders: Leader[]` state and `lastCommandCheck: CommandCheckResult | null` to `GameStore`. Constructor signature is now `new GameStore(units, map, leaders)` — required; `initGameStore` and `+page.svelte` updated accordingly
- `#activate(id, rng)` now runs the real check. On fail, the unit's `activated` flag is set and the activation immediately finishes through CHARGE_RESOLUTION → MORALE_CHECK → ACTIVATION_COMPLETE — no movement, fire, or charge possible. `activateUnit(id, rng?)` and `beginAction(mode, rng?)` thread the rng through; `beginAction` early-returns after a failed command check
- `fireAt`/`chargeAt` order on damage: **leader casualty first, then morale** (per design choice). Morale's `leaderAttached` and `outOfCommand` inputs reflect post-casualty state. `FireResult.leaderCasualty` and `ChargeResult.{attackerLeaderCasualty, defenderLeaderCasualty}` expose the rolls. Attacker casualty is only rolled on `attacker_repulsed`; defender casualty only when the defender survives the hit
- Orphan leader cleanup: after `chargeAt`'s `.filter(u => u.strengthPoints > 0)`, leaders whose host was just eliminated are also dropped (no replacement, per §10 — distinct from the §8.3 casualty replacement). M11 will formalize the elimination trigger
- `TEST_LEADERS` in `scenarios.ts`: one per side (1 per 2 units rounded down, min 1). Blue leader on `blue-line-inf`, red leader on `red-horse` (rarely a fire/charge target — keeps casualty rolls out of pre-M10 rng sequences). Both with `commandRadius: 10` to cover the 6×4 TEST_MAP, so existing tests stay in-command and skip the roll
- 19 tests in `command.spec.ts` (isInCommand boundary, multi-leader pick-nearest, enemy filter; command check pass/fail with and without far penalty, no-leader fallback; casualty no-leader/fail/pass, radius-1-to-0 degrade, no-candidate path, `-r1/-r2` id chain). 14 new tests in `gameStore.spec.ts` covering in-command/out-of-command activation, wasted activation, turn rollover clearing the activated flag, far-penalty propagation, fire+casualty+replacement, casualty failure no-op, eliminating fire skips casualty/morale, outOfCommand propagation into morale modifiers, charge+defender casualty, charge eliminating leader-host triggers orphan cleanup, and attacker_repulsed triggers attacker casualty

---

### ~~M11: Elimination & Retreat~~ COMPLETE

- Created `core/elimination.ts` with a pure `applyEliminations(units, leaders) → { units, leaders, result: EliminationResult }` per rules §10. Filters out units at `strengthPoints ≤ 0` and drops any leader whose `attachedToUnitId` is no longer present in the surviving set — **with no replacement** (distinct from the §8.3 casualty replacement handled by `resolveLeaderCasualty`). Defensive: also removes leaders attached to ghost ids. Pure and idempotent; iteration order preserved for deterministic test ordering
- Both `fireAt` and `chargeAt` now call `applyEliminations` once, atomically, after the damage `units.map(...)`. `chargeAt`'s previous inline `.filter(u => u.strengthPoints > 0)` plus separate `survivingIds`-based leader orphan-cleanup was replaced with the helper. `fireAt` previously left eliminated targets at SP 0 in the array; that gap (which the morale-induced +1 SP can hit) is now closed
- `FireResult` and `ChargeResult` gain `eliminatedUnitIds: string[]` and `eliminatedLeaderIds: string[]`, complementing the existing `leaderCasualty`/`morale` fields. Empty arrays in the common no-elimination case. All four `resolveCharge` branches and `resolveFireAction` populate `[]` by default; the store overwrites at the return site
- The `Omit<ChargeResult, …>` base in `resolveCharge` was extended to also omit the two new fields so each branch must set them explicitly
- M9/M10 tests that previously read SP at a dead target via `store.units.find(...)` were tightened to assert removal: three pre-existing tests ("clamps target SP at 0", "damage that eliminates → result.morale is null", "fire eliminating the target → no leader casualty/morale") now check `.find(...) === undefined` and (where applicable) that the attached leader is also gone — verifying §10's no-replacement rule on the fire path
- 8 tests in `elimination.spec.ts` (no eliminations, single unit, unit+leader, leader on different live unit, multiple eliminations in input order, ghost-host defensive cleanup, immutability, idempotence). 6 new tests in `gameStore.spec.ts` (fire non-lethal empty arrays, fire morale-fail-eliminates, fire double-damage-eliminates, fire eliminates leader host triggers §10 cleanup, charge `defender_eliminated` surfaces leader id, charge `attacker_repulsed` at SP 1 eliminates attacker + leader without replacement)

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
