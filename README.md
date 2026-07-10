# AEONS

A self-regulating galaxy simulator. 1 tick = 1 year, and nothing is scripted:
systems starve, mines run dry, merchant houses go bankrupt, empires
overextend and collapse — and the galaxy writes its own chronicle as it
happens.

## Running

```sh
npm install
npm run dev       # dev server
npm run build     # production build to dist/
npm run preview   # serve the production build
```

The simulation engine is DOM-free and also runs headless in Node:

```sh
npm run sim                 # seed 42, 500 years, prints summary stats
npm run sim -- 12345 2000   # custom seed and year count
```

Simulations are deterministic per seed: the same seed always produces the
same history.

## Project structure

```
src/
  main.jsx              entry point
  GalaxySim.jsx         top-level component: state, sim clock, layout
  sim/                  simulation engine (pure JS, no DOM — runs in Node too)
    index.js            public surface of the engine
    constants.js        tuning table and static data (goods, cultures, colors)
    rng.js              seeded RNG (mulberry32)
    util.js             clamp, distances, culture math
    names.js            procedural system/house names
    events.js           chronicle log + inter-faction relations
    galaxy.js           world generation (systems, jumpgates, seeding)
    factions.js         faction lifecycle: founding, capital moves, collapse
    houses.js           merchant house founding
    simulate.js         simulateYear — runs the phases in order
    phases/
      economy.js        production, consumption, prices, demography
      trade.js          shipping allocation, arbitrage, house economics
      settlement.js     migration, colonization, infrastructure, system death
      politics.js       faction politics, diplomacy, war, new powers
      shocks.js         plagues, ore strikes, flares, gate shifts, culture drift
      chronicle.js      yearly statistics snapshot and era detection
    stats.js            statistics export (JSON summary)
  ui/                   React presentation layer
    theme.js            event styling, overlay palettes
    widgets.jsx         Btn, Bar, Spark
    download.js         browser file download helper
    MapView.jsx         canvas renderer, pan/zoom/selection, overlays
    TopBar.jsx          clock controls and exports
    StatsStrip.jsx      galaxy-wide counters
    panels/             side-panel tabs: System, Powers, Trade, Chronicle
scripts/
  run-sim.js            headless CLI runner (npm run sim)
```

The split is deliberate: everything under `src/sim/` mutates a single plain
`world` object and never touches the DOM, so new mechanics (a new phase, a
new shock, a new stat) slot in without touching the UI — and the whole
engine can be exercised from the command line or tests.
