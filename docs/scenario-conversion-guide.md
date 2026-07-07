# Scenario conversion guide: ARW series → our engine

A reusable reference for porting battles from the _American Revolutionary War series_
(`Bunker-Hill.pdf` and its eight sibling battles share one set of "series rules") into this
project's engine. **We convert the _scenario_, not the engine** — the battle plays inside our
rules, accepting inexactness where the two systems diverge. First applied in the Bunker Hill
conversion (`docs/bunker-hill-conversion.md`), then White Plains (which added the off-map
exit action + `turnLimitWinner`); generalize from there.

## 1. System comparison (source vs. target)

| Dimension                 | ARW series (source)                                                                                                                                                                 | Our engine (target)                                                                                              | Conversion stance                                                                                                                                              |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Turn structure            | Phase-based IGO-UGO: reinforce → British move → Colonial defensive fire → British offensive fire → Colonial move → British defensive fire → Colonial offensive fire → victory check | Unit-by-unit activation; each unit: command check → action → charge → morale; players alternate whole turns      | **Drop their sequence.** Play in our activation model. The biggest inexactness — inherent and accepted.                                                        |
| Reaction / defensive fire | Yes — the defender fires when the enemy moves adjacent                                                                                                                              | None — you fire on your own activation                                                                           | **Drop.** No reaction-fire concept; not worth building.                                                                                                        |
| Combat resolution         | Adjacent only; roll 1d6, hit if the roll ∈ the counter's printed numbers                                                                                                            | Ranged (range 2/4) + LOS trace; % hit chance; charge = opposed contest                                           | Our richer combat supersedes; map loosely.                                                                                                                     |
| Cover                     | "Not hit on a 6" — cover deletes the 6 from the attacker's hit set                                                                                                                  | −15% hit chance (woods / town / entrenchment)                                                                    | Our cover model stands in.                                                                                                                                     |
| Unit strength             | 2 steps: full → striped → dead                                                                                                                                                      | SP (default 4), eliminated at 0                                                                                  | Map "hits" via SP / eliminations (see victory).                                                                                                                |
| Unit quality              | Encoded in hit-numbers: Militia = 6 (~17%), Regulars = 5,6 (~33%), Grenadier / Artillery = 4,5,6 (50%)                                                                              | Per-**type** `baseHitChance` + per-unit `elite` (morale only) + per-unit `maxStrengthPoints`                     | **SP is the only per-unit quality lever affecting combat.** No firing-tier modifier exists — low-quality units fire as well as good ones; differentiate by SP. |
| Command / morale          | None (just a retreat roll on hit)                                                                                                                                                   | Full leaders + command radius + morale checks                                                                    | Keep ours; author **generous leaders** so command-check friction stays low (mirrors ARW's command-less feel).                                                  |
| Cavalry                   | Move 2; woods/swamp cost both moves; river-cross rolls                                                                                                                              | Dragoons / Light Horse / Horse move 2 + charge                                                                   | Map by role when a battle uses cavalry.                                                                                                                        |
| Entrenchments             | Hexside; "not hit on 6" + retreat immunity                                                                                                                                          | **Hexside; charge −1 + cover −0.15** (`core/hex.ts` `entrenchedEdges` / `isEntrenchedToward`)                    | Direct reuse — makes entrenched-defense battles cheap to port.                                                                                                 |
| Reinforcements            | Per-battle; arrive on a turn at marked hexes                                                                                                                                        | `ReinforcementGroup` (turn N, player, units @ hexes)                                                             | Direct reuse.                                                                                                                                                  |
| Victory                   | Per-battle, often asymmetric; hit-count + objective based                                                                                                                           | `victoryConditions[]`: `eliminate_units`, `control_hexes`, `hold_hexes`, `exit_units`; SP tiebreak at turn limit | Reuse `eliminate_units` for "inflict casualties"; add a new kind only for the side that needs something we don't track (e.g. burned hexes).                    |

## 2. Terrain mapping (any ARW battle)

| ARW terrain            | Our `TerrainType`                                 | Caveat                                                                                                                                                                         |
| ---------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Plains                 | `OPEN`                                            | —                                                                                                                                                                              |
| Hill / rough           | `HILLTOP`                                         | Ours is difficult-terrain + elevation + charge-defense, **but gives no fire cover** (ARW hills do). Lean on entrenchments on defended hills.                                   |
| Building / town        | `TOWN`                                            | Enterable by Line/Light Infantry only (not cavalry/artillery).                                                                                                                 |
| Woods                  | `WOODS`                                           | **Light-Infantry-only in ours.** ARW woods take all foot. Where infantry must enter woods, this fails — accept woods-as-impassable-feature, or add a terrain variant (future). |
| Swamp                  | `MARSH`                                           | Impassable in ours (ARW swamp is passable-with-cost).                                                                                                                          |
| Lake                   | `LAKE`                                            | Impassable border.                                                                                                                                                             |
| River (hexside)        | `riverEdges` + `crossingEdges` on the hex         | True hexsides: impassable river edges, crossable at a bridge/ford edge. No cross roll (dropped). See `riverBlocks`.                                                            |
| Road                   | `ROAD`                                            | +1 move along an all-road path.                                                                                                                                                |
| Entrenchment (hexside) | `entrenchedEdges` on the hex, facing the attacker | The shipped hexside feature.                                                                                                                                                   |

**Two standing frictions** (re-check every battle): (1) WOODS = Light-Infantry-only;
(2) HILLTOP has no fire cover.

## 3. Our engine's extension points (where to plug a conversion in)

- **Scenario is pure data** — `core/scenario.ts` `Scenario`: `map`, `units` (full `Unit[]`),
  `leaders` (`{id, attachedToUnitId, commandRadius}`), `firstPlayer`, `turnLimit`,
  `victoryConditions`, optional `reinforcements`. Register in `SCENARIOS` (`data/scenarios.ts`);
  loaded via `GameStore.fromScenario` → `initGameStore`. `resetGameStore()` swaps scenarios.
- **Map authoring** — `data/maps.ts` `MapDefinition` = `{ col, row, terrain, entrenchedEdges? }[]`.
- **Victory** — `core/victory.ts` `evaluateVictory(conditions, snapshot, progress)`. Snapshot
  carries `turn`, `turnLimit`, surviving `units`, `eliminatedByPlayer` (cumulative kills),
  `bounds`, `exitedThisTurn`, `burnedHexes`. **No hit-count / SP-damage concept** — only
  eliminations + an SP tiebreak at the turn limit. A new kind = one union member + one
  `isConditionSatisfied` case (+ a snapshot field if it needs new data). Compose, don't
  combine: conditions share an optional `group` — ungrouped conditions each win on their own
  (OR); a player's conditions sharing a group win only when **all** are satisfied (AND). So
  "raze AND eliminate" is two simple conditions in one group, not a bespoke combined kind.
- **Reinforcements** — `gameStore` `#processReinforcements` (constructor + every `endPlayerTurn`
  flip): deploys due, unblocked groups; retries when the entry hex is occupied.
- **Turn / victory hook** — `endPlayerTurn` flips `activePlayer`, increments `turn` on the
  player-1→0 handback, clears activated flags, processes reinforcements, and runs
  `#evaluateVictory()` once per full round (`prevPlayer === 1`). **This is where per-turn
  scenario mechanics hook in.**
- **Runtime terrain change** — `grid` is `$state` and `HexCell.terrain` is a settable property
  read every frame by `gameRender`; combat/LOS/movement all read `hex.terrain`. So a direct
  `hex.terrain = …` mutation changes behavior and re-renders with **no other code**.
- **Adding a `TerrainType`** touches exactly four places (compiler/tests enforce it via
  `Record<TerrainType, …>` + spec `Object.values` loops): `core/types.ts` (enum),
  `core/terrain.ts` (`terrainDefinitions`), `render/terrainStyle.ts` (color),
  `core/terrain.spec.ts` (count assertion).
- **RNG** — injected as `rng: () => number = Math.random` through every action method; pass a
  deterministic sequence in tests.
- **Unit quality levers** — per-type `baseHitChance` (not per-instance), per-unit
  `maxStrengthPoints`, per-unit `elite` (morale +15% only).

## 4. Conversion checklist (per battle)

1. Map terrain (table §2); transcribe the battle map to a `MapDefinition` (note the two frictions).
2. Map units to types + SP; encode quality via SP (and `elite` where it's a morale-veteran).
3. Author leaders with generous radius (avoid command-check friction).
4. Schedule reinforcements (`ReinforcementGroup`s).
5. Express victory: reuse `eliminate_units` for casualty goals; add a new victory kind only for
   a goal we don't track.
6. Decide which special rules survive: keep anything that fits our model; **drop phase-tied
   rules** (defensive fire, fire-phase-gated effects) rather than rebuilding their sequence.
   Consider small, self-contained mechanical additions (e.g. dwell-to-torch burning) when they
   carry a battle's identity and fit a single hook point.
7. Register in `SCENARIOS`; make selectable.
8. Test (victory kinds + any new mechanic), `pnpm check`/`lint`/`test`, and play it via `pnpm dev`.
