# AWI Hex & Counter Wargame: Living Rules

> A streamlined hex-and-counter wargame for the Horse and Musket era (1700-1860), derived from Neil Thomas' _One-Hour Wargames_ and _Simplicity in Practice_ systems. Designed for digital play as a Progressive Web App.

---

## 1. Design Philosophy

These rules aim to capture the essential character of Horse and Musket warfare in a fast-playing digital format. The period saw the rise of disciplined regular armies, potent linear infantry tactics, the growth of battlefield artillery, and the decisive shock role of cavalry. Games should feel like commanding a small force in a pitched battle of the era: infantry lines trading volleys, cavalry seeking a vulnerable flank, artillery pounding from a distance, and light troops skirmishing in broken ground.

Simplicity is the guiding principle. Each rule should earn its place by creating a meaningful decision for the player. The digital platform handles bookkeeping and resolution, freeing the player to focus on tactics.

---

## 2. The Battlefield

The battlefield is a hex grid, **six columns wide by six rows deep**. The hex grain runs horizontally (flat-topped hexes with vertices pointing up and down). Each hex is equivalent to roughly 6 inches at tabletop scale.

Hexes may contain terrain features that affect movement, combat, and line of sight. Terrain types are defined per scenario, but the standard types are:

- **Open**: No effect. The default terrain.
- **Woods**: Block line of sight. Only Light Infantry may enter. Provide cover.
- **Town**: Block line of sight. Only Infantry and Light Infantry may enter. Provide cover. Units in a town have all-around facing (no flanks or rear). A town hex is a strongpoint, reflecting the fortified urban positions that dominated Horse and Musket battles.
- **Hill**: Elevated terrain. Units on a hill can see and fire over adjacent lower-elevation units or terrain. Do not block LOS for units on the same elevation. Defenders on a hill receive a defensive bonus in charge combat.
- **Marsh/Lake**: Impassable to all units.
- **River**: Impassable except at bridge or ford hexes.
- **Road**: Units moving entirely along a road gain +1 hex to their movement allowance. Road movement bonus cannot be used when charging. A unit using road movement may not move adjacent to an enemy unit during that move.

Only **one unit may occupy a hex** at any time. Units may not move through hexes occupied by other units, with the exception of Light Infantry (see Unit Types).

---

## 3. Unit Types

Each unit occupies a single hex and begins the game with a number of **strength points (SP)** representing its fighting capacity. The default is **4 SP**. A unit is **eliminated** when reduced to 0 SP.

Strength points serve double duty: they represent both a unit's physical capacity to absorb punishment and its cohesion and willingness to fight. As a unit takes hits, it becomes both weaker in combat and more brittle under pressure.

### 3.1 Line Infantry

The backbone of any Horse and Musket army. Close-order foot soldiers armed with muskets and bayonets. They deliver the heaviest volume of fire but are slow and ponderous. Infantry may charge enemy units (but not cavalry). Most battles of the era devolved into grinding firefights between opposing infantry lines, and these rules reflect that reality.

| Attribute         | Value                 |
| ----------------- | --------------------- |
| Movement          | 1 hex                 |
| Facing            | Yes                   |
| Actions           | Move OR Fire          |
| Firing Range      | 2 hexes               |
| Base Hit Chance   | High (65%)            |
| May Charge        | Yes (not vs. Cavalry) |
| Difficult Terrain | Must check            |

### 3.2 Light Infantry

Jaegers, riflemen, irregulars, and skirmishers operating in dispersed formation. Faster and more flexible than line troops, they can operate in woods and move through friendly units. Their open-order formation makes them less effective in a stand-up firefight but gives them superb tactical mobility and a nuisance value out of proportion to their numbers.

| Attribute         | Value                           |
| ----------------- | ------------------------------- |
| Movement          | 1 hex                           |
| Facing            | No (all-around)                 |
| Actions           | Fire AND Move, or Move AND Fire |
| Firing Range      | 2 hexes                         |
| Base Hit Chance   | Moderate (50%)                  |
| May Charge        | No                              |
| Difficult Terrain | No check required               |

Light Infantry ignore facing rules entirely: they may fire and move in any direction. They are the only unit type that may move through a hex occupied by a friendly unit (but may never end their move in an occupied hex). They are the only unit type that may enter Woods hexes.

### 3.3 Dragoons

