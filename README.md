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

## How it works

For a high-level visual walkthrough of the engine — genesis, the eight-phase
yearly tick, the shared `world` state, and the feedback loops that keep the
galaxy self-regulating — open [`docs/how-the-simulation-works.html`](docs/how-the-simulation-works.html)
in a browser.

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
      trade.js          shipping, arbitrage, house & megacorp economics
      settlement.js     migration, colonization (corp-sponsored), system death
      politics.js       faction politics, diplomacy, war (incl. holy wars)
      projects.js       megaprojects: gate nexus, arcology, terraforming
      shocks.js         plagues, ore strikes, flares, gate shifts, culture drift
      faith.js          creeds spreading along trade lanes, schisms
      chronicle.js      yearly statistics snapshot and era detection
    stats.js            statistics export (JSON summary)
  ui/                   React presentation layer
    theme.js            event styling, overlay palettes, chart colors
    widgets.jsx         Btn, Bar, Spark
    format.js           number formatting (population, money)
    charts.jsx          small-multiple time-series chart (hover, era bands)
    download.js         browser file download helper
    MapView.jsx         canvas renderer: territory regions, faction labels,
                        convoys, battle fx, wonder markers, faith overlay,
                        event pulses, hover cards, pan/zoom/fly-to camera
    Ticker.jsx          rotating headline strip over the map
    Timeline.jsx        history scrubber under the map (pop, eras, wars)
    TopBar.jsx          clock controls and exports
    StatsStrip.jsx      galaxy-wide counters
    panels/             side-panel tabs: System, Powers, Trade, Galaxy, Chronicle
scripts/
  run-sim.js            headless CLI runner (npm run sim)
```

The split is deliberate: everything under `src/sim/` mutates a single plain
`world` object and never touches the DOM, so new mechanics (a new phase, a
new shock, a new stat) slot in without touching the UI — and the whole
engine can be exercised from the command line or tests.
