// Test helpers for focused, single-phase tests — NOT a test file itself
// (npm test globs *.test.js, so this is only ever imported).
//
// Building a valid world by hand is fiddly: a System carries ~40 fields and a
// World a dozen sub-structures (stats counters, credit state, records…). To
// avoid that template drifting from galaxy.js, we borrow a REAL world's
// scaffolding via genGalaxy and swap in handcrafted systems/factions/houses.
// The result is a tiny, fully-formed world whose outcomes we can predict.
import { GOODS, BASE_PRICE, RECIPES, CLASSES } from "../src/sim/constants.js";
import { startMix } from "../src/sim/society.js";
import { genGalaxy, rebuildAdj } from "../src/sim/index.js";
import { dist2 } from "../src/sim/util.js";

// a fully-populated System, galaxy.js's template, with `overrides` merged last
export function makeSystem(id, overrides = {}) {
  const s = {
    id, name: overrides.name ?? `Sys${id}`,
    x: overrides.x ?? id * 50, y: overrides.y ?? 0,
    cult: [0.5, 0.5, 0.5], cultName: "Test",
    fert: 0.5, min: 0.5, minRes: 1000, minRes0: 1000,
    rare: 0.2, en: 0.5, enRes: 5000, enRes0: 5000, hab: 0.5,
    pop: 10, dev: 0.6, wealth: 50,
    stock: Object.fromEntries(GOODS.map((g) => [g, 0])),
    price: { ...BASE_PRICE },
    shares: Object.fromEntries(GOODS.map((g) => [g, 1 / GOODS.length])),
    mfgEff: Object.fromEntries(Object.keys(RECIPES).map((m) => [m, 1])),
    classes: startMix(),
    classWb: Object.fromEntries(CLASSES.map((c) => [c, 0.7])),
    wbEma: 0.7,
    unrest: 0, riotCd: 0, wb: 0.7, fid: null, ruined: false, diedYear: null,
    famineCd: 0, tradeIn: 0, tradeOut: 0,
    settledYear: 0, peakPop: 10, lastFamine: -99, lastPlague: -99, lastWar: -99,
    siege: null, flow: Object.fromEntries(GOODS.map((g) => [g, 0])), trace: [],
    infra: { gran: 0, gate: 0, mine: 0 },
    faith: 0, mega: {}, depots: [], sponsor: null, freePort: false,
    slaves: 0, drugs: 0, drugLoad: 0, outlaw: false,
  };
  // shallow-merge, but deep-merge the keyed sub-objects a test commonly tweaks
  const { stock, price, shares, classes, classWb, infra, mega, ...rest } = overrides;
  Object.assign(s, rest);
  if (stock) Object.assign(s.stock, stock);
  if (price) Object.assign(s.price, price);
  if (shares) Object.assign(s.shares, shares);
  if (classes) Object.assign(s.classes, classes);
  if (classWb) Object.assign(s.classWb, classWb);
  if (infra) Object.assign(s.infra, infra);
  if (mega) Object.assign(s.mega, mega);
  return s;
}

export function makeFaction(id, overrides = {}) {
  return {
    id, name: overrides.name ?? `Power${id}`, color: "#888",
    gov: "empire", capital: overrides.capital ?? 0,
    aggr: 0.5, expans: 0.5, treasury: 100, stability: 0.8,
    tariff: 0.1, dead: false, foundedYear: 0, diedYear: null,
    peakSystems: 1, peakPop: 10, trace: [],
    ...overrides,
  };
}

export function makeHouse(id, overrides = {}) {
  return {
    id, name: overrides.name ?? `House${id}`, home: overrides.home ?? 0,
    wealth: 100, ships: 20, dead: false, foundedYear: 0, diedYear: null,
    peakWealth: 100, corp: false, corpYear: null, stateId: null,
    depots: [], sponsored: [], feud: null, absorbedBy: null,
    income: 0, incFreight: 0, incDepots: 0, incColonies: 0, trace: [],
    ...overrides,
  };
}

// undirected jumpgate between two systems
export function makeEdge(a, b, systems) {
  return { a, b, d: dist2(systems[a], systems[b]), vol: 0, net: 0 };
}

// A minimal world carrying genGalaxy's real scaffolding but our own systems,
// factions, houses and edges. `rng` defaults to a fresh seeded generator; pass
// `fixedRng(...)` to force or suppress rng-gated events deterministically.
export function makeWorld({ systems, factions = [], houses = [], edges = [], cfg = {}, year = 1, rng } = {}) {
  const w = genGalaxy(1, cfg); // borrow all the sub-structures, then override
  w.year = year;
  w.systems = systems;
  w.edges = edges;
  w.factions = factions;
  w.houses = houses;
  w.nextFid = factions.length;
  w.relations = {};
  w.loans = [];
  w.projects = [];
  w.cartels = []; w.cartelMul = {};
  w.credit = { crunch: 0, defaults: [], panics: 0, lastPanic: -99 };
  w.events = []; w.eventSeq = 0; w.eventAgg = []; w.fx = []; w.fxSeq = 0;
  // keep the counter KEYS (so a phase's `c.foo++` never hits undefined) but zero them
  for (const k of Object.keys(w.stats.c)) w.stats.c[k] = 0;
  w.stats.seeded = 0; w.stats.series = []; w.stats.deaths = [];
  w.stats.factionDeaths = []; w.stats.wars = [];
  rebuildAdj(w);
  if (rng) w.rng = rng;
  return w;
}

// a constant-output rng: fixedRng(0) makes every `chance(p>0)` fire (force
// events); fixedRng(0.9999) makes every `chance(p<1)` miss (suppress events).
export function fixedRng(v = 0) {
  const f = () => v;
  return {
    n: f,
    range: (a, b) => a + (b - a) * v,
    int: (a, b) => Math.floor(a + (b - a + 1) * v),
    pick: (arr) => arr[Math.min(arr.length - 1, Math.floor(v * arr.length))],
    chance: (p) => v < p,
    gauss: () => (v * 3 - 1.5) / 1.5,
  };
}

export const alive = (w) => w.systems.filter((s) => s.pop > 0.05);
