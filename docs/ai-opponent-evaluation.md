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

**Terrain-aware routing (IMPLEMENTED).** The smart policy's move scoring uses
`goalPathCost` — a multi-source BFS over `passableNeighbors` (movement.ts), i.e. a
distance _field_ to the nearest goal that routes around rivers/impassable terrain. It
replaces straight-line `minGoalDist` for smart (baseline keeps straight-line as the dumb
incumbent). Verified: the White Plains west units autonomously follow
`(1,3)→(1,6)→(2,6)→(3,4)→exit` — the correct detour around the river, no authored
waypoints. A field (recomputed per decision) was chosen over a cached A\* path: no
staleness when units/hexes block the route, no per-unit "which waypoint am I on" state,
and it handles moving-enemy goals a start-of-game path can't.

**White Plains stays Colonial-unwinnable anyway** — a _map_ limit, not a routing one: 5
units must exit but a game yields at most 3, from (a) a single north exit hex `(3,0)`
(the map's `exit refactor pending`), (b) a ~10-step river detour vs a 10-turn limit, and
(c) three west units congesting one corridor. The ≥2-kill half is met in 41% of games;
only the exit half fails. **This was addressed** — see "Leader command collapse" below:
raising the turn limit to 15 (plus the leader fix) makes blue win ~19%.

**Gate relaxation — tried, reverted.** Watching play, units _look_ incoherent: the
correct river detour heads _away_ from the exit first, and jammed units stall for turns.
The stall traced to the advance gate (`there >= here → skip`): a unit whose only reachable
step doesn't reduce path cost freezes. Relaxing it to allow a least-bad "unstick" step was
A/B'd two ways (uphill+lateral, and lateral-only) and **both lost** — Bunker Hill −37 to
−42, Pitched −3 to −21, and _no_ White Plains exit gain. A memoryless greedy escape just
wanders/oscillates (step uphill to escape → "improving" pulls it right back), and most of
the observed stalls are _correct_ congestion-waiting behind friendlies. The strict gate
stays. A real fix (rarely worth it) needs path memory or multi-unit path reservation —
a much larger project than any current scenario justifies.

**Leader command collapse — fixed (AI) + rebalanced (scenario).** The AI used to send
the leader's host to the exit like any other unit; on White Plains, Washington's host
(`col-reg-2`) exited ~turn 4 (199/200 games), and with the sole blue leader gone every
unit fell out of command (§8.2) — blue command-failure jumped 10.6% → 50.3%, and a failed
check wastes the whole activation (`gameStore.#activate`). Two changes, which only work
together:

- **AI (`isLeaderShepherd`, playout.ts):** a leader's host no longer bolts for the exit.
  While any other friendly unit remains, it tracks the pack (nearest-friendly goals, not
  the exit hex — which it would also clog) so its command radius stays over the escapers;
  it leaves only as the last unit. Effect: blue out-of-command 53% → 0.7%. Scoped to
  exit-side leader hosts, so Bunker Hill / Pitched are untouched by construction.
- **Scenario (White Plains `turnLimit` 10 → 15):** the ~10-hex river detour is impossible
  in 10 turns regardless of command.

Paired result (blue win %, smart-v-smart, 300 games):

|                | turnLimit 10 | turnLimit 15 |
| -------------- | ------------ | ------------ |
| no leader fix  | 0.0%         | 1.7%         |
| **leader fix** | 0.0%         | **19.3%**    |

Neither alone helps (turn 15 without the fix wastes the extra turns on out-of-command
rolls; the fix at turn 10 can't beat the detour). Together, White Plains becomes a live
"can they escape?" scenario (~19% blue / ~80% British) instead of a foregone 100% British.
General lesson: the mechanic (command friction, §8.2) and scenario were both fine — the AI
just wasn't respecting the value of keeping its leader with the army.

**To investigate later — victory-status / completion awareness.** The heuristic has no
notion that an objective is already banked: on Bunker Hill it keeps sending units at the
Charlestown TOWN hexes after the raze (`count: 1`) is met. The obvious lazy fix — skip a
goal whose `store.victoryStatus[…].met` is true — was prototyped and **measured worse**,
so it was NOT shipped: gating raze-when-met cost ~36 wins / 400 games (win edge +93 → +57,
and → +41 for a "hold cover if occupying" variant). The town hexes double as flanking
cover, so keeping units oriented at them funnels the assault up the left flank instead of
frontally into the hill — the "waste" is the AI finding good ground. Distinctions worth
teasing apart when revisiting:

- **Cumulative vs continuous kinds.** `raze` / `exit_units` bank irreversible progress
  (safe to stop pursuing once met); `control_hexes` / `hold_hexes` are instantaneous state
  (must still hold the hex at turn-end eval — dropping them would abandon the objective).
- **Objective goal vs positional value.** On Bunker Hill the two are entangled (torch
  target == good cover). Completion awareness only helps where they're separable — e.g. a
  future _winnable_ exit scenario, where exiting a surplus unit strips your firing line, or
  a raze target on poor terrain. Add it gated to the specific kind that benefits, with an
  A/B showing a win gain — not as a blanket rule. The hook is a one-liner
  (`store.victoryStatus.some((s) => s.id === c.id && s.met)`).
