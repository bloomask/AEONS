# AEONS — Product Contract: The Interaction Model

**Status: locked.** This page decides, once, how the player relates to the
simulation. Every feature proposal is measured against it.

## The decision

AEONS supports **two modes, one product**: **Observe** and **Curate**. The
product is the autonomous galaxy — a grand-strategy simulation that runs
itself. The player is never a participant inside it; they are either its
audience or its unseen hand.

### Observe (default)

The galaxy simulates economy, trade, politics, war, faith, and technology
year by year with **zero player input**. Everything the player touches is
read-only: the map, the panels, the chronicle, the derived views
(diagnose/classify/explain). Observe is not a stripped-down mode — it is the
baseline product, and it must remain complete and compelling on its own.
Nothing in Curate may make Observe worse, slower, or less deterministic.

### Curate

Curate adds a small set of **lightweight, bounded interventions** — the
curator's instruments (`src/sim/interventions.js`). The contract for every
instrument:

- **Grounded**: it presses on a mechanic the engine already has (relief works
  like stockpiles, discord works like rivalry, a curator gate works like gate
  flux). No instrument introduces a parallel rule system.
- **Bounded**: one act, one dose, applied once. The engine — not the hand —
  decides all consequences.
- **Transparent**: before applying, the UI shows the **target** and the
  **anticipated pressure** (a read-only preview). **Destructive acts require
  explicit confirmation.**
- **Accountable**: every act writes a **chronicle entry** (in-world prose) and
  appends a **deterministic command record** to `w.commands`
  (`{i, year, key, params}`).
- **Deterministic**: instruments never touch `w.rng`. Same save + same
  commands at the same years ⇒ the same history, byte for byte. Observe runs
  are untouched by the feature's existence.

The v1 instruments: relief shipment · sponsor a colony · fund infrastructure ·
endow a megaproject · broker peace · sow discord · quiet the streets ·
inflame the streets · open a jumpgate · collapse a jumpgate · loose a plague.

## Explicitly out of scope

These are rejected, not deferred — they change what the product is:

- **No trading fleets.** The player never owns ships, routes, or cargo;
  houses and tramp freighters do the hauling.
- **No detailed corporate management.** No playable merchant house, no
  boardroom, no balance sheets to run (the earlier tycoon layer was removed
  deliberately).
- **No 4X empire control.** The player never owns a faction: no unit orders,
  no build queues, no research trees, no colonization clicks, no diplomacy
  menus issued *as* a power.
- **No raw state editing.** The curator acts only through the published
  instruments — never by setting a number directly.

## Naming

The simulation's political actors are **factions** everywhere in the UI
(tab, vitals, panel headings). The former "Powers" tab is renamed **Factions**
so the word "power" is never ambiguous between *simulated states* and
*player powers* (the curator's instruments).

## Acceptance criteria

1. Observe mode replays byte-identically for a given seed and config.
2. Every intervention shows target + anticipated pressure before applying;
   destructive ones confirm; all are chronicled and recorded in `w.commands`.
3. Automated tests apply every instrument and run `checkInvariants`
   immediately after each application (`tests/interventions.test.js`).
4. A curated game saves/loads with its command ledger intact.
