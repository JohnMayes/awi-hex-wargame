# AI Heuristic — Situational Awareness (report & recommendation)

Written 2026-07-10. Responds to: "the AI marches every unit in a column at the
central hill; it should send one unit to hold, and flank / fire in mutual support
with the rest — can we give the heuristic board-condition awareness, and does this
feed a later MCTS?"

Short answer: yes, and the two goals are the same piece of work. The column is a
structural symptom of a **per-unit, per-action greedy** policy that has no model
of the _team's_ position. The fix — a positional evaluation `evalState(store,
player)` plus a couple of team-relative terms — is exactly the "no-regret pivot
piece" the evaluation doc already flagged (`docs/ai-opponent-evaluation.md`,
"The synthesis"), and it is the same object a future MCTS uses for leaf value,
rollout bias, and move ordering. Improving the heuristic _is_ pre-building the MCTS.

---

## 1. Why the column happens (diagnosis, not vibes)

`smartHeuristicPolicy` in `sim/playout.ts` is called once per decision. Each call:

1. picks the un-activated unit whose single best action scores highest, then
2. `scoreAction` scores that one action **in isolation** — fire EV, charge SP-edge,
   or a move that is _strictly closer_ to the nearest goal (`goalPathCost` BFS).

`goalHexes` for Pitched Battle returns **every enemy plus the one `control_hexes`
objective** — the central hill `(3,4)`. Every unit independently walks down its own
shortest path to its nearest goal. Because the hill is central and the map funnels
through it, and because a move only scores when it is _strictly closer_ (units queue
behind each other on the one shortest corridor), the emergent behaviour is a column.

Three missing ingredients, all the same root cause — **no team model**:

- **No diminishing returns on an objective.** "Hold the hill at end of turn 15"
  (`atTurn: 15`, `requireAll`) needs _one_ surviving unit on `(3,4)`. The marginal
  value of the 2nd–6th unit there is ~0, but each still scores the hill as its
  nearest goal.
- **No notion of support or exposure.** A unit's move score can't see whether it is
  walking alone into two enemies' fire envelopes, or into a position a friend covers.
- **No game-phase awareness.** The same weights fire on turn 1 and turn 15, whether
  the AI is up four units or down four. The policy never consults victory status
  (there is an open commit note to that effect).

This is consistent with the measured "strength is FLAT across a wide band" comment:
tuning the _isolated-action_ bonuses can't buy much, because the information that
distinguishes good team play from bad isn't in any single-action score. The flat
band is the ceiling of per-unit greedy, not a tuning plateau.

---

## 2. The pivot: a positional `evalState(store, player)` + team-greedy

Add one pure function:

```
evalState(store, player) -> number   // + = good for `player`, zero-sum
```

built from terms the game already exposes: material (Σ own SP − Σ enemy SP),
objective control (do we hold/contest each objective hex; is an `eliminate_units`
count on track), and **positional** terms (below). Then change the policy's
selection rule from "argmax isolated-action score" to **team-greedy**: score each
candidate action by the _change in `evalState`_ it produces (apply on a throwaway
copy, read eval, discard). `scoreAction` stays as the fast move-ordering key.

Why this fixes coordination for free: value becomes team- and board-relative. Once
one unit is on/heading to the hill, a second unit going there barely moves
`evalState` (objective already satisfied), so a flanking or firing move outscores
it. No explicit "role assignment" state machine needed — the diminishing return is
in the eval, recomputed from board state each call, so it stays compatible with the
stateless repeated-call policy model.

This is the same `evalState` that:

- an MCTS uses as a **truncated-rollout leaf value** (stop the playout early, score
  the position — far cheaper than random-to-terminal, which the eval doc notes
  "play weakly and run long"),
- an MCTS uses to **bias rollouts** (default policy = current greedy), and
- both use as the **progressive-bias / move-ordering prior** (`scoreAction`).

So every hour spent on `evalState` and the situational terms is paid back three
times when search lands.

---

## 3. Situational terms worth adding (cheap, tuning-gated, A/B-able)

Each is an additive term in `evalState` (or, until team-greedy lands, a
`SmartTuning` bonus in `scoreAction`), so each drops into the existing paired-seed
A/B harness (`scripts/playtest.ts`, `abReport`) one at a time against the current
`smartHeuristicPolicy` incumbent. Ordered by expected leverage.

1. **Objective saturation / capacity — kills the column directly.**
   Value an objective hex by _coverage_, not per-unit distance: full credit once one
   friendly holds/contests it, sharply diminishing for additional units. Surplus
   units fall back to engaging enemies. Highest leverage, smallest change; testable
   on Pitched Battle by watching hill-occupancy and the SP margin.

2. **Mutual support & exposure (local force ratio).**
   For a candidate hex, count friendly fire envelopes that overlap it / the enemy it
   targets, vs enemy envelopes that cover it. Reward overlapping support (two units
   that can both shoot the same enemy, or cover each other); penalise stepping alone
   into more enemy guns than friends can answer. This is the mechanical content of
   "mutually supporting firing positions" (fire is range 2, artillery 4). O(units²)
   per candidate — fine for live play, keep an eye on it in headless sweeps.

3. **Focus fire / target concentration.**
   Prefer firing at targets the team is collectively threatening and at already-low
   SP units (convex: removing a shooter removes its future output). Partly emergent
   today via `finishBonus`; make it explicit and team-aware. Directly attacks the
   "0% elimination, ~3 SP changes hands" floor from the M14 baseline — games that
   never kill anything are decided by the SP tiebreak, not by play.

4. **Flank / entrenchment-facing awareness.**
   This ruleset has **no unit facing** — "flanking" is mechanically meaningful only
   against (a) entrenched hexsides (attack the un-entrenched face → no cover/charge
   penalty, see §2.1) and (b) elevation (the new uphill/downhill modifiers). So
   "flank" reduces to: don't fire/charge into an entrenched face when an open side is
   reachable; prefer approaches from higher ground. Cheap, and matters most on Bunker
   Hill (entrenched colonials), less on open Pitched Battle.

5. **Game-phase / victory-status aggression scaling — the explicit ask.**
   A single scalar `aggression` derived from `evalState` margin + turns remaining +
   `turnLimitWinner`, multiplying the risk-bearing terms (charge willingness,
   exposure tolerance, hold-vs-push on objectives):
   - **Ahead / designated timeout winner** (e.g. Bunker Hill red `turnLimitWinner: 1`):
     dial down — hold cover, hold objectives, decline marginal charges, run the clock.
   - **Behind / must force a decision before the limit:** dial up — take +EV-marginal
     charges, push objectives, accept exposure.
     The heuristic ignores victory status entirely today; this is the highest-value
     "board-condition weight" and is one number once `evalState` exists.

---

## 4. What NOT to do (lessons already paid for)

- **Don't keep tuning isolated-action bonuses expecting a breakout.** The flat band
  says that lever is spent. The new signal must be team/positional.
- **Don't relax the "strictly closer" move gate to allow free lateral/uphill
  "unstick" steps.** Already A/B'd and it _lost_ (Bunker Hill −37 to −42): a
  memoryless greedy escape just oscillates. Lateral repositioning only pays once it
  is justified by an eval term (support/exposure), not as an unconditional allowance.
- **Don't reach for A\* per-goal-per-candidate.** It timed out the headless harness;
  the shared BFS in `goalPathCost` is the deliberate replacement. Keep new terms
  cheap enough to survive thousands of headless games.

---

## 5. MCTS — where it fits, what it really costs

The user's instinct is right on both counts:

- **Cost asymmetry is real and it cuts the way they think.** Against a human, an
  MCTS move has a whole human think-time to spend — a 1–3 s budget with a spinner is
  fine (the eval doc's Phase-3 stance). The expensive consumer is the **headless
  balance sweep** (1000 games × scenarios, run repeatedly). MCTS rollouts there would
  be catastrophic. So: **MCTS for live play only; balance sweeps stay on the fast
  greedy policy.** They serve different masters and should not share an engine.

- **The genuine engineering gap is apply/undo, not the algorithm.** `GameStore`
  mutates in place; MCTS needs cheap state cloning or make/unmake to branch the tree
  (called out in both AI docs). That substrate — plus terminal test and injectable
  RNG (already present) — is the real work. `evalState` + situational terms need
  _none_ of it and pay off immediately in the shipping greedy opponent.

- **Better heuristic → better MCTS is literally three couplings**, all built here:
  1. greedy policy → MCTS **rollout default policy** (biased playouts beat random);
  2. `evalState` → **truncated-rollout leaf value** (short playouts, huge speedup);
  3. `scoreAction` → **move-ordering / progressive-bias prior** (fewer sims to a good
     move). Combining them later is not a rewrite; it is wiring the same parts into a
     UCT loop.

---

## 6. Recommended sequence

1. **`evalState(store, player)`** — material + objective + a first positional term
   (objective saturation, #1 above). Ship greedy play as _argmax Δeval_ (team-greedy),
   keeping `heuristicPolicy` as the frozen A/B incumbent. Expect the column to break
   here.
2. **Add terms #2–#3** (support/exposure, focus fire) one at a time through the A/B
   harness; keep each behind tuning. Watch elimination rate and SP swing climb off the
   floor, and the smart-vs-baseline edge grow.
3. **Aggression scaling (#5)** once `evalState` gives a margin to key off. Flank/
   entrenchment (#4) as a Bunker-Hill-targeted follow.
4. **MCTS (gated, live-only):** only after 1–3 have raised the greedy ceiling. First
   real task is apply/undo (clone or reducer), then a plain UCT loop reusing the three
   couplings above. Do **not** point it at the balance sweeps.

Measurement is already in place: `abReport` paired-mirror sweep for strength, and
`mechanicStats` (`sim/report.ts`) for _how_ games decide (fire hits, charge outcomes,
eliminations). A good change shows up as: column gone, elimination rate off 0%, SP
swing up, smart-vs-baseline edge up — not just a win-rate wiggle inside the noise.

---

## 7. Implementation status — steps 1–3 shipped (2026-07-10)

Steps 1–3 are implemented in `sim/playout.ts`, each behind a `SmartTuning` knob and
verified with unit tests + a paired-mirror A/B. **Deliberate deviation from §6:** they
were built as **analytic per-action terms in the existing greedy**, _not_ the `evalState`

- team-greedy (`argmax Δeval`) refactor §6 step 1 sketched. Team-greedy needs cheap state
  cloning — which is exactly the MCTS apply/undo substrate — so pulling it in now would have
  front-loaded the deferred MCTS cost. The pure feature functions below are written so a
  future `evalState` aggregates them board-wide unchanged; nothing about this choice blocks
  MCTS, it just doesn't pre-pay for it.

* **Step 1 — objective saturation** (`goalHexes`, knob `objectiveClaimants`, default 1). A
  held objective is a goal only for its occupier; an unheld one only for the nearest N
  friendlies; the rest fall back to engaging. A/B (300 games/scenario) vs disabled:
  **Pitched Battle +97/600 win-edge** (the column is gone), Bunker Hill / White Plains
  unchanged (neither has a control/hold objective).
* **Step 2 — mutual support/exposure + focus fire** (`scoreAction`; `enemyThreatCount`,
  `friendlyCoverCount`, `firersOnTarget`; knobs `supportWeight`, `exposureWeight`,
  `woundedWeight`, `concentrationWeight`). A/B non-regressive on win-edge everywhere,
  **Bunker Hill +30/600 (~2.5σ)**, elimination/fire throughput up across the board.
* **Step 3 — aggression scaling** (`aggressionFor`; knob `aggressionGain`, default 1; plus a
  read-only `GameStore.turnLimitWinner` getter). One board-condition scalar (SP margin,
  objective differential, clock, timeout winner) shifts charge willingness and exposure
  tolerance. A/B non-regressive; effect modest and concentrated in the timeout-winner
  scenarios (Bunker Hill, White Plains) — first-cut coefficients, flagged for a full sweep.

**Cumulative** (all three phases vs the pre-change smart policy, 300 games/scenario): **Pitched
Battle +84/600, Bunker Hill +27/600 win-edge, White Plains win-neutral** — the new default beats
the old smart AI on both decisive scenarios with no win-regression on the exit scenario.

All knobs default ON because each phase's A/B was win-edge non-negative; any that later
regresses in a fuller sweep can be zeroed without code changes. `heuristicPolicy` remains the
frozen baseline incumbent.

### MCTS bridge (future work)

The feature functions above are the terms a future `evalState(store, player)` sums over the
whole board (material Σ SP, objective control, support/exposure, aggression margin). MCTS then
reuses: `evalState` as the **truncated-rollout leaf value**, `scoreAction` as the
**move-ordering / progressive-bias prior**, and `smartHeuristicPolicy` as the **rollout default
policy**. The one unbuilt piece is still **cheap state cloning / apply-undo** on `GameStore`
(the deliberately deferred substrate). Keep MCTS pointed at live play only; the headless balance
sweeps stay on this fast greedy policy.

---

## TL;DR

The column is the signature of per-unit greedy with no team model. Build one
positional `evalState`, switch selection to team-greedy (argmax Δeval), and add
situational terms — objective saturation first (breaks the column), then mutual-
support/exposure and focus-fire, then a victory-status aggression scalar. It is the
same `evalState` a later live-only MCTS uses for leaf value, rollout bias, and move
ordering, so this work is the shared substrate, not a detour. Keep the fast greedy
for headless balancing; MCTS's real cost is apply/undo, not the search.