Mounted infantry who can fight on horseback or dismount to deliver fire. When moving, they are treated as cavalry and may charge. When firing, they are considered to have dismounted and may not move. This dual nature makes them the most versatile unit on the field, though they are master of neither role.

| Attribute         | Value          |
| ----------------- | -------------- |
| Movement          | 2 hexes        |
| Facing            | Yes            |
| Actions           | Move OR Fire   |
| Firing Range      | 2 hexes        |
| Base Hit Chance   | Moderate (50%) |
| May Charge        | Yes            |
| Difficult Terrain | Must check     |

### 3.4 Light Horse

Hussars, irregular cavalry, and light screening horsemen. Fast and maneuverable, they are useful for flanking and pursuit but lack the mass for a truly devastating charge. They do not fire.

| Attribute         | Value      |
| ----------------- | ---------- |
| Movement          | 2 hexes    |
| Facing            | Yes        |
| Actions           | Move only  |
| Firing Range      | None       |
| Base Hit Chance   | N/A        |
| May Charge        | Yes        |
| Difficult Terrain | Must check |

### 3.5 Horse

The heavy battlefield cavalry of the era. Cuirassiers, horse grenadiers, and other close-order horsemen who rely entirely on the shock of the charge. They receive a bonus when charging, representing the terrifying momentum of a wall of heavy cavalry crashing into an enemy line. They do not fire.

| Attribute         | Value            |
| ----------------- | ---------------- |
| Movement          | 2 hexes          |
| Facing            | Yes              |
| Actions           | Move only        |
| Firing Range      | None             |
| Base Hit Chance   | N/A              |
| May Charge        | Yes (with bonus) |
| Difficult Terrain | Must check       |

### 3.6 Artillery

Batteries of field guns and their limbers. Artillery has the longest range on the battlefield but is slow, cumbersome, and vulnerable at close quarters. Gun batteries may not enter Town or Woods hexes. Artillery on a hill may fire over a single adjacent friendly unit or blocking terrain, provided the target is at maximum range (4 hexes), representing plunging fire from an elevated position.

| Attribute         | Value          |
| ----------------- | -------------- |
| Movement          | 1 hex          |
| Facing            | Yes            |
| Actions           | Move OR Fire   |
| Firing Range      | 4 hexes        |
| Base Hit Chance   | Moderate (50%) |
| May Charge        | No             |
| Difficult Terrain | Must check     |

Artillery effectiveness decreases at extreme range: firing at targets 3 or more hexes away reduces the hit chance.

### 3.7 Unit Quality (Optional Scenario Modifier)

Scenarios may adjust individual unit stats to represent historical variation:

- **Strength Points**: Reduce to 3 SP for raw militia or poorly led forces. Increase to 5 SP for elite guards or highly motivated troops.
- **Firing Modifier**: +1 tier for units with superior fire discipline (e.g., platoon firing). -1 tier for units with poor musketry or those that rely on cold steel.
- **Charge Modifier**: +1 for shock troops or hard-charging cavalry. -1 for reluctant or poorly trained units.
- **Morale Modifier**: +1 for elite or veteran units. -1 for green or demoralized troops.

---

## 4. Facing and Orientation

Units with a facing requirement must always **face a hexside** of their hex. This divides the six surrounding hexsides into two zones:

- **Front**: The faced hexside and the two hexsides adjacent to it (a 180° forward arc). Units may only move forward, fire, and advance through their front hexsides.
- **Rear**: The three hexsides on the opposite side of the unit (a 180° rear arc). Units are most vulnerable here. Retreats are made through rear hexsides.

**Changing facing** counts as a movement action:

- A unit that moves may also rotate its facing by **one hexside** (60 degrees) as part of that move.
- A unit that remains stationary may rotate its facing by up to **two hexsides** (120 degrees) as its move action. This still counts as having used the movement action (the unit may not fire that activation if it is a "Move OR Fire" unit).

**Units without facing** (Light Infantry): These units have no front or rear. They may move and fire in any direction.

**Units in Towns**: Gain all-around facing. They have no rear while occupying the town hex. If forced to retreat, they retreat away from the source of the attack.

---

## 5. Sequence of Play

Each game turn consists of two **player turns**, taken in sequence. The first player is determined by the scenario.

During a player turn, the active player activates their units **one at a time**. Each unit must complete all of its actions before the next unit is activated. Each unit may only be activated **once per turn**.

