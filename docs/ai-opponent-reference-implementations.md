# AI Opponents in Two Reference Hex Wargames

How the two sibling projects (`../Hex-Wargame-JavaScript`, `../CAPH`) implement
computer opponents, and how the same concepts drop into our engine. Written
2026-07-06.

**Bottom line up front:** both are *rule-based heuristic policies with no tree
search* — a fixed decision procedure run once per unit. That is exactly the
"greedy / 1-ply per-activation play" the [evaluation doc](./ai-opponent-evaluation.md)
already flagged as our laziest shippable opponent (M15). Neither project has an
eval function, minimax, or MCTS. They are concrete proof that a heuristic policy
is enough for a playable hex-wargame opponent, and both slot into our existing
`Policy` type (`sim/playout.ts`) with **zero new infrastructure**.

---

## 1. Hex-Wargame-JavaScript (`js/AI.js`, 214 lines)

**Model: scenario-scripted goals + odds-gated attack.** The distinguishing idea
is that the *scenario designer* supplies AI intent as data.

### Movement — goal-seeking with engage-override (`AI_unit_move`)

- Each unit belongs to a `group`; an `AI.csv` file maps every group to a **goal
  hex** `[x,y]` via `init` commands, parsed by `AI_box.setup`.
- For the unit's reachable hexes: collect any that put it in the enemy's ZOC
  (`al`) and compute each hex's distance to the goal (`md`).
- **If it can reach a ZOC hex → move to a random one of them** (divert to
  engage). **Otherwise → move to the reachable hex nearest the goal** (advance).

So movement is "march toward your assigned objective, but if the enemy comes in
reach, close with them." Objective comes from scenario data, not code.

### Combat — odds threshold + fire concentration (`AI_unit_combat_hex`, `attackplan`)

- Iterate hexes holding an enemy stack. For each, build an attack plan and greedily
  add friendly units (`battle_matcher`) until combat **odds** (`Σ attacker combat
  / Σ defender combat`) clear a threshold.
- **Only attack if `odds > 1`**; otherwise abort and touch nothing.
- After a won combat, `try_pursuit` picks a random pursuit target/hex.

### Turn loop (`AI_run`)

Phase-ordered: move phase (all own units seek goals / engage) → battle phase
(resolve every enemy-occupied hex at favorable odds) → next phase. Random only
appears as a tie-breaker (which ZOC hex, which pursuit).

**Takeaways:** (1) designer-authored per-group goal hexes; (2) never attack below
1:1 odds; (3) concentrate multiple units to reach the odds bar before committing.

---

## 2. CAPH (`caph/src/ai.fnl`, 116 lines, Fennel/Lua)

**Model: fixed priority list by unit role.** Simpler and more ad-hoc than the JS
one — no goals, no odds math, no positional reasoning. Three "levels," but
`level-3 == level-2` and `level-1` just ends the turn (a do-nothing tutorial AI).
All real behavior is in `basic-ai`.

### `basic-ai` — one action per call, first matching rule wins

Guarded by an `action-made` flag, in strict priority order:

1. **HQ** available → activate it (special ability).
2. **Artillery** with a valid fire target in range → **fire at a random valid
   target** (the only genuinely tactical rule — fire whenever able).
3. **Tank** → charge forward.
4. **Infantry** → activate (hold).
5. **Logistics** → move.
6. Fallback → mark the last unit inactive so the turn can end.

Within a matched rule, the unit is chosen **at random** among that type's
candidates. `level-2-ai` interleaves: run *one* `basic-ai` action for red, hand
control back to the player, repeat; drain all red units only once the player is
out. Ends the turn on objective-reached or mutual exhaustion.

**Takeaways:** (1) priority by unit *capability/role* is a cheap, legible policy;
(2) "fire whenever a target is in range" is a strong default for ranged units;
(3) it leans entirely on unit roles rather than map objectives — the weakness the
JS project's goal hexes fix.

---

## 3. How this maps onto our engine

The interfaces both projects hand-rolled, we already have:

| Their concept | Our equivalent (already built) |
| --- | --- |
| enumerate a unit's reachable hexes / targets | `getValidMoveTargets`, `getValidFireTargets`, `getValidChargeTargets` |
| "run the AI for a side" | the `Policy` type + `runGame` loop in `sim/playout.ts` |
| combat odds / attack-worth test | `resolveFireAction` exposes `finalHitChance`; expected damage is **closed-form** = `finalHitChance × (1 + DOUBLE_DAMAGE_CHANCE)` — no sampling needed |
| `AI.csv` per-group goal hex | scenario `VictoryCondition` already carries objective geometry: `control_hexes`/`hold_hexes` `.hexes`, `exit_units` `.edge` (see `victory.ts`). Per-group intent maps to `condition.group`. |
| random tie-break | the `rng` already threaded through `Policy` |

Neither project needs anything we lack. The AI is just another `Policy` — a
drop-in sibling of the existing `randomPolicy`, testable **immediately** with the
M14 playtest harness by swapping `randomPolicy → heuristicPolicy` in
`scripts/playtest.ts`.

### Recommended synthesis: `heuristicPolicy` — **shipped** (M15, no new infra)

Implemented in `sim/playout.ts` (`export const heuristicPolicy`), plus one core
extraction — `expectedFireDamage` in `combat.ts` (analytic, shares the modifier
math with `resolveFireAction`). Over 300 games/scenario it beats `randomPolicy`
100% on Pitched Battle and 90% on Bunker Hill as blue, and mirror play is far
more lethal than random (SP actually changes hands, eliminations appear) with a
~56–61% first-player edge — consistent with the seat-order effect the evaluation
doc flagged. Design below.


Combine the best of both — CAPH's priority ordering, JS's goal-seeking and
odds-gating — as one `Policy` in `sim/playout.ts`. Per activation:

1. **Fire/charge if worth it** (JS odds-gate + CAPH "fire when able"): among
   `getValidFireTargets`/`getValidChargeTargets`, take the action whose analytic
   expected damage is highest, and commit only if it clears a threshold. Prefer
   targets already low on SP (secure the kill / morale break).
2. **Else move toward objective** (JS goal-seeking): pick the reachable hex
   minimizing distance to the nearest enemy or to this unit's objective hex (from
   its `VictoryCondition.group`), with an engage-override — if a move brings a
   good fire/charge into range next, prefer it.
3. **Else skip.**

Order the units within a turn CAPH-style by role (artillery/ranged first while
lines of fire are open, cavalry for charges, infantry to advance/hold) rather
than the pure-random unit pick.

### What to borrow vs. skip

- **Borrow:** JS's designer-authored objectives (we get them free from victory
  conditions), JS's never-attack-below-favorable-odds rule, CAPH's role-priority
  ordering and fire-when-able default.
- **Compute analytically, don't sample:** JS re-derives combat odds from raw
  stats; our hit chance is already exact — integrate expected damage, per the
  evaluation doc.
- **Skip:** JS's `battle_matcher`/`attackplan` object plumbing (our
  `getValidFireTargets` + a sort replaces it) and CAPH's HQ/tank/logistics rules
  (unit types we don't have). No `.csv` AI-script layer — victory conditions
  already encode the intent.

### Ceiling

Both reference AIs are shallow: they play one unit's best *immediate* move with no
lookahead and lose to any coordinated line. That is the known trade — ship the
heuristic policy, measure it against `randomPolicy` in the harness, and only add
search (shallow alpha-beta or MCTS) if it plays too weakly. See
[ai-opponent-evaluation.md](./ai-opponent-evaluation.md) §Recommendation.
