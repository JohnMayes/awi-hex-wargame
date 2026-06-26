# Bunker Hill — scenario conversion

Specific decisions for porting the _American Revolutionary War series_ Bunker Hill battle
(`Bunker-Hill.pdf`, 17 June 1775) into our engine. For the system-level background and the
reusable mapping/extension-point tables, see `docs/scenario-conversion-guide.md`.

## Decisions (confirmed with the project owner)

- **Map:** the **accurate** variant (the PDF offers "accurate" vs contemporary "British"). On
  the accurate map, **School Hill is forest (woods)**, not hill. It is the map image on PDF p.5.
- **Burning Charlestown → dwell-to-torch.** Rather than a player "torch" action verb, a British
  unit must **hold a Charlestown hex for N consecutive game turns** to burn it. No new action
  UI; the agency is committing a vulnerable unit to sit under fire. Lives entirely in one
  turn-advance hook.

## Unit mapping

| ARW unit                                     | Ours                                                     | Note                                                                                          |
| -------------------------------------------- | -------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Colonial Militia — 4 at setup, 2 reinforcing | `LINE_INFANTRY`, player 0 (blue), `maxStrengthPoints: 3` | Brittle. Fires as well as regulars — we have no firing-tier modifier; accepted fidelity loss. |
| British Regulars — 4 at setup, 2 reinforcing | `LINE_INFANTRY`, player 1 (red), SP 4                    | —                                                                                             |
| British Grenadier (ARW optional rule)        | `LINE_INFANTRY`, `elite: true`                           | Substituted for one of the two British reinforcements. `elite` affects morale only.           |

No cavalry or artillery appear in the Bunker Hill setup.

## Terrain mapping (this battle)

| Feature                                         | Ours                                                                  |
| ----------------------------------------------- | --------------------------------------------------------------------- |
| Plains                                          | `OPEN`                                                                |
| Bunker Hill, Breeds Hill, Moulton's Hill        | `HILLTOP`                                                             |
| Charlestown                                     | `TOWN` (burns → `BURNED`)                                             |
| School Hill + scattered woods                   | `WOODS` (Light-Inf-only → route-around terrain that blocks LOS)       |
| Mystic River, Boston Harbour, Causeway water    | `LAKE` (impassable border)                                            |
| Roads                                           | `ROAD`                                                                |
| Entrenchments on Breeds & Bunker (red hexsides) | `entrenchedEdges` on those hexes, facing the British (south) approach |

## Map layout

7 columns × 9 rows (rules §2), topLeft origin, **north = row 0** (Causeway / Mystic River),
British attack from the **south** (high rows). Transcribed from PDF p.5. Landmarks:

- **LAKE** along the left edge, right edge (Mystic River), and bottom (Boston Harbour).
- **HILLTOP:** Bunker Hill (upper-center), Breeds Hill (center), Moulton's Hill (lower-right).
- **WOODS:** School Hill (left-center) plus the scattered dark-green hexes mid-map.
- **TOWN:** Charlestown (lower-left, 1–2 hexes).
- **ROAD:** the grey roads running south→north up the middle.
- **`entrenchedEdges`:** on the Breeds Hill `C` (Colonial setup) hexes and on Bunker Hill, the
  front/south-facing edges toward the British. Exact direction indices verified at render
  (`cornerStartForDir` in `render/engine.ts`); combat is bearing-based so "edges facing the
  attacker" is what matters.

Setup/role hexes (from the map's letter markers): `C` = Colonial setup (on/around Breeds Hill),
`B` = British setup (south, near Charlestown / along the roads), `R` = Colonial reinforcement
arrival (north, near Bunker Hill).

## Special rules

**Kept / converted:**

- **Burning Charlestown** → dwell-to-torch (above). New `TerrainType.BURNED` behaves like
  `OPEN` (a burned town loses cover + LOS-block automatically). `Scenario.torchRule = {
dwellTurns: 2, player: 1 }`. The store counts game-turns each TOWN hex is held by the
  `torchRule.player`; at the threshold the hex becomes `BURNED`.
- **Entrenchments** → the shipped hexside feature (charge −1, fire cover −0.15).
- **Turn-3 reinforcements** → `ReinforcementGroup`s (2 British @ `B` incl. the Grenadier,
  2 Colonial @ `R`).

**Dropped (tied to ARW's phase structure; no clean fit in our activation model):**
defensive/offensive fire split, the ammunition-shortage roll (gates _defensive_ fire, which we
don't have), the optional Charlestown sniper, and ARW's exact retreat-immunity rules (our
entrenchment combat bonus already conveys "hard to budge").

## Victory

Asymmetric, composed from simple conditions rather than a bespoke combined kind:

- **British (player 1):** two conditions sharing `group: 'brit-win'` (an AND group — both must
  hold): a `raze` condition (`count: 1`, burn at least one Charlestown hex) and an
  `eliminate_units` condition (`count: 4`, break the Colonial line). Forces the British to
  _both_ torch Charlestown and grind the defenders.
- **Colonials (player 0):** a single, ungrouped `eliminate_units`, `count: 4` (≈ the ARW
  "British take 8 hits", where a killed 2-step unit = 2 hits, across 6 British units).

The `group` field is the general AND primitive (see the conversion guide): ungrouped conditions
each win on their own (OR); conditions of one player sharing a group win only when all are
satisfied. `firstPlayer: 1` (British attack first), `turnLimit: 10`. All victory numbers and
`dwellTurns` are tunable after playtest.

## Notable inexactness (vs. the tabletop battle)

- Plays in our unit-by-unit activation model, not ARW's phased sequence with defensive fire.
- Militia fire as effectively as regulars (no firing-tier modifier); differentiated only by SP.
- Our HILLTOP grants no fire cover and is difficult terrain; entrenchments carry the defensive
  cover on Breeds/Bunker, and Moulton's Hill (British side) is bare.
- WOODS (incl. School Hill) is impassable to the line infantry — terrain to route around.