Within a single unit's activation, the sequence is:

1. **Command Check** (if out of command — see Section 8)
2. **Action** (Move, Fire, or both depending on unit type)
3. **Charge Resolution** (if the unit charged, resolve immediately)
4. **Morale Check** (any enemy unit that took hits this activation checks morale — see Section 9)

After all of the first player's units have been activated (or the player has chosen to pass on remaining activations), the second player activates their units following the same procedure.

### 5.1 Activation Order

The active player may activate their units in **any order** they choose. This is a key tactical decision: the order in which you commit your units can determine whether a flank attack lands before the target can reposition, or whether your artillery softens a position before your infantry advances.

---

## 6. Actions

Each unit type has a permitted set of actions, as defined in Section 3. The core action types are:

### 6.1 Move

The unit moves up to its movement allowance in hexes, traveling through its front hexsides. It may change facing by one hexside during the move. A unit that only changes facing (without physically moving to a new hex) has still used its movement action.

**Road Movement**: A unit beginning its activation in a road hex may add +1 hex to its movement if it moves entirely along the road. Road movement may not be used to move adjacent to an enemy unit. Facing requirements are suspended during road movement but must be satisfied when the unit finishes moving.

**Difficult Terrain**: Units in a difficult terrain hex (as defined by scenario) that are subject to terrain checks must pass a check when attempting to leave. On failure, the unit remains in place and its movement action is spent. It may attempt again on its next activation. (Digitally: ~50% chance of being held in difficult terrain.)

**Stacking**: Only one unit per hex. Units may not move through occupied hexes, except Light Infantry moving through friendly units.

### 6.2 Fire

The unit fires at a single eligible target. To be eligible, the target must be:

- Within the firing unit's range.
- Within the firing unit's arc of fire (front three hexsides for units with facing; any hexside for units without facing or units in towns).
- Connected by an unblocked **line of sight** (see Section 7).

When a unit fires, the system resolves whether a hit is scored based on the unit's base hit chance, modified by circumstances:

- **Target in cover** (woods, town, walls, etc.): -15% hit chance
- **Artillery at long range** (3+ hexes): -15% hit chance

A successful hit inflicts **1 SP of damage** to the target. An exceptionally effective volley (roughly a 1-in-6 additional chance on a hit) may inflict **2 SP of damage** instead, representing a particularly devastating round of fire.

### 6.3 Charge

A unit eligible to charge may use its move action to enter a hex adjacent to an enemy unit, initiating close combat. This represents a cavalry charge, an infantry bayonet assault, or dragoons riding into contact.

**Restrictions on charging**:

- Only units marked "May Charge" in their unit type definition may charge.
- Line Infantry may charge, but **not against Cavalry** units (any cavalry type). Infantry would only press home a bayonet charge against a wavering foe, not against horsemen.
- A unit may not charge into a hex it could not normally enter by movement (prohibited terrain). It may charge a defender in a difficult terrain hex.
- Units that are **not eligible to charge may not voluntarily move adjacent to an enemy unit**.

**Charge Resolution** is handled as an opposed contest:

The attacker's score is calculated from a base value plus the attacker's current SP, modified by:

- **Rear attack** (target hit from outside its front hexsides): +1
- **Horse (heavy cavalry) charging**: +1
- **Defender in difficult terrain**: -1

The defender's score is calculated from a base value plus the defender's current SP.

The system compares the two scores and applies results:

| Result                               | Outcome                                                                              |
| ------------------------------------ | ------------------------------------------------------------------------------------ |
| Attacker's score <= Defender's score | Attacker takes 1 hit and retreats 1 hex directly away from the defender.             |
| Attacker exceeds Defender by 1-2     | Defender takes 1 hit and retreats 1 hex (may hold position if in difficult terrain). |
| Attacker exceeds Defender by 3+      | Defender takes 2 hits and must retreat 1 hex (even from difficult terrain).          |

After a charge is resolved, the attacking unit ends its activation. If the attacker was repulsed, it retreats facing the defender. Cavalry that fail to destroy their target always retreat after combat, reflecting the brief and violent nature of Horse and Musket era charges.

---

## 7. Line of Sight

Line of sight (LOS) is traced from the center of the firing unit's hex to the center of the target's hex. LOS is blocked by:

