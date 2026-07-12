# AEONS

A grand-strategy galaxy simulation that runs itself: economy, trade, politics,
war, faith, and technology unfold year by year while the player watches and
inspects. React + Vite front end; the simulation engine is plain JavaScript.

## Commands

- `npm run dev` — Vite dev server
- `npm run build` — production build (also the quickest full syntax check)
- `npm run sim [-- <seed> <years> [preset]]` — headless run, prints summary stats
  (presets: standard, golden, longdark, bloodiron, freelanes, crowded)
- `npm test` — determinism + sanity tests (node --test, no framework)

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

### The yearly phase pipeline

`sim/simulate.js` runs one year as an ordered list of phases, each a file in
`sim/phases/`. **Phase order is a contract**: later phases read what earlier
ones wrote (e.g. trade fills `s.tradeIn` before politics taxes it). To add a
mechanic, add a phase file and slot it into the order in `simulate.js` —
don't bolt new behavior onto an unrelated phase.

Large phases become directories with a thin orchestrator (see
`phases/politics.js` → `phases/politics/*`).

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

- `npm test` catches nondeterminism and gross breakage.
- For refactors that must not change behavior: capture
  `npm run sim -- 42 500` output before and after and diff it — the engine
  is deterministic, so any diff means behavior changed.
- For balance changes: `npm run sim` across a few seeds/presets and compare
  summaries (extinction rates, war counts, faction lifespans).
