# AEONS

A grand-strategy galaxy simulation that runs itself: economy, trade, politics,
war, faith, and technology unfold year by year while the player watches and
inspects. React + Vite front end; the simulation engine is plain JavaScript.

## Commands

- `npm run dev` — Vite dev server
- `npm run build` — production build (also the quickest full syntax check)
- `npm run sim [-- <seed> <years> [preset]]` — headless run, prints summary stats
  (presets: standard, golden, longdark, bloodiron, freelanes, crowded)
- `npm run balance [-- <years> [seeds] [preset]]` — the balance laboratory: runs
  a seed matrix across every preset and grades the results against the targets in
  `sim/balance.js` (exit non-zero if a hard guard-rail fails)
- `npm test` — determinism, invariants, focused phase, and balance tests
  (node --test, no framework)

## Architecture

Two worlds, one boundary:

- **`src/sim/`** — the engine. Plain, DOM-free JS; runs in Node and the
  browser alike (that's what makes `npm run sim` and the tests possible).
  Never import React, the DOM, or anything from `src/ui/` here.
  Its public surface is `src/sim/index.js`.
- **`src/ui/`** — React components. They read the world object directly and
  render it; they never mutate it (the sole exception is the sim loop in
  `GalaxySim.jsx` calling `simulateYear`).

### The world object `w`

One big mutable object holds the entire simulation state. It is created in
`sim/galaxy.js` (`genGalaxy`) and mutated in place by every phase. **The field
reference lives in `src/sim/types.js`** (JSDoc typedefs for World, System,
Faction, House, …) — read that before adding or renaming fields, and keep it
updated when you do.

### System composition (stars & worlds)

`sim/cosmos.js` gives every system a `star` (spectral class) and `bodies` (its
planets/belts) at genesis. This is **descriptive worldbuilding**: the star and
worlds are generated to be *consistent with* each system's endowments
(`fert`/`min`/`en`/`hab`) — a lush, liveable world gets a warm star and a green
homeworld; an energy-rich one gets gas giants. Crucially it draws from a
**per-system sub-rng** (seeded off `(seed, id)`), NOT `w.rng`, so it is
deterministic yet never perturbs the simulation's history. It does not (yet)
*drive* the endowments — that inversion is a safe future step (the balance lab
guards it). `describeComposition`/`primaryBody` are pure helpers for the UI.

The same "descriptive layer from a sub-rng" pattern powers **notable figures**
(`phases/figures.js`): every faction gets a named `ruler` with a title, reign,
and natural succession, drawn from a per-faction sub-rng and logged without a
stats counter — so it adds character (and the odd `reign` chronicle line) while
leaving the simulation's numbers byte-identical. Anything descriptive that must
not perturb history should follow this pattern.

### The tycoon layer (`src/game/`)

A megacorp tycoon game sits on top of the engine (design: `docs/design/TYCOON.md`).
Boundary rule: **`src/game/` may read `src/sim/`; `src/sim/` never imports
`src/game/`.** Time runs on **two clocks** — the sim stays yearly and
deterministic (authoritative keyframes), while the player lives at day resolution
interpolating toward the next computed year (`game/clock.js`). The player is a
price-taker at first (macro-sim byte-identical), becoming a price-maker through
the `clock.onAdvance` → `capital.flushMacro` hook (lending, investment,
statecraft mutate the world). A game is `seed + config + action-log`, so it
saves/replays exactly (`game/save.js`). The one sim-side concession is the
`f.player` flag (types.js), which only exists during a game — headless runs are
unchanged. UI: `src/ui/tycoon/`.

### The yearly phase pipeline

`sim/simulate.js` runs one year as an ordered list of phases, each a file in
`sim/phases/`. **Phase order is a contract**: later phases read what earlier
ones wrote (e.g. trade fills `s.tradeIn` before politics taxes it). To add a
mechanic, add a phase file and slot it into the order in `simulate.js` —
don't bolt new behavior onto an unrelated phase.

Large phases become directories with a thin orchestrator (see
`phases/politics.js` → `phases/politics/*`).

### Commodities & contraband

Two tiers of tradable goods:

- **`GOODS`** (constants.js) are the ordinary commodities — grain, ores,
  fuel, manufactures, and **weapons**. They flow through the whole engine
  automatically: produced/priced in `economy.js`, arbitraged across lanes in
  `trade.js`, shown in every market view. Adding one means touching
  `GOODS`/`BASE_PRICE`/`FREIGHT_COST` (+ `RECIPES`/`MFG_YIELD` if
  manufactured) and it appears everywhere. Weapons also gate combat: a
  world fights at `ARMS_FLOOR..1` of its weight by how stocked its armory
  is (`war.js`), and battles burn arms.
- **`CONTRABAND`** (`drugs`, `slaves`) are *not* in `GOODS` — they never ride
  the ordinary loops. They live in dedicated system fields (`s.drugs`,
  `s.slaves`, `s.drugLoad`) and are handled by `phases/contraband.js`, which
  enforces legality (`GOV_CONTRABAND` + a free world's `outlaw` flag; use
  `allowsDrugs`/`allowsSlaves`), smuggling, and effects. Slaves are a
  population/commodity hybrid: they supply labor, can revolt, and are freed
  into the worker class wherever slavery is unlawful. **Invariant: no
  republic or corporate world ever holds slaves** (the test enforces it).

### Derived read-only views

Some files read the world and describe it without ever mutating it — pure
functions the UI (and headless tools) can call every frame:

- `sim/diagnose.js` (`diagnoseSystem`) — what's *wrong* with a world (its
  crises/warnings), against the same thresholds the engine uses.
