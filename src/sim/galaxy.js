import { T, GOODS, BASE_PRICE, RECIPES, CULTURES, FAITH_COLORS, CLASSES } from "./constants.js";
import { defaultConfig } from "./config.js";
import { startMix } from "./society.js";
import { makeRng } from "./rng.js";
import { clamp, dist2 } from "./util.js";
import { genName } from "./names.js";
import { log } from "./events.js";
import { foundFaction } from "./factions.js";
import { foundHouse } from "./houses.js";
import { genComposition } from "./cosmos.js";

// ---------- world generation ----------
export function genGalaxy(seed, cfgIn) {
  const cfg = { ...defaultConfig(), ...(cfgIn || {}) };
  const rng = makeRng(seed);
  // the map scales with system count to keep the same stellar density
  const nSys = Math.round(cfg.systems);
  const R = clamp(T.GALAXY_R * Math.sqrt(nSys / 96), 260, 620);
  const nSeeded = Math.max(4, Math.round(nSys * (cfg.settled / 100)));
  const nFactions = Math.min(Math.round(cfg.factions), nSeeded);
  const w = {
    seed, cfg, year: 0, systems: [], edges: [], factions: [],
    events: [], relations: {}, nextFid: 0, warCount: 0,
    era: { name: "The Age of Foundation", since: 0 },
    eras: [{ name: "The Age of Foundation", since: 0 }],
    faiths: [], projects: [], fx: [], fxSeq: 0,
    peaceYears: 0, popPeak100: 0,
    tech: { level: 0, progress: 0, history: [] },
    cartels: [], cartelMul: {},
    loans: [], credit: { crunch: 0, defaults: [], panics: 0, lastPanic: -99 },
    // deterministic ledger of curator interventions (interventions.js) —
    // replaying the same save with the same records replays the same history
    commands: [],
    records: { longestWar: 0, largestRealm: 7, worstFamine: 4, richestHouse: 250 },
    houses: [],
    stats: {
      seeded: 0, series: [], deaths: [], factionDeaths: [], wars: [],
      c: {
        famine: 0, plague: 0, flare: 0, strike: 0, colony: 0, resettle: 0,
        secede: 0, annex: 0, cede: 0, gateOpen: 0, gateClose: 0,
        warsDeclared: 0, factionsFounded: 0,
        battle: 0, siegeFall: 0, siegeLift: 0,
        houseFounded: 0, houseBankrupt: 0, embargo: 0, build: 0,
        conversion: 0, schism: 0,
        megaStarted: 0, megaBuilt: 0, megaAbandoned: 0,
        corpFounded: 0, depotBuilt: 0, colonySponsored: 0,
        pirateHavens: 0, raids: 0, suppressions: 0, pirateScatters: 0,
        charterStates: 0, revolution: 0, freePorts: 0, riot: 0,
        breakthrough: 0, cartelFormed: 0, cartelBroken: 0,
        feudStarted: 0, takeover: 0,
        loanMade: 0, loanDefault: 0, panic: 0,
        enslaved: 0, slavesFreed: 0, slaveRevolt: 0, slaveTrade: 0,
        drugBust: 0, drugTrade: 0,
        curated: 0,
      },
    },
  };

  // four founding faiths, rooted in the old cultures
  for (let i = 0; i < 4; i++) {
    const cult = CULTURES[i];
    const root = genName(rng, cult).split(" ")[0];
    w.faiths.push({
      id: i,
      name: rng.pick([
        `The Way of ${root}`, `The ${root} Creed`, `${root}ism`,
        `The Church of ${root}`, `The ${root} Path`,
      ]),
      color: FAITH_COLORS[i],
      founded: 0,
    });
  }

  // cluster centers, each with a base culture and a dominant faith
  const centers = [];
  const nCenters = clamp(Math.round(6 * nSys / 96), 4, 10);
  for (let i = 0; i < nCenters; i++) {
    const r = Math.sqrt(rng.n()) * R * 0.75;
    const a = rng.n() * Math.PI * 2;
    centers.push({
      x: Math.cos(a) * r, y: Math.sin(a) * r,
      cult: CULTURES[i % CULTURES.length],
      faith: i % 4,
    });
  }

  // systems
  const usedNames = new Set();
  for (let i = 0; i < nSys; i++) {
    const c = rng.pick(centers);
    const x = clamp(c.x + rng.gauss() * 150, -R, R);
    const y = clamp(c.y + rng.gauss() * 150, -R, R);
    let name = genName(rng, c.cult);
    while (usedNames.has(name)) name = genName(rng, c.cult);
    usedNames.add(name);
    const minRes = rng.range(250, 2600) * cfg.richness;
    const enRes = rng.range(1800, 9000) * cfg.richness;
    w.systems.push({
      id: i, name, x, y,
      cult: c.cult.vec.map((v) => clamp(v + rng.range(-0.15, 0.15), 0, 1)),
      cultName: c.cult.name,
      fert: Math.pow(rng.n(), 1.25),
      min: rng.n(), minRes, minRes0: minRes,
      rare: Math.pow(rng.n(), 2.2), // rare-earth veins: most worlds have scraps, a few are motherlodes
      en: rng.n(), enRes, enRes0: enRes,
      hab: rng.n(),
      pop: 0, dev: 0.6, wealth: 0,
      stock: Object.fromEntries(GOODS.map((g) => [g, 0])),
      price: { ...BASE_PRICE },
      shares: Object.fromEntries(GOODS.map((g) => [g, 1 / GOODS.length])),
      mfgEff: Object.fromEntries(Object.keys(RECIPES).map((m) => [m, 1])),
      classes: startMix(),
      classWb: Object.fromEntries(CLASSES.map((c) => [c, 0.7])),
      wbEma: 0.7, // smoothed worker wellbeing driving labor allocation (breaks the grain cobweb)
      unrest: 0, riotCd: 0,
      wb: 0.7, fid: null, ruined: false, diedYear: null,
      famineCd: 0, tradeIn: 0, tradeOut: 0, history: [],
      settledYear: null, peakPop: 0, lastFamine: -99, lastPlague: -99, lastWar: -99,
      siege: null, flow: Object.fromEntries(GOODS.map((g) => [g, 0])), trace: [],
      infra: { gran: 0, gate: 0, mine: 0 },
      faith: c.faith, mega: {}, depots: [], sponsor: null, freePort: false,
      // contraband: enslaved population held here, narcotics stock, and an
      // addicted-underclass load. `outlaw` free worlds tolerate both trades.
      slaves: 0, drugs: 0, drugLoad: 0, outlaw: false,
    });
  }

  // frontier boomtowns — rich in rare-earth veins, thin on law — grow
  // tolerant of the vice and slave trades if they slip a government's grasp
  for (const s of w.systems) s.outlaw = s.rare > 0.6;

  // physical composition: a star and worlds consistent with each system's
  // endowments. Drawn from a per-system sub-rng seeded off (seed, id), so it is
  // deterministic yet never touches w.rng — the simulation's history is unchanged.
  for (const s of w.systems) {
    const c = genComposition(seed, s);
    s.star = c.star; s.bodies = c.bodies;
  }

  // jumpgates: 2 nearest neighbors each, then force connectivity
  const addEdge = (a, b) => {
    if (a === b) return;
    if (w.edges.some((e) => (e.a === a && e.b === b) || (e.a === b && e.b === a))) return;
    w.edges.push({ a, b, d: dist2(w.systems[a], w.systems[b]), vol: 0, net: 0 });
  };
  for (const s of w.systems) {
    const near = w.systems
      .filter((o) => o.id !== s.id)
      .sort((p, q) => dist2(s, p) - dist2(s, q))
      .slice(0, 2);
    near.forEach((o) => addEdge(s.id, o.id));
  }
  // union-find connectivity
  const parent = w.systems.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const union = (a, b) => { parent[find(a)] = find(b); };
  w.edges.forEach((e) => union(e.a, e.b));
  let guard = 0;
  while (guard++ < 200) {
    const roots = new Set(w.systems.map((s) => find(s.id)));
    if (roots.size === 1) break;
    const [r1] = roots;
    let best = null;
    for (const s of w.systems) for (const o of w.systems) {
      if (find(s.id) === r1 && find(o.id) !== r1) {
        const d = dist2(s, o);
        if (!best || d < best.d) best = { a: s.id, b: o.id, d };
      }
    }
    if (!best) break;
    addEdge(best.a, best.b); union(best.a, best.b);
  }
  // a few long trade lanes
  for (let i = 0; i < Math.max(2, Math.round(4 * nSys / 96)); i++) {
    const a = rng.int(0, nSys - 1), b = rng.int(0, nSys - 1);
    if (a !== b && dist2(w.systems[a], w.systems[b]) < 380) addEdge(a, b);
  }
  rebuildAdj(w);

  // seed populations on the most livable worlds
  const ranked = [...w.systems].sort(
    (a, b) => b.hab * 0.6 + b.fert * 0.4 - (a.hab * 0.6 + a.fert * 0.4)
  );
  ranked.slice(0, nSeeded).forEach((s) => {
    s.pop = rng.range(2, 24);
    s.settledYear = 0; s.peakPop = s.pop; w.stats.seeded++;
    s.wealth = rng.range(20, 90);
    s.stock.grain = s.pop * 3; s.stock.consumer = s.pop;
    s.stock.metals = s.pop * 0.5; s.stock.fuel = s.pop * 0.5;
    s.stock.medicine = s.pop * 0.1;
  });

  // founding factions on well-spaced high-pop capitals; spacing relaxes
  // when many powers must fit a small or crowded galaxy
  const spacing = clamp(130 * Math.sqrt((nSys / 96) * (12 / Math.max(1, nFactions))), 60, 160);
  const caps = [];
  for (const s of ranked.slice(0, nSeeded).sort((a, b) => b.pop - a.pop)) {
    if (caps.every((c) => dist2(c, s) > spacing)) caps.push(s);
    if (caps.length >= nFactions) break;
  }
  caps.forEach((cap) => foundFaction(w, rng, cap, true));

  // the best-connected unclaimed worlds declare perpetual neutrality:
  // free ports, where anyone may dock and no flag may fly
  [...w.systems]
    .filter((s) => s.pop > 0 && s.fid === null)
    .sort((a, b) => w.adj[b.id].length - w.adj[a.id].length)
    .slice(0, 3)
    .forEach((s) => {
      s.freePort = true;
      w.stats.c.freePorts++;
      log(w, "found", `${s.name} declares itself a Free Port: no duties, no navy, no master.`, s.id);
    });

  [...w.systems].filter((s) => s.pop > 0).sort((a, b) => b.pop - a.pop)
    .slice(0, Math.round(cfg.houses))
    .forEach((s) => foundHouse(w, rng, s, T.START_SHIPS, 80));

  log(w, "era", `The Age of Foundation begins. ${caps.length} powers rise among ${nSys} known systems.`);
  w.rng = rng;
  return w;
}

export function rebuildAdj(w) {
  w.adj = w.systems.map(() => []);
  w.edges.forEach((e, i) => {
    w.adj[e.a].push({ to: e.b, e: i });
    w.adj[e.b].push({ to: e.a, e: i });
  });
}
