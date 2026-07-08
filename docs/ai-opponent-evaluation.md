# AI Opponent & Self-Play Playtest — Evaluation

Evaluation of building an AI opponent and a self-play scenario-balancing harness,
based on the two research PDFs dropped in the repo root and the current state of
the engine. Written 2026-07-02.

## TL;DR

- **Both PDFs are the same paper.** `2502.13918v1.pdf` is an arXiv re-upload of
  `Roelofs_Bsc-paper.pdf` (Roelofs, _Monte Carlo Tree Search in a Modern Board
  Game Framework_, Maastricht BSc thesis, 2012). One recommendation, not two.
- **The recommended approach is MCTS/UCT over a fast simulator.** No neural nets,
  no reinforcement learning, no training data, no GPU, no LLM. This is the
  pragmatic choice for a solo project precisely because it needs _no hand-crafted
  evaluation function and no training pipeline_ — you trade wall-clock/sim-count
  for playing strength.
- **Verdict: pursue it now**, but in an order that front-loads the payoff. Build a
  headless driver + random self-play playtest harness _first_; treat the MCTS
  opponent as a gated fast-follow.
- **The playtest harness should come before writing more scenarios** — it tells
  you whether the scenarios you already have are balanced, and makes every future
  scenario cheaper to design.

## What the paper actually says

- **Algorithm:** MCTS with UCT selection (four phases: Selection → Playout →
  Expansion → Backpropagation). Exploration constant `C ≈ 7` for a 2s/move budget —
  must be re-tuned per game and per time budget.
- **The load-bearing requirement is a fast forward-model.** The whole method is
  "simulate to game end, thousands of times per move." Performance is dominated by
  simulator speed, _not_ by clever tree tweaks — their single biggest speedup
  (~4×) came from caching state mutation, not from the algorithm.
- **Needs:** cheap state cloning / apply-undo, legal-action enumeration per state,
  a terminal/win test, injectable RNG. **Does not need:** training data, offline
  compute, ML infra.
- **Pure-random playouts play weakly and run long.** Expect to add light domain
  heuristics to bias rollouts once basic strength is in place.
- **Skip the paper's two novel enhancements** (Move Groups, Grouped Chance Model).
  The paper itself finds them a wash — equal-or-slightly-worse than vanilla UCT.
- **Self-play at scale is the immediately useful side effect.** The paper ran
  ~800k random self-play games to validate its rules model and _detected a
  first-mover / seat-order advantage_. That is exactly the "actionable scenario
  insight" we want — and it works with a near-trivial policy, no MCTS required.

Target domain caveat: the paper's game is _Settlers of Catan_ (a hex-_tiled_
economic euro-game), not a combat wargame. Mechanics don't transfer (no LOS,
firing, charge, morale). What transfers is the **algorithm and the engineering
pattern**. Our game is actually an _easier_ MCTS target than Catan: 2-player
zero-sum and effectively perfect-information (Catan has hidden cards they had to
strip out to make it tractable).

## Repo readiness

The paper predicts a codebase like ours is "~80% of the way to a working MCTS
opponent." That checks out. The hard substrate is already built and tested:

- **Pure functions with injectable RNG everywhere** — every resolver in `core/`
  takes `rng: () => number = Math.random`. Exactly what playouts need.
- **Action enumeration already exists** — `getValidMoveTargets`,
  `getValidFireTargets`, `getValidChargeTargets`.
- **Terminal test + scoring exists** — `evaluateVictory`.
- **Immutable state updates** — units replaced via `.map()`, per project
  conventions.

**The one real gap:** game orchestration (turn advance, apply-action, player flip,
victory eval) lives inside the ~1075-line Svelte-runes `GameStore`, tangled with
UI/selection state. To play headless you need a driver that runs the loop without
the store's reactive/UI machinery.

Note also: the roadmap (M0–M13) is **complete**. There is no half-finished engine
work competing for attention — "what's next" is a genuine open question, which
strengthens the case for doing this now.

## Recommendation

Do NOT build MCTS first — it is the last and most optional piece. Front-load the
payoff:

### Phase 1 — Headless driver

The only real work, and it is shared by everything downstream. Lazy version:
**drive the existing `GameStore` forward programmatically** in a Node/vitest
context with injected RNG — the same code path players use, so results are
trustworthy. Do _not_ extract a pure reducer yet; sequential self-play needs no
state cloning.

### Phase 2 — Random/greedy self-play + balance report

Loop `{ pick unit → pick legal action → apply → check victory }`, run N thousand
games per scenario, report:

- win rate by side (blue vs. red)
- game length (turns)
- elimination / SP-loss rates

**This is the playtest tool.** It needs zero MCTS and delivers the
"actionable scenario insights" goal directly. Run it on the 3 existing scenarios
before authoring any new ones.

### Phase 3 — MCTS/UCT opponent (gated)

Green-light only after Phase 2 has proven the driver and earned its keep. This is
where genuine new cost appears: MCTS needs **cheap state cloning** to branch the
search tree, which the Svelte store won't give — this is when you'd extract a pure
reducer. Start with plain UCT + chance handling; add light rollout heuristics for
strength; skip Move Groups / Grouped Chance.

### Explicitly out of scope

- Any ML / RL / LLM approach — the paper doesn't use them and neither should we.
- The paper's two enhancements (Move Groups, Grouped Chance Model) — proven wash.

## Alternative proposal: Minimax + alpha-beta + Monte Carlo eval + Web Workers

A separate proposal argues for classic **minimax/alpha-beta search** with a
hand-crafted evaluation function, **Monte Carlo simulation** of each combat
engagement to estimate expected outcomes, and **Web Workers** (plus speculative
"pondering" during the player's turn) for UI responsiveness. Critical assessment:

- **It does not change Phases 1–2.** Minimax and MCTS need the _same_ headless,
  cloneable driver, and the self-play balance harness needs neither. This is
  entirely a Phase-3 decision — do not pre-commit the algorithm now.
- **Renderer premise is stale.** The proposal assumes an SVG map; we render on a
  LittleJS canvas. The presentation/engine separation argument is renderer-
  agnostic and still holds, but treat the proposal's specifics as generic
  defaults, not fitted advice.
- **Minimax vs MCTS — branching factor is decisive.** A turn is _activate every
  unit in some order, each choosing move/fire/charge over many hexes/targets_ —
  combinatorial branching per full-turn ply. Alpha-beta must enumerate to prune;
  MCTS samples and degrades gracefully. Minimax also _requires_ a good eval
  function — the single hardest, most open-ended piece, which MCTS was chosen to
  avoid. Counterpoint: an eval function is far more **legible, tunable, and
  debuggable** than rollouts (useful for difficulty levels / AI personality). Real
  tradeoff, not a slam dunk.
- **Monte Carlo combat eval — right instinct, wrong dose.** Our combat
  (`resolveFireAction`) is simple enough that expected damage is **closed-form** —
  integrate it, don't sample it hundreds of times. MC-eval _inside_ minimax
  (leaves × sims) is the cost blowup that then _forces_ the Web Worker complexity;
  analytic expectation avoids creating that cost. Reserve sampling for genuinely
  un-integrable chains (morale → retreat → cascade), and keep it shallow.
- **Web Workers + pondering — premature.** Turn-based tolerates a 1–3s AI pause
  with a spinner; players expect it. Workers add a serialization boundary and full
  DOM-decoupling you should not pay for until profiling shows main-thread jank.
  Pondering is chess-engine-grade optimization; skip it at v1. Phase 1's driver
  makes the later move-to-worker cheap, so nothing is lost by deferring.

### The synthesis (pivot piece: the evaluation function)

The eval function is **no-regret** — greedy play needs only it, MCTS uses it to
bias rollouts and as a leaf cutoff, minimax needs it as the leaf score. Write a
good one regardless of search choice.

That unlocks the **laziest path to a decent opponent**, unnamed by either source:
**greedy / 1-ply per-activation play, driven by the eval function + analytic
combat expectation.** No tree, no rollouts, no workers. Likely "good enough" for a
wargame and ships fastest. Add lookahead only if it plays too shallowly, and _then_
choose empirically between shallow alpha-beta and MCTS based on the strength
actually needed.

Durable ideas from the proposal: engine/presentation separation (already in
progress via Phase 1) and MC combat expectation (do it analytically). Minimax,
Web Workers, and pondering are Phase-3-or-later and none should be committed now.

## Suggested next step

Scope Phases 1+2 as a concrete milestone (M14: Headless Sim & Playtest Harness).
Keep the AI opponent as M15, gated behind M14's results, with the algorithm choice
(greedy-by-eval → optional shallow search → MCTS) deferred until then. The
evaluation function is the shared, no-regret first piece of M15 whichever search
wins.

## M14 Results — random-vs-random balance baseline (2026-07-02)

Phase 1 (headless driver) + Phase 2 (random self-play) shipped as M14:
`core/rng.ts` (mulberry32), `sim/playout.ts` (`runGame` reuses `GameStore`
directly, no reducer extraction), and `scripts/playtest.ts` (`pnpm playtest`).
1000 games per scenario, seed `i` per game `i` (reproducible: the table is
byte-identical across runs). Policy is uniform-random over every legal action
per activation, both sides, acting until each unit is exhausted.

| Scenario                  | Win P0 (blue) | Win P1 (red) | Draw  | Mean/median turns | Surv. SP blue/red | Elim. |
| ------------------------- | ------------- | ------------ | ----- | ----------------- | ----------------- | ----- |
| Pitched Battle (limit 15) | 42.0%         | 47.3%        | 10.7% | 15.0 / 15         | 21.2 / 21.4       | 0.0%  |
| Bunker Hill (limit 10)    | 2.5%          | 95.2%        | 2.3%  | 10.0 / 10         | 13.9 / 20.5       | 0.0%  |

**Verdict:**

- **Pitched Battle** looks close to symmetric under random play — a mild second-
  player (red) edge, no runaway. Reasonable to author against.
- **Bunker Hill** is heavily red-favoured (95%) and needs a design look — though
  the scenario is deliberately asymmetric (British assault vs. entrenched
  colonials + a torch objective), so a lopsided _random_ baseline is expected
  rather than alarming.

**Caveat (important):** random play is a floor, not a verdict. Every game runs to
the turn limit and is decided by the SP tiebreak — elimination rate is 0% and only
~3 SP change hands over a full game, because random units rarely concentrate fire
or pursue objectives. These numbers detect gross first-player / structural
asymmetry only; meaningful balance and pacing conclusions wait for M15's
eval-driven policy playing the same harness.

## Objective-aware goal-seeking (2026-07-08)

`smartHeuristicPolicy` now derives advance goals from **all** victory-condition kinds,
not just enemies + control/hold hexes. This is **smart-only**: `heuristicPolicy` stays
objective-blind (enemies + control/hold), keeping it the fixed low-bar incumbent the
A/B harness and tests measure against (`goalHexes(store, unit, objectiveAware)` — smart
passes `true`, baseline `false`). The two added kinds:

- **`raze`** → still-standing TOWN hexes. Torching needs no new action: a unit on a
  town hex has goal-distance 0, so it never advances off and dwells there until the
  scenario `torchRule` burns it. Bunker Hill British now win via their designed raze
  objective (`smart vs smart` red 38.5% → 56.5%, ~2 hexes burned/game).
- **`exit_units`** → the declared exit hexes for the owning side's edge. Such a side
  runs for the exit (enemies are dropped from its goals — they're the pursuers, and
  chasing them drags fleers backward); the "break N" half is met incidentally by
  disengaging fire. New `Action.isExit` step is scored above fire/charge so a unit
  at the edge actually leaves. Exits pursued: `smart` White Plains 3 → 318 aggregate.

**Verdict (paired-mirror A/B, smart vs the objective-blind baseline, 30 seeds/side):**
smart's net **win** edge across the suite rose from **+8 → +15**; the gain is Bunker
Hill (**+10 → +17 wins**, SP edge +71 → +116) where the British now win via the raze
objective instead of only the turn-limit SP tiebreak. Pitched Battle is unchanged (−2,
no objective there); White Plains is win-neutral (unwinnable — see below). Note we grade
this by **wins, not surviving SP**: on White Plains correct play _sacrifices_ SP to flee
(SP edge −83 there), so the old SP-swing regression test now misreads the escape scenario
as a regression — it was switched to net-wins accordingly (`playout.spec.ts`).

`exitBonus` (SmartTuning) is `1.0` by construction, not by sweep: it only has to exceed
max fire EV (~0.76) so an available exit always wins the argmax; any higher value is
behaviourally identical and White Plains can't be won regardless.

**Known limitation — no terrain-aware routing (DEFERRED).** `minGoalDist` is
straight-line cube distance, not path cost. Units greedily step toward whichever
neighbour lowers it, blind to rivers/impassable hexes blocking the route beyond.
**White Plains stays Colonial-unwinnable** as a result: the win needs 5 units off the
north edge but a game yields at most 3 (measured over 500 games), a conjunction of
(a) a single north exit hex `(3,0)` — the map's `exit refactor pending` — and (b) three
river-blocked Colonials that march north into a dead-end instead of routing around.
The ≥2-kill half is met in 41% of games, so only the exit half fails. Fix when a
scenario justifies it: A\* over `movement.ts` costs keyed off the same `goalHexes`
(see the `ponytail:` note on `minGoalDist`), plus widening the White Plains exit.
