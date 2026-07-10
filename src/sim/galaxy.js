import { T, BASE_PRICE, CULTURES } from "./constants.js";
import { makeRng } from "./rng.js";
import { clamp, dist2 } from "./util.js";
import { genName } from "./names.js";
import { log } from "./events.js";
import { foundFaction } from "./factions.js";
import { foundHouse } from "./houses.js";

// ---------- world generation ----------
export function genGalaxy(seed) {
  const rng = makeRng(seed);
  const w = {
    seed, year: 0, systems: [], edges: [], factions: [],
    events: [], relations: {}, nextFid: 0, warCount: 0,
    era: { name: "The Age of Foundation", since: 0 },
    peaceYears: 0, popPeak100: 0,
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
      },
    },
  };

  // cluster centers, each with a base culture
  const centers = [];
  for (let i = 0; i < 6; i++) {
    const r = Math.sqrt(rng.n()) * T.GALAXY_R * 0.75;
    const a = rng.n() * Math.PI * 2;
    centers.push({
      x: Math.cos(a) * r, y: Math.sin(a) * r,
      cult: CULTURES[i % CULTURES.length],
    });
  }

  // systems
  const usedNames = new Set();
  for (let i = 0; i < T.N_SYSTEMS; i++) {
    const c = rng.pick(centers);
    const x = clamp(c.x + rng.gauss() * 150, -T.GALAXY_R, T.GALAXY_R);
    const y = clamp(c.y + rng.gauss() * 150, -T.GALAXY_R, T.GALAXY_R);
    let name = genName(rng, c.cult);
    while (usedNames.has(name)) name = genName(rng, c.cult);
    usedNames.add(name);
    const minRes = rng.range(250, 2600);
    const enRes = rng.range(1800, 9000);
    w.systems.push({
      id: i, name, x, y,
      cult: c.cult.vec.map((v) => clamp(v + rng.range(-0.15, 0.15), 0, 1)),
      cultName: c.cult.name,
      fert: Math.pow(rng.n(), 1.25),
      min: rng.n(), minRes, minRes0: minRes,
      en: rng.n(), enRes, enRes0: enRes,
      hab: rng.n(),
      pop: 0, dev: 0.6, wealth: 0,
      stock: { food: 0, ore: 0, fuel: 0, goods: 0 },
      price: { ...BASE_PRICE },
      shares: { food: 0.25, ore: 0.25, fuel: 0.25, goods: 0.25 },
      wb: 0.7, fid: null, ruined: false, diedYear: null,
      famineCd: 0, tradeIn: 0, tradeOut: 0, history: [],
      settledYear: null, peakPop: 0, lastFamine: -99, lastPlague: -99, lastWar: -99,
      siege: null, flow: { food: 0, ore: 0, fuel: 0, goods: 0 }, trace: [],
      infra: { gran: 0, gate: 0, mine: 0 },
    });
  }

  // jumpgates: 2 nearest neighbors each, then force connectivity
  const addEdge = (a, b) => {
    if (a === b) return;
    if (w.edges.some((e) => (e.a === a && e.b === b) || (e.a === b && e.b === a))) return;
    w.edges.push({ a, b, d: dist2(w.systems[a], w.systems[b]), vol: 0 });
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
  for (let i = 0; i < 4; i++) {
    const a = rng.int(0, T.N_SYSTEMS - 1), b = rng.int(0, T.N_SYSTEMS - 1);
    if (a !== b && dist2(w.systems[a], w.systems[b]) < 380) addEdge(a, b);
  }
  rebuildAdj(w);

  // seed populations on the most livable worlds
  const ranked = [...w.systems].sort(
    (a, b) => b.hab * 0.6 + b.fert * 0.4 - (a.hab * 0.6 + a.fert * 0.4)
  );
  ranked.slice(0, T.SEEDED).forEach((s) => {
    s.pop = rng.range(2, 24);
    s.settledYear = 0; s.peakPop = s.pop; w.stats.seeded++;
    s.wealth = rng.range(20, 90);
    s.stock.food = s.pop * 3; s.stock.goods = s.pop;
    s.stock.ore = s.pop * 0.5; s.stock.fuel = s.pop * 0.5;
  });

  // founding factions on well-spaced high-pop capitals
  const caps = [];
  for (const s of ranked.slice(0, T.SEEDED).sort((a, b) => b.pop - a.pop)) {
    if (caps.every((c) => dist2(c, s) > 130)) caps.push(s);
    if (caps.length >= T.START_FACTIONS) break;
  }
  caps.forEach((cap) => foundFaction(w, rng, cap, true));

  [...w.systems].filter((s) => s.pop > 0).sort((a, b) => b.pop - a.pop)
    .slice(0, T.START_HOUSES)
    .forEach((s) => foundHouse(w, rng, s, T.START_SHIPS, 80));

  log(w, "era", `The Age of Foundation begins. ${caps.length} powers rise among ${T.N_SYSTEMS} known systems.`);
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