- `sim/classify.js` (`classifySystem`, `systemTags`) — what *kind* of place a
  world is: its single dominant archetype (Breadbasket, Trade Hub, Pleasure
  World, Forge World…) plus stackable secondary tags (Capital, Free Port,
  Besieged…). Every living world classifies to exactly one primary archetype.
- `sim/explain.js` (`explainScarcity`, `warCause`, `dearestStaple`) — *why*
  something happened: the chain of reasons a staple turned dear, or the
  flashpoint that ignited a war (`warCause` is also called once at declaration
  in `diplomacy.js` to record the cause on the war — a pure annotation).
- `ui/describe.js` (`describeSystem`) — a prose gazetteer lede.

Keep these pure (no rng, no mutation): they run in render.

### UI layout

`GalaxySim.jsx` owns app state and the sim clock. The canvas map lives in
`ui/MapView.jsx` with its heavy parts split into `ui/map/` (territory
rasterizer, scene renderer, event-pulse collection, legends/tooltip).
Full-screen and side panels live in `ui/panels/`.

## Conventions & invariants

- **Determinism is sacred.** All randomness inside the sim goes through
  `w.rng` (seeded mulberry32). Never call `Math.random()` or `Date.now()` in
  `src/sim/` — same seed + config must replay the same history. Careful when
  reordering code within a phase: changing the *order* of rng calls changes
  history (fine when intended, but do it knowingly — the tests only catch
  nondeterminism, not reordering).
- **"Alive" means `s.pop > 0.05`.** That threshold is used everywhere a
  system is checked for life; keep it consistent.
- Events go through `log(w, type, text, sysId?)` and short-lived map effects
  through `fx(w, payload)` (both in `sim/events.js`). Don't push to
  `w.events` directly. Increment the matching counter in `w.stats.c` when an
  event is statistically interesting.
- Pairwise faction state (rivalry, war, embargo) lives in `w.relations`
  keyed by `relKey(a, b)`; always use `getRel(w, a, b)`.
- Tunable balance constants live in `sim/constants.js` (`T` for scalar
  knobs). Player-facing config knobs live in `sim/config.js` and arrive as
  `w.cfg.*` multipliers — a new mechanic that should be tunable gets a
  config param, not a hardcoded constant.
- The chronicle's prose style is part of the product: event text is written
  as in-world history ("The siege of X is broken…"), not debug logs.

## Verifying changes

- `npm test` catches nondeterminism and gross breakage. It runs four suites:
  - **determinism + sanity** (`sim.test.js`) — same seed replays; a coherent
    galaxy after centuries.
  - **invariants** (`invariants.test.js`) — steps the year phase-by-phase (via
    `simulateYear`'s `onPhase` hook) and asserts `checkInvariants` (`sim/invariants.js`)
    finds nothing broken after *every* phase, across seeds and presets. This is
    what pins a bug (a NaN, a ghost slave on a ruin, a dead-faction flag) to the
    phase that caused it. Slavery legality is reconciled by the `contraband`
    phase, so it's only asserted from there on (`{settled:false}` before it).
  - **focused phase tests** (`phases.test.js` + `helpers.js`) — small handcrafted
    worlds with predictable outcomes, one phase at a time. `helpers.js` builds a
    tiny world on top of `genGalaxy`'s scaffolding and offers `fixedRng(v)` to
    force/suppress rng-gated events. Add one here when you touch a phase's logic.
  - **balance guard-rails** (`balance.test.js`) — a fast subset of the lab.
- For refactors that must not change behavior: capture
  `npm run sim -- 42 500` output before and after and diff it — the engine
  is deterministic, so any diff means behavior changed.
- For balance changes: run `npm run balance` — it grades a seed matrix across
  every preset against the ranges in `sim/balance.js` and prints per-preset
  tables. The targets encode the *current intended* balance; when a change moves
  the balance on purpose, re-read the tables and update the targets to match.
  Phase read/mutate/create contracts are documented in `docs/PHASES.md`.
