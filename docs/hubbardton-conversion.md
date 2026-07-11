# Hubbardton — scenario conversion

Specific decisions for porting the _American Revolutionary War series_ Hubbardton battle
(`hubbardton.pdf`, 7 July 1777 — series battle #6) into our engine. For the system-level
background and the reusable mapping/extension-point tables, see
`docs/scenario-conversion-guide.md`. Structurally this is a near-twin of Paoli
(`docs/scenario-conversion-guide.md` + the `PAOLI` scenario): a "British must eliminate N
Colonials by turn T, else the Colonials win" attrition race, here with an escape twist.

Historically: Fraser's British + Riedesel's Germans try to smash through a Continental
**rearguard** under Francis and Warner. The British fail to destroy it and take heavy losses —
a Colonial moral victory. Our conversion is deliberately Colonial-favourable on the escape.

## Decisions (all confirmed with the project owner)

- **Map → canonical 7×9** (rules §2). The source is 8 cols × 8 rows (flat-top; odd columns
  offset down). We dropped source **column c7** — the NE corner (Pittsford + Ridge hills and a
  road stub), farthest from the NW→centre→SE line of action — kept cols c0–c6 **1:1** (no
  interior renumber, parity preserved), and added an OPEN **row 8** to the south as the escape
  zone. The SE escape / `blue-R` re-anchored from c7 to col 6.
- **Green Mountain Men → one elite Colonial Light Infantry in the woods.** The source rule (a
  marked unit rerolls 1s in Woods; its enemies lose Woods' retreat benefit) has **no hook** in
  our engine: combat is percentage-based (`core/combat.ts` — `rng() < finalHitChance`, no d6 to
  "reroll a 1"), and `getRetreatHex` (`core/retreat.ts`) confers no terrain retreat benefit to
  negate. Both literal effects are unmappable / no-ops, so they are dropped; the intent ("a tough
  unit that fights in the woods") maps to an `elite` `LIGHT_INFANTRY` — the Green Mountain Boys
  were light riflemen, and Light Infantry is the only foot type that may enter WOODS.
- **Optional "better British" rules dropped.** The source's alternative (a Grenadier + Loyalist
  Cavalry, under which the British must eliminate _all_ Colonials) is not in the base scenario.
- **Turn-5/6 dice reinforcement → a single fixed turn-5 arrival.** `ReinforcementGroup` is
  fixed-turn only (no dice gating), so the source's "turns 5 & 6, on a 4-5-6 the Colonial gets a
  militia" becomes one guaranteed Colonial militia on turn 5.

## Unit mapping

| ARW unit                                    | Ours                                             | Note                                                                    |
| ------------------------------------------- | ------------------------------------------------ | ----------------------------------------------------------------------- |
| Colonial Regular ×3 (`C`)                   | `LINE_INFANTRY`, player 0, SP 4                  | The Continental rearguard line (col 5).                                 |
| Green Mountain Men (a marked Regular)       | `LIGHT_INFANTRY`, player 0, SP 4, **`elite`**    | Forward woods skirmisher at (4,2); see the Green Mountain Men decision. |
| British Regular ×2 (`B`) + ×1 (red `R`)     | `LINE_INFANTRY`, player 1, SP 4                  | Enter from the NW.                                                      |
| Loyalist Militia "light infantry" (red `R`) | `LIGHT_INFANTRY`, player 1, SP 3                 | Can contest the woods.                                                  |
| 2 Loyalist Militia (Germans), turn 3        | `LIGHT_INFANTRY`, player 1, SP 3 (reinforcement) | Riedesel's advance, at the NW `R` hexes.                                |
| 1 Colonial Militia, turn 5 (blue `R`)       | `LINE_INFANTRY`, player 0, SP 3 (reinforcement)  | At the SE escape corner (6,6); see the dice-reinforcement decision.     |

Quality differs by SP only (militia SP 3 vs regular SP 4) plus `elite` on the Green Mountain Men
(morale +15%) — the engine has no per-unit firing-tier modifier.

## Terrain mapping (this battle)

7 cols × 9 rows, north = row 0. Non-OPEN hexes only (all coords are target, = source cols 0–6):

| Feature                                        | Ours                                                                        |
| ---------------------------------------------- | --------------------------------------------------------------------------- |
| Sargent Hill, central rise, Zion Hill, SW hill | `HILLTOP` @ (3,0),(3,2),(5,1),(4,5),(4,6),(0,7)                             |
| Woods stands                                   | `WOODS` @ (0,3),(4,2),(3,4),(6,7)                                           |
| Crown Point military road                      | `roadEdges`: a col-5 spine (N↔S) + a west (row 1) approach joining at (5,1) |
| Colonial escape off the south edge             | `exitEdge: 'south'` @ (4,8),(5,8),(6,8) (also `objective` markers)          |

The escape column (col 5) is deliberately kept clear of woods so the Line-Infantry Continentals
can march down it to the south exit. WOODS is Light-Infantry-only route-around scenery; HILLTOP
is difficult terrain + elevation with **no** fire cover (per the standing frictions).

## Victory (`firstPlayer: 1`, `turnLimit: 7`)

- **British (player 1):** `eliminate_units`, `count: 3` — break 3 Colonial units (ungrouped, wins
  on its own).
- **Colonials (player 0):** an AND group (`group: 'col-standfast'`, both required) — an
  `eliminate_units` `count: 1` (break a British unit) AND an `exit_units` `edge: 'south'`,
  `count: 2` (march 2 units off the south edge; reuses the White Plains escape mechanic).
- **Delayed exit (`exitRule: { player: 0, notBeforeTurn: 6 }`):** the Continentals may not exit
  the board until turn 6 — a rearguard holds before it withdraws. They can advance to and stand
  on the south-edge exit hexes earlier; they just can't step off. Tunable via `notBeforeTurn`.

No `turnLimitWinner` → if neither side satisfies its goal by turn 7 the default surviving-SP
tiebreak fires. The source frames it as "British win by eliminating 3 by turn 7; if they fail, the
Colonials win by escaping 2." Modelling the British goal as its own condition and the Colonial goal
as an AND group captures this without a bespoke kind — and the added "break a British unit" clause
is both a balance lever and thematic (Hubbardton's notoriously high British casualties).

**Balance (why the kill clause + delayed exit exist).** With the escape alone, self-play
(`pnpm playtest --scenario=hubbardton`) had skilled Colonials simply sprinting 2 units off the edge
(smart-vs-smart ≈ 84% Colonial). Requiring them to _also_ break a British unit — so the rearguard
has to fight before it runs — brought that to ≈ 70% Colonial, and the delayed exit (hold until
turn 6) settles it at ≈ 67% Colonial (random ≈ 20%, baseline ≈ 43%, largely unchanged, since weak
Colonials rarely reach the edge at all). A Colonial lean under skilled play is deliberate:
Hubbardton was a Colonial moral victory. Levers if a different balance is wanted: `break 2 British`
instead of `1` flips it British-favoured (smart ≈ 34%); the escape count is hypersensitive
(escape 3 ≈ 3% Colonial); and `notBeforeTurn` tightens or loosens the hold. All numbers are tunable.

## Dropped (tied to ARW's structure / no clean fit)

The phased sequence + defensive fire (as with every ARW conversion), the Green Mountain Men
woods reroll & retreat-benefit denial (no engine hook — see above), the turn-5/6 reinforcement
die roll (fixed to turn 5), and the optional "better British" units/victory.

## Notable inexactness (vs. the tabletop battle)

- Plays in our unit-by-unit activation model, not ARW's phased sequence with defensive fire.
- Militia fire as effectively as regulars (no firing-tier modifier); differentiated only by SP.
- WOODS is impassable to Line Infantry — terrain to route around; only the (Light-Infantry)
  Green Mountain Men and Loyalist skirmishers actually fight in the woods.
- Under skilled play the Colonials are favoured (see Balance above) — a deliberate nod to the
  historical Colonial moral victory rather than a balance defect.