- **Woods hexes** (between firer and target, not including the target's own hex if the target is in woods)
- **Town hexes** (between firer and target)
- **Hill hexes** (if the LOS-blocking hill is between two units at lower elevation)
- **Other units** (friendly or enemy) in hexes between the firer and target

**Exception — Artillery on Hills**: An artillery unit on a hill may fire over a single adjacent friendly unit or terrain feature, provided the target is at the artillery's maximum range (4 hexes). This represents plunging fire from an elevated battery.

**Ambiguous LOS**: If a line of sight passes exactly along the boundary between two hexes (i.e., along a hexside), and one of those hexes blocks LOS while the other does not, the LOS is considered **blocked**. In the digital implementation, this is resolved geometrically with no ambiguity.

---

## 8. Command and Control

Effective command was the cornerstone of Horse and Musket warfare. Armies that lost cohesion — through poor leadership, casualties among officers, or units drifting out of contact — quickly fell apart.

### 8.1 Leaders

Each player receives **1 Leader for every two units** in their force (rounded down, minimum 1). Leaders are not independent units; each Leader is **attached to a unit** and moves with it. A Leader does not occupy its own hex.

Each Leader has a **command radius**, measured in hexes from the Leader's unit. The default command radius is **2 hexes**.

### 8.2 In Command / Out of Command

A unit is **In Command** if it is within the command radius of any friendly Leader. A unit is **Out of Command** if no friendly Leader's command radius reaches it.

**In-Command units** act normally according to all rules.

**Out-of-Command units** must pass a **command check** at the start of their activation before they can act. The check has a base ~50% chance of success, with a -1 penalty (roughly -15%) if the unit is more than double the distance from the nearest Leader's command radius.

- **Pass**: The unit acts normally this activation.
- **Fail**: The unit may only change facing in its current hex. It may not move, fire, or charge.

### 8.3 Leader Casualties

Whenever a unit with an attached Leader takes hits from any source, there is a small chance (~15%) the Leader is killed. If a Leader is killed:

- The Leader is removed from the game.
- A **replacement Leader** is immediately generated and attached to the nearest friendly unit that does not already have a Leader.
- The replacement Leader has a command radius **1 hex smaller** than the Leader who was killed.
- A Leader with a command radius of 0 can only keep its own unit in command.

The progressive degradation of leadership represents the historical reality that replacement officers were rarely as capable as the originals, and the cumulative erosion of command capacity could unravel an army.

---

## 9. Morale

Morale represents a unit's willingness to stand and fight under pressure. Well-led, fresh troops can absorb punishment and hold their ground; battered units far from their commanders may break and flee at the slightest provocation.

### 9.1 When to Check Morale

A morale check is triggered whenever a unit **takes one or more hits** during an enemy unit's activation (from fire or from a charge that inflicts hits on it). The check happens immediately after the hits are applied.

### 9.2 Morale Check Resolution

The morale check compares the unit's accumulated damage against a threshold. The base chance of passing is determined by the unit's **remaining SP relative to its starting SP**. A fresh unit almost always passes; a badly damaged unit is likely to break.

**Modifiers to the morale check**:

- **Elite / Veteran unit** (scenario-designated): +1 to morale (easier to pass)
- **Attacked from the rear** (hit from outside front arc): -1 to morale (harder to pass)
- **Out of Command**: -1 to morale (harder to pass)
- **Unit has a Leader attached**: +1 to morale (easier to pass)

### 9.3 Morale Check Results

- **Pass**: The unit holds its position. No additional effect.
- **Fail**: The unit **retreats 1 hex** through one of its rear hexsides and takes **1 additional hit** (representing stragglers, deserters, and the chaos of a forced withdrawal). This additional hit does not trigger a further morale check.
- **Fail and cannot retreat** (both rear hexes blocked or off-map): The unit takes **1 additional hit** instead of retreating (representing the desperate chaos of a trapped unit). If this reduces the unit to 0 SP, it is eliminated.

---

## 10. Elimination

A unit is **eliminated and removed from the game** when its strength points are reduced to 0. If the eliminated unit had an attached Leader, that Leader is also eliminated (see Section 8.3 for replacement rules — note: a Leader lost through unit elimination is simply removed with no replacement, representing a catastrophic collapse).

---

## 11. Victory Conditions

Victory conditions are defined by the scenario. Common conditions include:

- **Occupy an objective hex** (e.g., a town or hilltop) at the end of a specified turn.
- **Eliminate a number of enemy units** before a turn limit expires.
- **Hold a defensive line** for a set number of turns.
- **Exit units off a map edge** to represent a breakthrough.

Games are played for a set number of turns as specified by the scenario, typically **15 turns** (following the One-Hour Wargames convention).

---

## 12. Terrain Summary Table

| Terrain    | Movement Effect               | Combat Effect             | LOS       | Who May Enter            |
| ---------- | ----------------------------- | ------------------------- | --------- | ------------------------ |
| Open       | None                          | None                      | Clear     | All                      |
| Woods      | Light Infantry only           | Cover (-15% hit chance)   | Blocked   | Light Infantry only      |
| Town       | None                          | Cover; all-around facing  | Blocked   | Infantry, Light Infantry |
| Hill       | None                          | Defender bonus in charges | See rules | All                      |
| Marsh/Lake | Impassable                    | N/A                       | Blocked   | None                     |
| River      | Only at bridge/ford           | None                      | Clear     | All (at crossing)        |
| Road       | +1 hex if entire move on road | None                      | Clear     | All                      |

---

## 13. Unit Summary Table

| Unit Type      | Move | Facing | Actions                | Range | Hit Chance | Charge           | Terrain Check |
| -------------- | ---- | ------ | ---------------------- | ----- | ---------- | ---------------- | ------------- |
| Line Infantry  | 1    | Yes    | Move OR Fire           | 2     | 65%        | Yes (not vs Cav) | Yes           |
| Light Infantry | 1    | No     | Fire+Move or Move+Fire | 2     | 50%        | No               | No            |
| Dragoons       | 2    | Yes    | Move OR Fire           | 2     | 50%        | Yes              | Yes           |
| Light Horse    | 2    | Yes    | Move                   | -     | -          | Yes              | Yes           |
| Horse          | 2    | Yes    | Move                   | -     | -          | Yes (+1)         | Yes           |
| Artillery      | 1    | Yes    | Move OR Fire           | 4     | 50%        | No               | Yes           |

---

## 14. Digital Implementation Notes

These notes are for reference when translating rules to TypeScript. They do not affect gameplay.

- **Randomness**: All probability-based resolution (firing, charges, morale, command checks, difficult terrain, leader casualties) should use a pseudorandom number generator. The percentages given in these rules are target probabilities; the implementation may use any equivalent method (e.g., random float comparison, weighted tables, etc.).
- **Hit Chance Values**: The percentages (65%, 50%, etc.) are approximations of the original D6 systems (3+ on D6 ~ 67%, 4+ ~ 50%). The implementation should use these as baseline values, applied before modifiers.
- **Charge Resolution**: The opposed check can be implemented as: each side generates a random value (e.g., 1-6) and adds their current SP plus modifiers. Compare totals and apply the results table from Section 6.3.
- **LOS Calculation**: Hex-based LOS can be computed using cube coordinates. Trace a line from center to center and check all hexes the line passes through for blocking terrain or units.
- **Activation Tracking**: Each unit has an `activated` flag that resets at the start of each player turn. The UI should clearly indicate which units have yet to act.
- **State Management**: Each unit's state includes: type, current SP, max SP, hex position, facing direction, activated flag, attached leader (if any), and any scenario-specific quality modifiers.
- **Retreat Logic**: When a unit must retreat, the system should automatically determine the best available rear hex. If multiple rear hexes are available, prefer the one that moves the unit away from the attacker and toward friendly units. If no rear hex is available, apply the "cannot retreat" penalty.

---

## 15. Inspirations and Lineage

This ruleset is derived from and inspired by:

- **One-Hour Wargames** by Neil Thomas (Pen and Sword, 2014) — scenario framework, design philosophy, unit types, and the Horse and Musket chapter's period flavor.
- **Simplicity in Practice** by Neil Thomas (Battlegames Magazine, Issue 23, 2010) — core mechanical framework.
- **Simplicity in Hexes** by Jay Ward (2019) — hex adaptation, unit action table, streamlined firing and charge combat systems.
- **ACW 1 Hour Hex Wargame** (community adaptation) — command and control system, morale rules, hex facing conventions.

---

_This is a living document. Rules will be refined as playtesting and digital implementation proceed._
