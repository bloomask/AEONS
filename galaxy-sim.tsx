import { useState, useEffect, useRef, useCallback } from "react";

/* ============================================================
   AEONS — a self-regulating galaxy simulator prototype
   1 tick = 1 year. No safety rails: systems starve, mines run
   dry, empires overextend and collapse. History is logged.
   ============================================================ */

// ---------- tuning ----------
const T = {
  N_SYSTEMS: 96,
  SEEDED: 40,
  START_FACTIONS: 12,
  BURN_YEARS: 300,
  GALAXY_R: 460,
  FOOD_PER_POP: 1.0,
  GOODS_PER_POP: 0.5,
  FOOD_YIELD: 6.0,
  ORE_YIELD: 3.0,
  FUEL_YIELD: 3.0,
  GOODS_YIELD: 2.2,
  MIN_QUALITY_FLOOR: 0.25,
  FOOD_SPOILAGE: 0.85,
  GROWTH_THRESHOLD: 0.58,
  ADMIN_BASE: 0.55,
  ADMIN_EXP: 1.35,
  TAX_RATE: 0.02,
  TAX_PER_POP: 0.12,
  SHIP_UPKEEP: 0.12,
  SHIP_COST: 2.0,
  START_HOUSES: 5,
  START_SHIPS: 30,
  TRAMP_CAP: 1.5,
  EMBARGO_RIVALRY: 45,
  BUILD_WEALTH: 60,
};

const GOODS = ["food", "ore", "fuel", "goods"];
const BASE_PRICE = { food: 1.0, ore: 1.3, fuel: 1.6, goods: 3.2 };
const SHIP_COST = { food: 1.3, ore: 1.6, fuel: 1.0, goods: 0.8 };

const FACTION_COLORS = [
  "#E8B04B", "#5CC8DA", "#C05DD6", "#6FBF73", "#E4708A",
  "#7B8CE8", "#D9823B", "#4FD0A5", "#B8C94A", "#DA5CB0",
  "#8A6FE8", "#4BA3E8", "#E8D14B", "#5CE87B",
];

const CULTURES = [
  { name: "Vessari", syll: ["ve", "sa", "ri", "al", "ith", "ora", "en", "lys", "mar"], vec: [0.9, 0.2, 0.4] },
  { name: "Korrin", syll: ["kor", "gra", "dun", "vok", "tar", "rok", "bar", "ug", "drenn"], vec: [0.1, 0.8, 0.3] },
  { name: "Auleth", syll: ["au", "leth", "ei", "sol", "ane", "yr", "cel", "ion", "the"], vec: [0.5, 0.1, 0.9] },
  { name: "Dzan", syll: ["dza", "khe", "mun", "tsa", "ryn", "gol", "she", "kai", "urt"], vec: [0.3, 0.6, 0.8] },
  { name: "Meridian", syll: ["mer", "ida", "nov", "ter", "lux", "pra", "vin", "sta", "cor"], vec: [0.7, 0.5, 0.1] },
  { name: "Oktai", syll: ["ok", "tai", "hru", "zem", "vol", "nak", "iri", "shu", "pon"], vec: [0.2, 0.4, 0.6] },
];
const FACTION_SUFFIX_CALM = ["League", "Compact", "Union", "Concord", "Assembly"];
const FACTION_SUFFIX_AGGR = ["Hegemony", "Mandate", "Ascendancy", "Dominion", "Combine"];

// ---------- rng ----------
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function makeRng(seed) {
  const f = mulberry32(seed);
  return {
    n: f,
    range: (a, b) => a + (b - a) * f(),
    int: (a, b) => Math.floor(a + (b - a + 1) * f()),
    pick: (arr) => arr[Math.floor(f() * arr.length)],
    chance: (p) => f() < p,
    gauss: () => (f() + f() + f() - 1.5) / 1.5,
  };
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const dist2 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const cultDist = (a, b) =>
  Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) / 1.73;

function genName(rng, cult) {
  const s = cult.syll;
  let n = rng.pick(s) + rng.pick(s);
  if (rng.chance(0.4)) n += rng.pick(s);
  n = n[0].toUpperCase() + n.slice(1);
  if (rng.chance(0.12)) n += " " + rng.pick(["Prime", "II", "Reach", "Gate", "Deep"]);
  return n;
}

// ---------- world generation ----------
function genGalaxy(seed) {
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

function rebuildAdj(w) {
  w.adj = w.systems.map(() => []);
  w.edges.forEach((e, i) => {
    w.adj[e.a].push({ to: e.b, e: i });
    w.adj[e.b].push({ to: e.a, e: i });
  });
}

function foundFaction(w, rng, cap, spread) {
  const aggr = rng.n();
  const f = {
    id: w.nextFid++, capital: cap.id,
    name: `${cap.name.split(" ")[0]} ${aggr > 0.55 ? rng.pick(FACTION_SUFFIX_AGGR) : rng.pick(FACTION_SUFFIX_CALM)}`,
    color: FACTION_COLORS[w.nextFid % FACTION_COLORS.length],
    aggr, expans: rng.n(), treasury: 60, stability: 0.8,
    dead: false, foundedYear: w.year,
    peakSystems: 1, peakPop: cap.pop,
    tariff: rng.range(0.05, 0.25),
  };
  w.stats.c.factionsFounded++;
  cap.fid = f.id;
  if (spread) {
    for (const { to } of w.adj[cap.id]) {
      const o = w.systems[to];
      if (o.pop > 0 && o.fid === null) o.fid = f.id;
    }
  }
  w.factions.push(f);
  if (w.year > 0) log(w, "found", `${f.name} proclaimed at ${cap.name}.`, cap.id);
  return f;
}

function genHouseName(rng, sys) {
  const cult = CULTURES.find((c) => c.name === sys.cultName) || CULTURES[0];
  const base = genName(rng, cult).split(" ")[0];
  return rng.pick([
    `House ${base}`, `${base} & Sons`, `The ${base} Combine`,
    `${base} Freightways`, `${base} Starlift`,
  ]);
}
function foundHouse(w, rng, home, ships, wealth) {
  const h = {
    id: w.houses.length, name: genHouseName(rng, home),
    home: home.id, wealth, ships, dead: false,
    foundedYear: w.year, diedYear: null, peakWealth: wealth,
  };
  w.houses.push(h);
  if (w.year > 0) {
    w.stats.c.houseFounded++;
    log(w, "house", `${h.name} is chartered at ${home.name}, ${ships.toFixed(0)} hulls under its banner.`, home.id);
  }
  return h;
}

function log(w, t, s, sysId = null) {
  w.events.push({ y: w.year, t, s, sysId });
  if (sysId !== null) {
    const sys = w.systems[sysId];
    sys.history.push({ y: w.year, t, s });
    if (sys.history.length > 12) sys.history.shift();
  }
  if (w.events.length > 800) w.events.splice(0, w.events.length - 800);
}

const relKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);
function getRel(w, a, b) {
  const k = relKey(a, b);
  if (!w.relations[k]) w.relations[k] = { rivalry: 20, war: null, allied: false };
  return w.relations[k];
}

// ---------- yearly simulation ----------
function simulateYear(w) {
  const rng = w.rng;
  w.year++;

  const alive = w.systems.filter((s) => s.pop > 0.05);

  // --- production, consumption, prices ---
  for (const s of alive) {
    s.stock.food *= Math.min(0.97, T.FOOD_SPOILAGE + 0.04 * s.infra.gran); // food is perishable; granaries help
    const mq = s.min * Math.max(T.MIN_QUALITY_FLOOR + 0.15 * s.infra.mine, Math.sqrt(Math.max(0, s.minRes / s.minRes0)));
    const eq = s.en * Math.max(0.4, Math.sqrt(Math.max(0, s.enRes / s.enRes0)));

    // labor allocation follows price signals (with inertia);
    // hungry populations shift hard toward subsistence farming
    const hunger = 1 + 2.5 * Math.max(0, 0.75 - s.wb);
    const wt = {
      food: s.price.food * s.fert * 2.2 * hunger,
      ore: s.price.ore * mq * 2.5,
      fuel: s.price.fuel * eq * 2.5,
      goods: Math.max(0.05, s.price.goods * 1.8 * s.dev - s.price.ore * 0.5 - s.price.fuel * 0.3),
    };
    const sum = wt.food + wt.ore + wt.fuel + wt.goods;
    for (const g of GOODS)
      s.shares[g] = s.shares[g] * 0.5 + (wt[g] / sum) * 0.5;

    const L = s.pop;
    const prod = {
      food: T.FOOD_YIELD * s.fert * L * s.shares.food,
      ore: T.ORE_YIELD * mq * L * s.shares.ore,
      fuel: T.FUEL_YIELD * eq * L * s.shares.fuel,
      goods: 0,
    };
    s.minRes = Math.max(0, s.minRes - prod.ore);
    s.enRes = Math.max(0, s.enRes - prod.fuel * 0.3);

    // industry converts ore+fuel into goods
    const gCap = T.GOODS_YIELD * s.dev * L * s.shares.goods;
    const gMade = Math.min(gCap, s.stock.ore / 0.5, s.stock.fuel / 0.3);
    prod.goods = Math.max(0, gMade);
    s.stock.ore -= prod.goods * 0.5;
    s.stock.fuel -= prod.goods * 0.3;
    for (const g of GOODS) s.stock[g] += prod[g];

    // consumption
    const foodNeed = s.pop * T.FOOD_PER_POP;
    const goodsNeed = s.pop * T.GOODS_PER_POP;
    const ate = Math.min(s.stock.food, foodNeed);
    const used = Math.min(s.stock.goods, goodsNeed);
    s.stock.food -= ate; s.stock.goods -= used;
    const fs = foodNeed > 0 ? ate / foodNeed : 1;
    const gs = goodsNeed > 0 ? used / goodsNeed : 1;
    let wb = 0.8 * fs + 0.2 * gs;
    const capPop = s.hab * 120 + s.fert * 80 + 8;
    if (s.pop > capPop) wb *= capPop / s.pop;
    s.wb = wb;

    // demography — no rubber-banding
    s.pop *= 1 + clamp((wb - T.GROWTH_THRESHOLD) * 0.05, -0.05, 0.025);
    s.peakPop = Math.max(s.peakPop, s.pop);
    if (fs < 0.45) {
      const before = s.pop;
      s.pop *= 0.85 + 0.3 * fs;
      const lost = before - s.pop;
      s.lastFamine = w.year;
      if (s.famineCd <= 0) {
        w.stats.c.famine++;
        let why = "";
        if (s.siege) why = " under the blockade";
        else if (s.min > 0.35 && s.minRes / s.minRes0 < 0.15) why = " as the great mines fail and the ore money dries up";
        else if (s.fert < 0.15) why = ", a barren world cut off from the grain lanes";
        const v = rng.pick([
          `Famine grips ${s.name}${why}. Granaries empty; the exodus begins.`,
          `The hunger years come to ${s.name}${why}. Ration queues stretch past the starports.`,
          `${s.name} starves${why}. Freighters that once carried ore now carry refugees.`,
        ]);
        log(w, "famine", v, s.id);
        if (lost > w.records.worstFamine && lost > 4) {
          w.records.worstFamine = lost;
          log(w, "era", `${lost.toFixed(0)} million perish at ${s.name} — the worst famine the galaxy has recorded.`, s.id);
        }
        s.famineCd = 5;
      }
    }
    s.famineCd--;

    // prices from local scarcity
    const demand = {
      food: foodNeed, goods: goodsNeed,
      ore: gCap * 0.5, fuel: gCap * 0.3 + s.pop * 0.05,
    };
    for (const g of GOODS) {
      const scarcity = (demand[g] * 1.5 + 1) / (s.stock[g] + prod[g] * 0.5 + 1);
      s.price[g] = BASE_PRICE[g] * clamp(Math.pow(scarcity, 0.75), 0.15, 8);
    }

    // wealth & development
    const pv = GOODS.reduce((acc, g) => acc + prod[g] * s.price[g], 0);
    s.wealth = Math.max(-20, s.wealth * 0.99 + pv * 0.06 - s.pop * 0.02);
    s.dev = clamp(
      s.dev + clamp((s.wealth / (s.pop * 10 + 1) - 0.5) * 0.004, -0.003, 0.006),
      0.3, 3
    );
    s.tradeIn = 0; s.tradeOut = 0;
    s.flow = { food: 0, ore: 0, fuel: 0, goods: 0 };
  }

  // --- shipping allocation: houses put hulls on the best lanes near home ---
  const ecap = w.edges.map(() => T.TRAMP_CAP);
  const eassign = w.edges.map(() => []);
  const eprofit = w.edges.map(() => 0);
  const gateDisc = (A, B) => Math.max(0.5, 1 - 0.12 * (A.infra.gate + B.infra.gate));
  const margins = w.edges.map((e) => {
    const A = w.systems[e.a], B = w.systems[e.b];
    if (A.pop <= 0.05 || B.pop <= 0.05) return -1;
    const gf = gateDisc(A, B);
    let m = -1;
    for (const g of GOODS)
      m = Math.max(m, Math.abs(B.price[g] - A.price[g]) - (e.d / 220) * SHIP_COST[g] * gf);
    return m;
  });
  const liveHouses = w.houses.filter((h) => !h.dead);
  for (let i = liveHouses.length - 1; i > 0; i--) {
    const j = Math.floor(rng.n() * (i + 1));
    [liveHouses[i], liveHouses[j]] = [liveHouses[j], liveHouses[i]];
  }
  for (const h of liveHouses) {
    const home = w.systems[h.home];
    let left = h.ships;
    const cands = [];
    for (let i = 0; i < w.edges.length; i++) {
      if (margins[i] <= 0.05) continue;
      const e = w.edges[i];
      if (dist2(w.systems[e.a], home) < T.HOUSE_RANGE || dist2(w.systems[e.b], home) < T.HOUSE_RANGE)
        cands.push(i);
    }
    cands.sort((x, y) => margins[y] - margins[x]);
    for (const i of cands) {
      if (left <= 0) break;
      const take = Math.min(w.edges[i].vol * 1.2 + 2, left);
      ecap[i] += take; eassign[i].push([h, take]); left -= take;
    }
  }

  // --- trade: arbitrage across gates, limited by hulls, taxed at borders ---
  const order = [...w.edges.keys()];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng.n() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  for (const ei of order) {
    const e = w.edges[ei];
    e.vol *= 0.7;
    const A = w.systems[e.a], B = w.systems[e.b];
    if (A.pop <= 0.05 || B.pop <= 0.05) continue;
    if (A.siege || B.siege) continue; // blockade severs all trade
    let rel2 = null;
    if (A.fid !== null && B.fid !== null && A.fid !== B.fid) {
      rel2 = getRel(w, A.fid, B.fid);
      if (rel2.war || rel2.embargo) continue; // war and embargo sever the lane
    }
    let cap = ecap[ei];
    const gf = gateDisc(A, B);
    const dutyRate = (dst) => {
      if (!rel2 || dst.fid === null) return 0;
      if (rel2.allied) return 0; // open-lanes accord
      return w.factions[dst.fid].tariff;
    };
    for (const g of GOODS) {
      if (cap <= 0.01) break;
      const cost = (e.d / 220) * SHIP_COST[g] * gf + 0.05;
      let from = null, to = null;
      if (B.price[g] - A.price[g] > cost + dutyRate(B) * B.price[g]) { from = A; to = B; }
      else if (A.price[g] - B.price[g] > cost + dutyRate(A) * A.price[g]) { from = B; to = A; }
      if (!from) continue;
      let q = from.stock[g] * 0.2;
      q = Math.min(q, Math.max(0, to.wealth) / to.price[g] * 0.35, cap);
      if (q < 0.01) continue;
      cap -= q;
      const duty = q * to.price[g] * dutyRate(to);
      from.stock[g] -= q; to.stock[g] += q;
      from.wealth += q * from.price[g];
      to.wealth -= q * to.price[g] + duty;
      from.tradeOut += q * from.price[g]; to.tradeIn += q * to.price[g];
      from.flow[g] -= q; to.flow[g] += q;
      if (to.fid !== null && duty > 0) w.factions[to.fid].treasury += duty;
      eprofit[ei] += q * (to.price[g] - from.price[g]) - q * cost;
      e.vol += q;
    }
  }

  // --- house economics: freight profit, upkeep, fleets, fortunes, ruin ---
  for (let ei = 0; ei < w.edges.length; ei++) {
    const tot = eassign[ei].reduce((a, [, t]) => a + t, 0);
    if (tot <= 0 || eprofit[ei] <= 0) continue;
    for (const [h, take] of eassign[ei]) {
      const share = (eprofit[ei] * take) / (tot + T.TRAMP_CAP);
      h.wealth += share * 0.85;
      w.systems[h.home].wealth += share * 0.15; // the house spends at home
    }
  }
  for (const h of liveHouses) {
    h.wealth -= h.ships * T.SHIP_UPKEEP;
    h.ships *= 0.99; // wear
    h.peakWealth = Math.max(h.peakWealth, h.wealth);
    if (h.wealth > w.records.richestHouse) {
      w.records.richestHouse = h.wealth;
      log(w, "house", `${h.name} now commands the greatest fortune in galactic history.`, h.home);
    }
    if (h.wealth > 300) {
      const div = (h.wealth - 300) * 0.12;
      h.wealth -= div; w.systems[h.home].wealth += div;
    }
    const home = w.systems[h.home];
    if (home.ruined || home.pop <= 0.05) {
      const liv = w.systems.filter((s) => s.pop > 1);
      if (liv.length) {
        const next = liv.reduce((a, b) => (a.wealth > b.wealth ? a : b));
        h.home = next.id; h.wealth -= 30;
        log(w, "house", `${h.name} abandons its dead seat and reflags at ${next.name}.`, next.id);
      }
    }
    if (h.wealth > 150) {
      const n = Math.min(8, (h.wealth - 100) / T.SHIP_COST);
      h.ships += n; h.wealth -= n * T.SHIP_COST;
    }
    if (h.wealth < -30) {
      h.dead = true; h.diedYear = w.year;
      w.stats.c.houseBankrupt++;
      log(w, "house", `${h.name} is declared bankrupt after ${w.year - h.foundedYear} years. Its hulls are seized at a dozen ports.`, h.home);
    }
  }
  if (w.houses.filter((h) => !h.dead).length < 9 && rng.chance(0.03)) {
    const liv = w.systems.filter((s) => s.pop > 3);
    if (liv.length) {
      const hub = liv.reduce((a, b) => (a.wealth > b.wealth ? a : b));
      foundHouse(w, rng, hub, 15, 60);
    }
  }

  // --- migration & colonization ---
  for (const s of alive) {
    if (s.wb < 0.55 && s.pop > 0.1 && !s.siege) {
      const frac = (0.55 - s.wb) * 0.35;
      const dest = w.adj[s.id]
        .map(({ to }) => w.systems[to])
        .filter((o) => o.pop > 0.05 && !o.siege && o.wb > s.wb + 0.02)
        .sort((a, b) => b.wb - a.wb)[0];
      if (dest) {
        const m = s.pop * frac;
        s.pop -= m; dest.pop += m;
      }
    }
    // found colonies on empty (or long-dead) habitable neighbors
    if (s.wb > 0.7 && s.pop > 8 && rng.chance(0.09)) {
      const target = w.adj[s.id]
        .map(({ to }) => w.systems[to])
        .find((o) =>
          o.pop <= 0.05 && o.hab > 0.3 &&
          (!o.ruined || w.year - o.diedYear > 25)
        );
      if (target) {
        const m = Math.min(2.0, s.pop * 0.07);
        s.pop -= m; target.pop = m;
        target.fid = s.fid; target.dev = 0.6;
        target.stock.food = m * 3; target.stock.goods = m;
        const wasRuin = target.ruined;
        target.ruined = false;
        target.settledYear = w.year; target.peakPop = m;
        target.lastFamine = -99; target.lastPlague = -99; target.lastWar = -99;
        w.stats.c[wasRuin ? "resettle" : "colony"]++;
        log(w, "colony",
          wasRuin
            ? `Settlers from ${s.name} raise new towers over the ruins of ${target.name}.`
            : `${s.name} founds a colony at ${target.name}.`,
          target.id);
      }
    }
  }

  // --- infrastructure: rich systems turn wealth into durable capital ---
  for (const s of alive) {
    if (s.wealth > T.BUILD_WEALTH && rng.chance(0.15)) {
      const i = s.infra;
      let what = null;
      if (s.fert > 0.45 && i.gran < 3) { i.gran++; s.wealth -= 25 * i.gran; what = `raises new orbital granaries (level ${i.gran})`; }
      else if (s.tradeIn > 15 && i.gate < 3) { i.gate++; s.wealth -= 30; what = `expands its jumpgate docks (level ${i.gate})`; }
      else if (s.min > 0.5 && s.minRes / s.minRes0 < 0.4 && i.mine < 2) { i.mine++; s.wealth -= 40; what = `sinks deep shafts into the played-out veins (level ${i.mine})`; }
      else if (i.gran < 3) { i.gran++; s.wealth -= 25 * i.gran; what = `raises new orbital granaries (level ${i.gran})`; }
      if (what) {
        w.stats.c.build++;
        log(w, "build", `${s.name} ${what}.`, s.id);
      }
    }
  }

  // --- system death ---
  for (const s of w.systems) {
    if (s.pop > 0 && s.pop < 0.05 && !s.ruined) {
      s.ruined = true; s.diedYear = w.year; s.pop = 0;
      let cause = "economic decline";
      if (w.year - s.lastPlague <= 8) cause = "plague";
      else if (w.year - s.lastWar <= 6) cause = "war attrition";
      else if (s.min > 0.35 && s.minRes / s.minRes0 < 0.08) cause = "resource depletion";
      else if (w.year - s.lastFamine <= 10) cause = "famine";
      w.stats.deaths.push({
        system: s.name, year: w.year,
        age: s.settledYear === null ? null : w.year - s.settledYear,
        peakPop: +s.peakPop.toFixed(1), cause,
      });
      s.siege = null;
      const f = s.fid !== null ? w.factions[s.fid] : null;
      s.fid = null;
      const deathText = {
        plague: `${s.name} goes dark — the last quarantine beacon fails in ${w.year}.`,
        "war attrition": `${s.name} goes dark, ground to dust by the war. No one remains to surrender.`,
        "resource depletion": `${s.name} goes dark. The mines gave out, the money left, and then the people did.`,
        famine: `${s.name} goes dark — starved to silence. The last transmissions beg for grain that never came.`,
        "economic decline": `${s.name} goes dark, forgotten by the trade lanes long before the end.`,
      }[cause];
      log(w, "death", deathText, s.id);
      if (f && f.capital === s.id) relocateCapital(w, f);
    }
  }

  // --- faction economics & politics ---
  for (const f of w.factions) {
    if (f.dead) continue;
    const members = w.systems.filter((s) => s.fid === f.id && s.pop > 0.05);
    if (members.length === 0) { killFaction(w, f, "fades from the star charts, its last worlds gone silent", "extinction"); continue; }
    const cap = w.systems[f.capital];
    f.peakSystems = Math.max(f.peakSystems, members.length);
    f.peakPop = Math.max(f.peakPop, members.reduce((a, s) => a + s.pop, 0));
    if (members.length > w.records.largestRealm) {
      w.records.largestRealm = members.length;
      log(w, "era", `The ${f.name} now rules ${members.length} systems — the greatest realm the galaxy has yet known.`);
    }

    const income = members.reduce(
      (a, s) => a + Math.max(0, s.wealth) * T.TAX_RATE + s.pop * T.TAX_PER_POP, 0);
    const avgDist = members.reduce((a, s) => a + dist2(s, cap), 0) / members.length;
    const admin = T.ADMIN_BASE * Math.pow(members.length, T.ADMIN_EXP) * (1 + avgDist / 300);
    const atWar = Object.entries(w.relations).some(
      ([k, r]) => r.war && k.split("|").map(Number).includes(f.id)
    );
    f.treasury += income - admin - (atWar ? 14 : 0);
    // stability tracks the treasury AND how citizens actually live:
    // famine breeds unrest; large empires strain cohesion
    const avgWbM = members.reduce((a, s) => a + s.wb, 0) / members.length;
    f.stability = clamp(
      f.stability + (f.treasury > 0 ? 0.04 : -0.08) + (atWar ? -0.03 : 0.01)
        - members.length * 0.003 + (avgWbM - 0.58) * 0.25,
      0, 1
    );

    // war effort consumes member stockpiles — famine as a weapon of attrition
    if (atWar) {
      for (const s of members) {
        s.stock.fuel *= 0.92; s.stock.goods *= 0.92;
      }
    }

    // secession of the resentful fringe
    if (f.stability < 0.35) {
      const fCult = avgCult(members);
      for (const s of members) {
        if (s.id === f.capital) continue;
        if (rng.chance(0.04 + cultDist(s.cult, fCult) * 0.1)) {
          s.fid = null;
          w.stats.c.secede++;
          log(w, "secede", `${s.name} declares independence from the ${f.name}.`, s.id);
        }
      }
    }

    // total collapse
    if (f.treasury < -80 || f.stability < 0.12) {
      killFaction(w, f, "collapses under its own weight; its worlds scatter into independence",
        f.treasury < -80 ? "bankruptcy" : "unrest");
      continue;
    }

    // peaceful/forceful annexation of independents
    if (f.treasury > 50 && rng.chance(f.expans * 0.4)) {
      const fCult = avgCult(members);
      const cands = [];
      for (const s of members)
        for (const { to } of w.adj[s.id]) {
          const o = w.systems[to];
          if (o.pop > 0.05 && o.fid === null) cands.push(o);
        }
      if (cands.length) {
        cands.sort((a, b) => cultDist(a.cult, fCult) - cultDist(b.cult, fCult));
        const tgt = cands[0];
        const cd = cultDist(tgt.cult, fCult);
        f.treasury -= 20 + cd * 30;
        tgt.fid = f.id;
        w.stats.c.annex++;
        log(w, "annex",
          cd < 0.25
            ? `${tgt.name} joins the ${f.name} by accord.`
            : `The ${f.name} subjugates ${tgt.name}.`,
          tgt.id);
      }
    }
  }

  // --- diplomacy: rivalry, alliance, war ---
  const liveFactions = w.factions.filter((f) => !f.dead);
  for (let i = 0; i < liveFactions.length; i++) {
    for (let j = i + 1; j < liveFactions.length; j++) {
      const A = liveFactions[i], B = liveFactions[j];
      const border = w.edges.filter((e) => {
        const fa = w.systems[e.a].fid, fb = w.systems[e.b].fid;
        return (fa === A.id && fb === B.id) || (fa === B.id && fb === A.id);
      });
      const rel = getRel(w, A.id, B.id);
      if (!border.length) {
        if (rel.war) {
          const rec = w.stats.wars[rel.war.rec];
          if (rec) { rec.end = w.year; rec.duration = w.year - rel.war.since; rec.winner = "none (border lost)"; }
          const k2 = relKey(A.id, B.id);
          for (const s of w.systems) if (s.siege && s.siege.pair === k2) s.siege = null;
          rel.war = null; rel.rivalry = 30;
          log(w, "peace", `The war between the ${A.name} and the ${B.name} peters out — their frontiers no longer touch.`);
        }
        rel.rivalry = Math.max(0, rel.rivalry - 1);
        continue;
      }
      const mutualTrade = border.reduce((a, e) => a + e.vol, 0);
      const mA = w.systems.filter((s) => s.fid === A.id && s.pop > 0);
      const mB = w.systems.filter((s) => s.fid === B.id && s.pop > 0);
      if (!mA.length || !mB.length) continue;
      const cd = cultDist(avgCult(mA), avgCult(mB));

      if (!rel.war) {
        rel.rivalry = clamp(
          rel.rivalry + 0.8 + cd * 1.4 + border.length * 0.2 - mutualTrade * 0.25,
          0, 100
        );
        const wasAllied = rel.allied;
        rel.allied = rel.rivalry < 12 && cd < 0.3;
        if (rel.allied && !wasAllied) {
          log(w, "accord", `The ${A.name} and the ${B.name} sign open-lanes accords: no duties, no inspections, shared patrols.`);
        }
        if (!rel.embargo && rel.rivalry > T.EMBARGO_RIVALRY && rng.chance(Math.max(A.aggr, B.aggr) * 0.15)) {
          rel.embargo = true;
          w.stats.c.embargo++;
          log(w, "embargo", rng.pick([
            `The ${A.name} and the ${B.name} embargo one another. Customs houses shutter along the frontier.`,
            `Trade war: freighters are turned back at every gate between the ${A.name} and the ${B.name}.`,
          ]));
        } else if (rel.embargo && rel.rivalry < 35) {
          rel.embargo = false;
          log(w, "embargo", `The embargo between the ${A.name} and the ${B.name} is lifted. Freighters queue at the reopened gates.`);
        }
        if (
          rel.rivalry > 60 && !rel.allied &&
          rng.chance(Math.max(A.aggr, B.aggr) * 0.35) &&
          (A.treasury > 40 || B.treasury > 40)
        ) {
          rel.war = { since: w.year, score: 0, rec: w.stats.wars.length };
          w.stats.wars.push({
            a: A.name, b: B.name, start: w.year,
            end: null, duration: null, winner: null, systemsCeded: 0, battles: 0,
          });
          w.stats.c.warsDeclared++;
          w.warCount++;
          log(w, "war", rng.pick([
            `The ${A.name} and the ${B.name} go to war. Jumpgates between them fall silent.`,
            `War. ${A.name} warships mass along the ${B.name} frontier, and the trade lanes empty overnight.`,
            `Old grievances boil over: the ${A.name} and the ${B.name} take up arms.`,
          ]));
        }
      } else {
        // --- war as geography: battles at gates, sieges, fronts that move ---
        const dur = w.year - rel.war.since;
        const key = relKey(A.id, B.id);
        const rec = w.stats.wars[rel.war.rec];
        const localStrength = (f, e) => {
          const near = new Set([e.a, e.b]);
          for (const { to } of w.adj[e.a]) near.add(to);
          for (const { to } of w.adj[e.b]) near.add(to);
          let str = 0;
          for (const id of near) {
            const s = w.systems[id];
            if (s.fid === f.id && s.pop > 0.05) str += s.pop * s.dev;
          }
          return str * 0.7 + Math.max(0, f.treasury) * 0.05;
        };

        // 1-2 battles a year at contested gates
        const nBattles = Math.min(border.length, 1 + (rng.chance(0.4) ? 1 : 0));
        const pool = [...border];
        for (let bi = 0; bi < nBattles; bi++) {
          const e = pool.splice(rng.int(0, pool.length - 1), 1)[0];
          const sa = w.systems[e.a], sb = w.systems[e.b];
          const rollA = localStrength(A, e) * rng.range(0.7, 1.3);
          const rollB = localStrength(B, e) * rng.range(0.7, 1.3);
          const winF = rollA > rollB ? A : B;
          const loseF = winF === A ? B : A;
          rel.war.score += winF === A ? 1 : -1;
          w.stats.c.battle++;
          if (rec) rec.battles++;
          sa.pop *= 0.985; sb.pop *= 0.985;
          sa.lastWar = w.year; sb.lastWar = w.year;
          const gate = `${sa.name}–${sb.name}`;
          const winSys = sa.fid === winF.id ? sa : sb;
          const lostSys = winSys === sa ? sb : sa;
          if (winSys.siege && winSys.siege.by === loseF.id) {
            // the besieged side won the gate: siege broken
            winSys.siege = null;
            w.stats.c.siegeLift++;
            log(w, "siege", `The siege of ${winSys.name} is broken at the ${gate} gate. Relief convoys pour in.`, winSys.id);
          } else if (!lostSys.siege && lostSys.fid === loseF.id) {
            lostSys.siege = { by: winF.id, since: w.year, pair: key };
            log(w, "siege", rng.pick([
              `${winF.name} forces win the ${gate} gate and lay siege to ${lostSys.name}. Nothing flies in or out.`,
              `Victory at ${gate}: the ${winF.name} throws a blockade around ${lostSys.name}.`,
            ]), lostSys.id);
          } else {
            log(w, "battle", rng.pick([
              `Battle at the ${gate} gate: ${winF.name} forces rout the ${loseF.name}.`,
              `The fleets of the ${winF.name} scatter the ${loseF.name} line at ${gate}.`,
              `A bloody stalemate at ${gate} breaks in the ${winF.name}'s favor.`,
            ]));
          }
        }

        // sieges tighten: starvation is the weapon (economy does the killing)
        let capitalSacked = false;
        for (const s of w.systems) {
          if (!s.siege || s.siege.pair !== key || s.pop <= 0.05) continue;
          s.pop *= 0.97; s.lastWar = w.year;
          const siegeDur = w.year - s.siege.since;
          if ((siegeDur >= 2 && s.wb < 0.45) || siegeDur >= 4) {
            const taker = w.factions[s.siege.by];
            const loserF = taker.id === A.id ? B : A;
            const wasCapital = loserF.capital === s.id;
            s.fid = taker.id; s.siege = null;
            for (const k of ["gran", "gate", "mine"])
              if (s.infra[k] > 0 && rng.chance(0.5)) s.infra[k]--;
            rel.war.score += taker.id === A.id ? 2 : -2;
            w.stats.c.siegeFall++; w.stats.c.cede++;
            if (rec) rec.systemsCeded++;
            log(w, "capture", wasCapital
              ? `${s.name} FALLS. The ${loserF.name}'s own capital is sacked after a ${siegeDur}-year siege.`
              : `${s.name} falls to the ${taker.name} after ${siegeDur} years under blockade.`, s.id);
            if (wasCapital) {
              loserF.stability = clamp(loserF.stability - 0.3, 0, 1);
              relocateCapital(w, loserF);
              capitalSacked = true;
            }
          }
        }

        // peace: exhaustion, decisive score, capital sack, or sheer length
        const exhausted = A.treasury < 0 || B.treasury < 0;
        if (capitalSacked || (dur > 3 && Math.abs(rel.war.score) > 4) || exhausted || dur > 15) {
          const winner = rel.war.score > 0 ? A : rel.war.score < 0 ? B : (exhausted ? null : A);
          for (const s of w.systems)
            if (s.siege && s.siege.pair === key) s.siege = null;
          if (rec) {
            rec.end = w.year; rec.duration = dur;
            rec.winner = winner ? winner.name : "white peace";
          }
          const taken = rec ? rec.systemsCeded : 0;
          if (winner && taken > 0) {
            log(w, "peace", `The Treaty of ${w.systems[winner.capital].name} ends ${dur} years of war. ${taken} system${taken > 1 ? "s" : ""} remain${taken > 1 ? "" : "s"} in ${winner.name} hands.`);
          } else if (winner) {
            log(w, "peace", `Peace between the ${A.name} and the ${B.name} after ${dur} years. The ${winner.name} claims victory, though the borders barely moved.`);
          } else {
            log(w, "peace", `Exhausted and bankrupt, the ${A.name} and the ${B.name} lay down arms after ${dur} years. Nobody calls it victory.`);
          }
          if (dur > w.records.longestWar && dur >= 8) {
            w.records.longestWar = dur;
            log(w, "era", `${dur} years of war between the ${A.name} and the ${B.name} — the longest anyone living can remember.`);
          }
          rel.war = null; rel.rivalry = 25;
        }
      }
    }
  }

  // --- new powers rise from prosperous independents ---
  for (const s of alive) {
    if (s.fid === null && s.pop > 8 && s.wealth > 30 && rng.chance(0.03)) {
      const f = foundFaction(w, rng, s, false);
      for (const { to } of w.adj[s.id]) {
        const o = w.systems[to];
        if (o.pop > 0.05 && o.fid === null && cultDist(o.cult, s.cult) < 0.3) o.fid = f.id;
      }
    }
  }

  // --- shocks ---
  for (const s of alive) {
    if (rng.chance(0.004)) {
      s.pop *= rng.range(0.4, 0.7);
      s.lastPlague = w.year;
      w.stats.c.plague++;
      log(w, "plague", `Plague sweeps ${s.name}. Quarantine beacons burn for a generation.`, s.id);
    }
    if (rng.chance(0.005)) {
      s.minRes += s.minRes0 * rng.range(0.4, 1.2);
      w.stats.c.strike++;
      log(w, "strike", `Vast new ore seams discovered at ${s.name}. Prospectors flood in.`, s.id);
    }
    if (rng.chance(0.002)) {
      for (const g of GOODS) s.stock[g] *= 0.5;
      w.stats.c.flare++;
      log(w, "flare", `A stellar flare scours the orbitals of ${s.name}; stockpiles are lost.`, s.id);
    }
  }
  if (rng.chance(0.02) && w.edges.length > T.N_SYSTEMS) {
    const ei = rng.int(0, w.edges.length - 1);
    const e = w.edges[ei];
    w.stats.c.gateClose++;
    log(w, "gate", `The jumpgate between ${w.systems[e.a].name} and ${w.systems[e.b].name} collapses.`);
    w.edges.splice(ei, 1); rebuildAdj(w);
  }
  if (rng.chance(0.02)) {
    for (let tries = 0; tries < 20; tries++) {
      const a = rng.int(0, T.N_SYSTEMS - 1), b = rng.int(0, T.N_SYSTEMS - 1);
      if (a !== b && dist2(w.systems[a], w.systems[b]) < 260 &&
        !w.edges.some((e) => (e.a === a && e.b === b) || (e.a === b && e.b === a))) {
        w.edges.push({ a, b, d: dist2(w.systems[a], w.systems[b]), vol: 0 });
        rebuildAdj(w);
        w.stats.c.gateOpen++;
        log(w, "gate", `A new jumpgate opens between ${w.systems[a].name} and ${w.systems[b].name}.`);
        break;
      }
    }
  }

  // --- culture drift: trade converges, isolation diverges ---
  for (const e of w.edges) {
    if (e.vol > 0.5) {
      const A = w.systems[e.a], B = w.systems[e.b];
      for (let k = 0; k < 3; k++) {
        const mid = (A.cult[k] + B.cult[k]) / 2;
        A.cult[k] += (mid - A.cult[k]) * 0.01;
        B.cult[k] += (mid - B.cult[k]) * 0.01;
      }
    }
  }
  for (const s of alive)
    for (let k = 0; k < 3; k++)
      s.cult[k] = clamp(s.cult[k] + rng.range(-0.004, 0.004), 0, 1);

  // --- yearly statistics snapshot, history traces, and era detection ---
  {
    const live = w.systems.filter((s) => s.pop > 0.05);
    const n = Math.max(1, live.length);
    const tp = live.reduce((a, s) => a + s.pop, 0);
    const byF = {};
    for (const s of live) if (s.fid !== null) byF[s.fid] = (byF[s.fid] || 0) + s.pop;
    const shares = Object.values(byF).map((p) => p / Math.max(1e-9, tp));
    const activeWars = Object.values(w.relations).filter((r) => r.war).length;
    w.stats.series.push({
      y: w.year,
      pop: +tp.toFixed(1),
      live: live.length,
      ruins: w.systems.filter((s) => s.ruined).length,
      factions: w.factions.filter((f) => !f.dead).length,
      wars: activeWars,
      avgWb: +(live.reduce((a, s) => a + s.wb, 0) / n).toFixed(3),
      miseryPct: +((live.filter((s) => s.wb < 0.5).length / n) * 100).toFixed(1),
      trade: +w.edges.reduce((a, e) => a + e.vol, 0).toFixed(1),
      indep: live.filter((s) => s.fid === null).length,
      largestShare: +(shares.length ? Math.max(...shares) : 0).toFixed(3),
      hhi: +shares.reduce((a, x) => a + x * x, 0).toFixed(3),
      pFood: +(live.reduce((a, s) => a + s.price.food, 0) / n).toFixed(2),
      pGoods: +(live.reduce((a, s) => a + s.price.goods, 0) / n).toFixed(2),
      fleet: +w.houses.reduce((a, h) => a + (h.dead ? 0 : h.ships), 0).toFixed(0),
      houses: w.houses.filter((h) => !h.dead).length,
    });

    // per-system traces for sparklines (last 120 years)
    for (const s of live) {
      s.trace.push({ p: +s.pop.toFixed(1), f: +s.price.food.toFixed(2), g: +s.price.goods.toFixed(2) });
      if (s.trace.length > 120) s.trace.shift();
    }

    // era detection: the galaxy names its own ages
    w.peaceYears = activeWars === 0 ? w.peaceYears + 1 : 0;
    w.popPeak100 = Math.max(tp, w.popPeak100 * 0.995); // slowly forgetting peak
    const eraAge = w.year - w.era.since;
    const setEra = (name) => {
      w.era = { name, since: w.year };
      log(w, "era", `A new age is spoken of across the lanes: ${name}.`);
    };
    if (eraAge > 40) {
      if (activeWars >= 2 && !w.era.name.includes("War") && !w.era.name.includes("Burning")) {
        setEra(rng.pick(["The Burning Years", "The Gate Wars", "The Age of Iron", "The Long Reckoning"]));
      } else if (tp < w.popPeak100 * 0.62 && !w.era.name.includes("Withering") && !w.era.name.includes("Dying")) {
        setEra(rng.pick(["The Withering", "The Dying Years", "The Great Silence"]));
      } else if (w.peaceYears >= 40 && !w.era.name.includes("Peace") && !w.era.name.includes("Golden")) {
        setEra(rng.pick(["The Long Peace", "The Golden Lanes", "The Age of Commerce", "The Quiet Centuries"]));
      }
    }
  }
}

function avgCult(members) {
  const v = [0, 0, 0];
  for (const s of members) for (let k = 0; k < 3; k++) v[k] += s.cult[k];
  return v.map((x) => x / members.length);
}
function relocateCapital(w, f) {
  const members = w.systems.filter((s) => s.fid === f.id && s.pop > 0.05);
  if (members.length) {
    members.sort((a, b) => b.pop - a.pop);
    f.capital = members[0].id;
    log(w, "cap", `The ${f.name} moves its seat to ${members[0].name}.`, members[0].id);
  }
}
function killFaction(w, f, verb, cause = "extinction") {
  f.dead = true; f.diedYear = w.year;
  w.stats.factionDeaths.push({
    faction: f.name, founded: f.foundedYear, died: w.year,
    lifespan: w.year - f.foundedYear, cause,
    peakSystems: f.peakSystems, peakPop: +f.peakPop.toFixed(1),
  });
  for (const s of w.systems) {
    if (s.fid === f.id) s.fid = null;
    if (s.siege && (s.siege.by === f.id || s.siege.pair.split("|").map(Number).includes(f.id))) s.siege = null;
  }
  for (const k of Object.keys(w.relations))
    if (k.split("|").map(Number).includes(f.id)) delete w.relations[k];
  log(w, "collapse", `The ${f.name} ${verb}. (${f.foundedYear}–${w.year})`);
}

// ---------- statistics export ----------
const median = (arr) => {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};
const meanOf = (arr) =>
  arr.length ? +(arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(1) : null;
const pctBreakdown = (arr, key) => {
  const c = {};
  arr.forEach((x) => (c[x[key]] = (c[x[key]] || 0) + 1));
  const out = {};
  Object.entries(c).forEach(([k, v]) => {
    out[k] = { count: v, pct: +((v / arr.length) * 100).toFixed(1) };
  });
  return out;
};

function buildStats(w) {
  const S = w.stats;
  const centuries = Math.max(0.01, w.year / 100);
  const settlements = S.seeded + S.c.colony + S.c.resettle;
  const ages = S.deaths.map((d) => d.age).filter((a) => a !== null);
  const endedWars = S.wars.filter((x) => x.end !== null);
  const durs = endedWars.map((x) => x.duration);
  const now = S.series[S.series.length - 1] || {};
  const peakPop = S.series.length ? Math.max(...S.series.map((r) => r.pop)) : 0;
  const maxShareEver = S.series.length ? Math.max(...S.series.map((r) => r.largestShare)) : 0;
  const fLifespans = S.factionDeaths.map((f) => f.lifespan);

  return {
    meta: { seed: w.seed, exportedAtYear: w.year, tuning: T },
    summary: {
      systemDeaths: {
        totalDeaths: S.deaths.length,
        totalSettlements: settlements,
        pctOfSettlementsDied: +((S.deaths.length / Math.max(1, settlements)) * 100).toFixed(1),
        deathsPerCentury: +(S.deaths.length / centuries).toFixed(2),
        ageAtDeath: {
          median: median(ages), mean: meanOf(ages),
          min: ages.length ? Math.min(...ages) : null,
          max: ages.length ? Math.max(...ages) : null,
        },
        causes: pctBreakdown(S.deaths, "cause"),
      },
      factions: {
        founded: S.c.factionsFounded,
        dead: S.factionDeaths.length,
        pctDead: +((S.factionDeaths.length / Math.max(1, S.c.factionsFounded)) * 100).toFixed(1),
        lifespan: { median: median(fLifespans), mean: meanOf(fLifespans) },
        deathCauses: pctBreakdown(S.factionDeaths, "cause"),
        concentrationNow: { largestShare: now.largestShare ?? 0, hhi: now.hhi ?? 0 },
        maxLargestShareEver: maxShareEver,
      },
      wars: {
        declared: S.c.warsDeclared,
        concluded: endedWars.length,
        warsPerCentury: +(S.c.warsDeclared / centuries).toFixed(2),
        duration: { median: median(durs), mean: meanOf(durs), max: durs.length ? Math.max(...durs) : null },
        meanSystemsCeded: meanOf(endedWars.map((x) => x.systemsCeded)),
      },
      eventCounts: { ...S.c },
      merchantHouses: {
        chartered: T.START_HOUSES + S.c.houseFounded,
        bankrupt: S.c.houseBankrupt,
        aliveNow: w.houses.filter((h) => !h.dead).length,
        fleetNow: +w.houses.reduce((a, h) => a + (h.dead ? 0 : h.ships), 0).toFixed(0),
        richestEver: +w.records.richestHouse.toFixed(0),
      },
      galaxyNow: {
        year: w.year,
        pop: now.pop ?? 0, peakPopEver: peakPop,
        popVsPeakPct: peakPop ? +((now.pop / peakPop) * 100).toFixed(1) : 0,
        liveSystems: now.live ?? 0, ruins: now.ruins ?? 0,
        avgWellbeing: now.avgWb ?? 0, miseryPct: now.miseryPct ?? 0,
        livingFactions: now.factions ?? 0, activeWars: now.wars ?? 0,
        independentSystems: now.indep ?? 0,
      },
    },
    systemDeaths: S.deaths,
    factionDeaths: S.factionDeaths,
    wars: S.wars,
    houses: w.houses.map((h) => ({
      name: h.name, home: w.systems[h.home].name,
      founded: h.foundedYear, died: h.diedYear,
      ships: +h.ships.toFixed(0), wealth: +h.wealth.toFixed(0),
      peakWealth: +h.peakWealth.toFixed(0), dead: h.dead,
    })),
    series: S.series,
  };
}

function downloadFile(name, text, mime) {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Defined at module scope: stable component identity across re-renders.
// (Defining these inside the main component recreates the type every render,
// which remounts the DOM nodes and eats clicks at high sim speeds.)
const Btn = ({ active, onClick, children, title }) => (
  <button
    title={title}
    onClick={onClick}
    className="px-2 py-1 text-xs rounded"
    style={{
      fontFamily: "'IBM Plex Mono', monospace",
      background: active ? "#E6E1D3" : "rgba(230,225,211,0.08)",
      color: active ? "#06090F" : "#E6E1D3",
      border: "1px solid rgba(230,225,211,0.2)",
    }}
  >
    {children}
  </button>
);

const Bar = ({ v, color }) => (
  <div className="h-1.5 rounded" style={{ background: "rgba(230,225,211,0.1)" }}>
    <div className="h-1.5 rounded" style={{ width: `${clamp(v, 0, 1) * 100}%`, background: color }} />
  </div>
);

// ---------- event styling ----------
const EV_STYLE = {
  war: { c: "#E4572E", tag: "WAR" }, peace: { c: "#7B8CE8", tag: "PEACE" },
  battle: { c: "#E4708A", tag: "BATTLE" }, siege: { c: "#F2A93B", tag: "SIEGE" },
  capture: { c: "#C05DD6", tag: "TAKEN" },
  collapse: { c: "#E4572E", tag: "FALL" }, death: { c: "#B0453A", tag: "DARK" },
  famine: { c: "#F2A93B", tag: "FAMINE" }, plague: { c: "#F2A93B", tag: "PLAGUE" },
  colony: { c: "#6FBF73", tag: "COLONY" }, found: { c: "#5CC8DA", tag: "RISE" },
  secede: { c: "#F2A93B", tag: "SPLIT" }, annex: { c: "#C05DD6", tag: "ANNEX" },
  cede: { c: "#C05DD6", tag: "CEDE" }, strike: { c: "#E8B04B", tag: "STRIKE" },
  flare: { c: "#F2A93B", tag: "FLARE" }, gate: { c: "#5CC8DA", tag: "GATE" },
  era: { c: "#E6E1D3", tag: "ERA" }, cap: { c: "#7B8CE8", tag: "SEAT" },
  house: { c: "#E8B04B", tag: "HOUSE" }, embargo: { c: "#F2A93B", tag: "EMBARGO" },
  build: { c: "#6FBF73", tag: "BUILD" }, accord: { c: "#5CC8DA", tag: "ACCORD" },
};
const EV_FILTERS = {
  all: null,
  war: new Set(["war", "peace", "battle", "siege", "capture", "cede"]),
  realm: new Set(["found", "collapse", "secede", "annex", "cap", "era"]),
  economy: new Set(["house", "embargo", "build", "accord", "strike", "gate", "flare"]),
  life: new Set(["famine", "plague", "colony", "death"]),
};

// ---------- overlay colors & sparklines ----------
function hexToRgb(h) {
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
}
function mixHex(h1, h2, t) {
  const a = hexToRgb(h1), b = hexToRgb(h2);
  return `rgb(${Math.round(a[0] + (b[0] - a[0]) * t)},${Math.round(a[1] + (b[1] - a[1]) * t)},${Math.round(a[2] + (b[2] - a[2]) * t)})`;
}
function wbColor(wb) {
  return wb < 0.55 ? mixHex("#E4572E", "#F2A93B", clamp(wb / 0.55, 0, 1))
    : mixHex("#F2A93B", "#6FBF73", clamp((wb - 0.55) / 0.45, 0, 1));
}
const OVERLAYS = ["realm", "wealth", "life", "trade", "culture"];

const Spark = ({ data, color, label, fmt }) => {
  if (!data || data.length < 2) return null;
  const W = 130, H = 26;
  const mn = Math.min(...data), mx = Math.max(...data);
  const span = mx - mn || 1;
  const pts = data.map((v, i) =>
    `${(i / (data.length - 1)) * W},${H - 2 - ((v - mn) / span) * (H - 4)}`
  ).join(" ");
  return (
    <div className="flex items-center gap-2">
      <span className="w-14" style={{ color: "#7C8798" }}>{label}</span>
      <svg width={W} height={H} style={{ display: "block" }}>
        <polyline points={pts} fill="none" stroke={color} strokeWidth="1.2" />
      </svg>
      <span style={{ color }}>{fmt(data[data.length - 1])}</span>
    </div>
  );
};

// ---------- component ----------
export default function GalaxySim() {
  const worldRef = useRef(null);
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  const viewRef = useRef({ x: 0, y: 0, scale: 0.55 });
  const dragRef = useRef(null);
  const hoverRef = useRef(null);

  const [, setVersion] = useState(0);
  const [selected, setSelected] = useState(null);
  const [tab, setTab] = useState("chronicle");
  const [speed, setSpeed] = useState(0);
  const [burn, setBurn] = useState(null);
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 1e6));
  const [overlay, setOverlay] = useState("realm");
  const [evFilter, setEvFilter] = useState("all");

  const bump = useCallback(() => setVersion((v) => v + 1), []);

  const runBurn = useCallback((w, years, onDone) => {
    setBurn({ done: 0, total: years });
    let done = 0;
    const step = () => {
      const chunk = Math.min(12, years - done);
      for (let i = 0; i < chunk; i++) simulateYear(w);
      done += chunk;
      setBurn({ done, total: years });
      bump();
      if (done < years) setTimeout(step, 0);
      else { setBurn(null); onDone && onDone(); }
    };
    setTimeout(step, 0);
  }, [bump]);

  // init
  useEffect(() => {
    const w = genGalaxy(seed);
    worldRef.current = w;
    setSelected(null);
    runBurn(w, T.BURN_YEARS, () => setSpeed(1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed]);

  // sim clock — render rate capped at 10/s; higher speeds batch years per tick
  useEffect(() => {
    if (!speed || burn) return;
    const yearsPerTick = Math.max(1, Math.round(speed / 10));
    const iv = setInterval(() => {
      if (worldRef.current) {
        for (let i = 0; i < yearsPerTick; i++) simulateYear(worldRef.current);
        bump();
      }
    }, 1000 / Math.min(speed, 10));
    return () => clearInterval(iv);
  }, [speed, burn, bump]);

  // draw loop
  useEffect(() => {
    let raf;
    const draw = () => {
      const cv = canvasRef.current, w = worldRef.current;
      if (cv && w) {
        const ctx = cv.getContext("2d");
        const dpr = window.devicePixelRatio || 1;
        const bw = cv.clientWidth, bh = cv.clientHeight;
        if (cv.width !== bw * dpr || cv.height !== bh * dpr) {
          cv.width = bw * dpr; cv.height = bh * dpr;
        }
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.fillStyle = "#06090F";
        ctx.fillRect(0, 0, bw, bh);
        const v = viewRef.current;
        const tx = (x) => bw / 2 + (x + v.x) * v.scale;
        const ty = (y) => bh / 2 + (y + v.y) * v.scale;

        // faint starfield
        ctx.fillStyle = "rgba(230,225,211,0.05)";
        const srng = mulberry32(w.seed);
        for (let i = 0; i < 90; i++)
          ctx.fillRect(srng() * bw, srng() * bh, 1, 1);

        // territory glow (realm overlay only)
        if (overlay === "realm") {
          for (const s of w.systems) {
            if (s.fid === null || s.pop <= 0.05) continue;
            const f = w.factions[s.fid];
            const r = (18 + Math.sqrt(s.pop) * 3) * v.scale;
            const g = ctx.createRadialGradient(tx(s.x), ty(s.y), 0, tx(s.x), ty(s.y), r);
            g.addColorStop(0, f.color + "26");
            g.addColorStop(1, f.color + "00");
            ctx.fillStyle = g;
            ctx.beginPath(); ctx.arc(tx(s.x), ty(s.y), r, 0, 7); ctx.fill();
          }
        }

        // gates
        const tradeEmph = overlay === "trade" ? 2.2 : 1;
        for (const e of w.edges) {
          const A = w.systems[e.a], B = w.systems[e.b];
          const atWar = A.fid !== null && B.fid !== null && A.fid !== B.fid &&
            w.relations[relKey(A.fid, B.fid)]?.war;
          ctx.beginPath();
          ctx.moveTo(tx(A.x), ty(A.y)); ctx.lineTo(tx(B.x), ty(B.y));
          if (atWar) {
            ctx.strokeStyle = "rgba(228,87,46,0.55)";
            ctx.setLineDash([4, 4]); ctx.lineWidth = 1;
          } else if (e.vol > 0.3) {
            ctx.strokeStyle = `rgba(92,200,218,${clamp((0.12 + e.vol * 0.03) * tradeEmph, 0, 0.85)})`;
            ctx.setLineDash([]); ctx.lineWidth = clamp((0.5 + e.vol * 0.06) * tradeEmph, 0.5, 3.5);
          } else {
            ctx.strokeStyle = "rgba(124,135,152,0.13)";
            ctx.setLineDash([]); ctx.lineWidth = 0.6;
          }
          ctx.stroke(); ctx.setLineDash([]);
        }

        // systems
        for (const s of w.systems) {
          const X = tx(s.x), Y = ty(s.y);
          if (s.ruined) {
            ctx.strokeStyle = "rgba(176,69,58,0.8)"; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.arc(X, Y, 3.4, 0, 7); ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(X - 2.2, Y - 2.2); ctx.lineTo(X + 2.2, Y + 2.2);
            ctx.moveTo(X + 2.2, Y - 2.2); ctx.lineTo(X - 2.2, Y + 2.2);
            ctx.stroke();
            continue;
          }
          if (s.pop <= 0.05) {
            ctx.fillStyle = "rgba(124,135,152,0.35)";
            ctx.beginPath(); ctx.arc(X, Y, 1.3, 0, 7); ctx.fill();
            continue;
          }
          const f = s.fid !== null ? w.factions[s.fid] : null;
          const r = clamp(2 + Math.sqrt(s.pop) * 0.85, 2, 9);
          if (overlay === "wealth") {
            const wpc = clamp(s.wealth / (s.pop * 3 + 1), 0, 1);
            ctx.fillStyle = mixHex("#2E3A52", "#F2A93B", wpc);
          } else if (overlay === "life") {
            ctx.fillStyle = wbColor(s.wb);
          } else if (overlay === "trade") {
            const th = clamp((s.tradeIn + s.tradeOut) / 40, 0, 1);
            ctx.fillStyle = mixHex("#3A4657", "#5CC8DA", th);
          } else if (overlay === "culture") {
            ctx.fillStyle = `rgb(${Math.round(90 + s.cult[0] * 165)},${Math.round(90 + s.cult[1] * 165)},${Math.round(90 + s.cult[2] * 165)})`;
          } else {
            ctx.fillStyle = f ? f.color : "#8892A6";
          }
          ctx.beginPath(); ctx.arc(X, Y, r, 0, 7); ctx.fill();
          if (s.siege) {
            ctx.strokeStyle = "#E4572E"; ctx.lineWidth = 1.2;
            ctx.setLineDash([2.5, 2.5]);
            ctx.beginPath(); ctx.arc(X, Y, r + 3.5, 0, 7); ctx.stroke();
            ctx.setLineDash([]);
          } else if (s.wb < 0.5 && overlay === "realm") {
            ctx.strokeStyle = "#F2A93B"; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.arc(X, Y, r + 2.5, 0, 7); ctx.stroke();
          }
          if (f && f.capital === s.id && overlay === "realm") {
            ctx.strokeStyle = "#E6E1D3"; ctx.lineWidth = 1;
            ctx.strokeRect(X - r - 3, Y - r - 3, (r + 3) * 2, (r + 3) * 2);
          }
        }

        // selection ring + labels
        const showId = hoverRef.current ?? selected;
        for (const s of w.systems) {
          const isSel = s.id === selected, isHov = s.id === hoverRef.current;
          if (!isSel && !isHov && !(v.scale > 1.3 && s.pop > 8)) continue;
          const X = tx(s.x), Y = ty(s.y);
          if (isSel) {
            ctx.strokeStyle = "#E6E1D3"; ctx.lineWidth = 1.2;
            ctx.beginPath(); ctx.arc(X, Y, 11, 0, 7); ctx.stroke();
          }
          ctx.font = "10px 'IBM Plex Mono', monospace";
          ctx.fillStyle = isSel || isHov ? "#E6E1D3" : "rgba(230,225,211,0.55)";
          ctx.fillText(s.name, X + 9, Y - 7);
        }
        void showId;
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [selected, overlay]);

  // input
  const screenToWorld = (mx, my) => {
    const cv = canvasRef.current, v = viewRef.current;
    return {
      x: (mx - cv.clientWidth / 2) / v.scale - v.x,
      y: (my - cv.clientHeight / 2) / v.scale - v.y,
    };
  };
  const nearest = (mx, my) => {
    const w = worldRef.current;
    if (!w) return null;
    const p = screenToWorld(mx, my);
    let best = null, bd = 16 / viewRef.current.scale;
    for (const s of w.systems) {
      const d = Math.hypot(s.x - p.x, s.y - p.y);
      if (d < bd) { bd = d; best = s.id; }
    }
    return best;
  };
  const onPointerDown = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    dragRef.current = {
      sx: e.clientX - rect.left, sy: e.clientY - rect.top,
      vx: viewRef.current.x, vy: viewRef.current.y, moved: false,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    hoverRef.current = nearest(mx, my);
    const d = dragRef.current;
    if (d) {
      const dx = mx - d.sx, dy = my - d.sy;
      if (Math.hypot(dx, dy) > 5) d.moved = true;
      if (d.moved) {
        viewRef.current.x = d.vx + dx / viewRef.current.scale;
        viewRef.current.y = d.vy + dy / viewRef.current.scale;
      }
    }
  };
  const onPointerUp = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const d = dragRef.current;
    dragRef.current = null;
    if (d && !d.moved) {
      const id = nearest(e.clientX - rect.left, e.clientY - rect.top);
      setSelected(id);
      if (id !== null) setTab("system");
    }
  };
  const onWheel = (e) => {
    const v = viewRef.current;
    v.scale = clamp(v.scale * Math.exp(-e.deltaY * 0.0012), 0.35, 6);
  };

  const w = worldRef.current;
  const liveSystems = w ? w.systems.filter((s) => s.pop > 0.05) : [];
  const totalPop = liveSystems.reduce((a, s) => a + s.pop, 0);
  const liveFactions = w ? w.factions.filter((f) => !f.dead) : [];
  const wars = w
    ? Object.entries(w.relations).filter(([, r]) => r.war).map(([k, r]) => ({ k, r }))
    : [];
  const sel = w && selected !== null ? w.systems[selected] : null;

  const exportJson = () => {
    const wd = worldRef.current;
    if (!wd || burn) return;
    downloadFile(
      `aeons-stats-seed${wd.seed}-y${wd.year}.json`,
      JSON.stringify(buildStats(wd), null, 1),
      "application/json"
    );
  };
  const exportCsv = () => {
    const wd = worldRef.current;
    if (!wd || burn || !wd.stats.series.length) return;
    const keys = Object.keys(wd.stats.series[0]);
    const csv = [keys.join(","), ...wd.stats.series.map((r) => keys.map((k) => r[k]).join(","))].join("\n");
    downloadFile(`aeons-series-seed${wd.seed}-y${wd.year}.csv`, csv, "text/csv");
  };

  return (
    <div
      className="w-full h-screen flex flex-col overflow-hidden select-none"
      style={{ background: "#06090F", color: "#E6E1D3", fontFamily: "'IBM Plex Mono', monospace" }}
    >
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@500;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap');
        ::-webkit-scrollbar{width:6px}::-webkit-scrollbar-thumb{background:rgba(230,225,211,.15);border-radius:3px}::-webkit-scrollbar-track{background:transparent}`}</style>

      {/* top bar */}
      <div
        className="flex items-center gap-2 px-3 py-2 flex-wrap"
        style={{ borderBottom: "1px solid rgba(230,225,211,0.12)", background: "#0C121C" }}
      >
        <div style={{ fontFamily: "'Chakra Petch', sans-serif", fontWeight: 700, letterSpacing: "0.15em" }} className="text-base">
          AEONS
        </div>
        <div className="text-xs" style={{ color: "#7C8798" }}>seed {seed}</div>
        <div className="flex-1" />
        <div className="text-sm" style={{ color: "#F2A93B", fontWeight: 600 }}>
          YEAR {w ? w.year : "—"}
        </div>
        <div className="flex gap-1">
          <Btn active={speed === 0} onClick={() => setSpeed(0)} title="Pause">⏸</Btn>
          <Btn active={speed === 1} onClick={() => setSpeed(1)} title="1 yr/s">▶</Btn>
          <Btn active={speed === 5} onClick={() => setSpeed(5)} title="5 yr/s">▶▶</Btn>
          <Btn active={speed === 20} onClick={() => setSpeed(20)} title="20 yr/s">▶▶▶</Btn>
          <Btn onClick={() => w && !burn && runBurn(w, 100)} title="Fast-forward a century">+100y</Btn>
          <Btn onClick={exportJson} title="Download full statistics (summary + deaths + wars + yearly series) as JSON">⬇ stats</Btn>
          <Btn onClick={exportCsv} title="Download yearly time series as CSV">⬇ csv</Btn>
          <Btn onClick={() => { setSpeed(0); setSeed(Math.floor(Math.random() * 1e6)); }} title="New galaxy">↻ new</Btn>
        </div>
      </div>

      {/* stats strip */}
      <div className="flex gap-4 px-3 py-1 text-xs flex-wrap" style={{ color: "#7C8798", background: "#0C121C", borderBottom: "1px solid rgba(230,225,211,0.08)" }}>
        <span>systems <b style={{ color: "#E6E1D3" }}>{liveSystems.length}</b>/{T.N_SYSTEMS}</span>
        <span>ruins <b style={{ color: "#B0453A" }}>{w ? w.systems.filter((s) => s.ruined).length : 0}</b></span>
        <span>pop <b style={{ color: "#E6E1D3" }}>{totalPop.toFixed(0)}M</b></span>
        <span>powers <b style={{ color: "#E6E1D3" }}>{liveFactions.length}</b> ({w ? w.factions.length - liveFactions.length : 0} fallen)</span>
        <span>wars <b style={{ color: wars.length ? "#E4572E" : "#E6E1D3" }}>{wars.length}</b></span>
        <span className="ml-auto italic" style={{ color: "#F2A93B" }}>{w ? w.era.name : ""}</span>
      </div>

      {/* main */}
      <div className="flex-1 flex flex-col md:flex-row min-h-0" ref={wrapRef}>
        {/* map */}
        <div className="relative flex-1 min-h-0" style={{ minHeight: "45vh" }}>
          <canvas
            ref={canvasRef}
            className="w-full h-full touch-none cursor-crosshair"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onWheel={onWheel}
          />
          {burn && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3" style={{ background: "rgba(6,9,15,0.85)" }}>
              <div style={{ fontFamily: "'Chakra Petch', sans-serif", letterSpacing: "0.2em" }} className="text-sm">
                SIMULATING HISTORY
              </div>
              <div className="w-48 h-1.5 rounded" style={{ background: "rgba(230,225,211,0.1)" }}>
                <div className="h-1.5 rounded" style={{ width: `${(burn.done / burn.total) * 100}%`, background: "#F2A93B" }} />
              </div>
              <div className="text-xs" style={{ color: "#7C8798" }}>year {burn.done} of {burn.total}</div>
            </div>
          )}
          <div className="absolute top-2 left-2 flex gap-1">
            {OVERLAYS.map((o) => (
              <button
                key={o}
                onClick={() => setOverlay(o)}
                className="px-2 py-0.5 text-xs rounded uppercase tracking-wider"
                style={{
                  fontFamily: "'Chakra Petch', sans-serif",
                  background: overlay === o ? "#F2A93B" : "rgba(12,18,28,0.85)",
                  color: overlay === o ? "#06090F" : "#7C8798",
                  border: "1px solid rgba(230,225,211,0.15)",
                }}
              >
                {o}
              </button>
            ))}
          </div>
          <div className="absolute bottom-2 left-2 text-xs px-2 py-1 rounded" style={{ background: "rgba(12,18,28,0.8)", color: "#7C8798" }}>
            {overlay === "realm" && <>drag pan · wheel zoom · tap a system | <span style={{ color: "#5CC8DA" }}>cyan</span> trade · <span style={{ color: "#E4572E" }}>red dash</span> war/siege · <span style={{ color: "#F2A93B" }}>amber ring</span> misery · <span style={{ color: "#B0453A" }}>✕</span> ruins</>}
            {overlay === "wealth" && <>dot color: <span style={{ color: "#2E3A52" }}>poor</span> → <span style={{ color: "#F2A93B" }}>rich</span> (wealth per capita)</>}
            {overlay === "life" && <>dot color: <span style={{ color: "#E4572E" }}>starving</span> → <span style={{ color: "#F2A93B" }}>strained</span> → <span style={{ color: "#6FBF73" }}>thriving</span></>}
            {overlay === "trade" && <>lane brightness = flow volume · dot color = throughput. Watch wars dim whole regions.</>}
            {overlay === "culture" && <>dot color = culture vector. Watch trade blur borders and isolation sharpen them.</>}
          </div>
        </div>

        {/* side panel */}
        <div
          className="w-full md:w-96 flex-1 md:flex-none flex flex-col min-h-0"
          style={{ background: "#0C121C", borderLeft: "1px solid rgba(230,225,211,0.12)" }}
        >
          <div className="flex" style={{ borderBottom: "1px solid rgba(230,225,211,0.12)" }}>
            {["system", "powers", "trade", "chronicle"].map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className="flex-1 py-2 text-xs uppercase tracking-widest"
                style={{
                  fontFamily: "'Chakra Petch', sans-serif",
                  color: tab === t ? "#F2A93B" : "#7C8798",
                  borderBottom: tab === t ? "2px solid #F2A93B" : "2px solid transparent",
                }}
              >
                {t}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto p-3 text-xs leading-relaxed">
            {/* SYSTEM TAB */}
            {tab === "system" && !sel && (
              <div style={{ color: "#7C8798" }}>
                Tap a system on the map to inspect it. Dots are sized by population and colored by allegiance. Everything you see emerged from the simulation — nothing is scripted.
              </div>
            )}
            {tab === "system" && sel && (
              <div className="space-y-3">
                <div>
                  <div style={{ fontFamily: "'Chakra Petch', sans-serif", fontWeight: 700 }} className="text-lg">
                    {sel.name}
                  </div>
                  <div style={{ color: "#7C8798" }}>
                    {sel.ruined
                      ? `RUINS — went dark in year ${sel.diedYear}`
                      : sel.pop <= 0.05
                        ? "Uncolonized"
                        : sel.fid !== null
                          ? <span><span style={{ color: w.factions[sel.fid].color }}>■</span> {w.factions[sel.fid].name}{w.factions[sel.fid].capital === sel.id ? " · CAPITAL" : ""}</span>
                          : "Independent"}
                    {" · "}{sel.cultName} culture
                  </div>
                </div>

                {sel.pop > 0.05 && (
                  <>
                    {sel.siege && (
                      <div className="px-2 py-1 rounded" style={{ background: "rgba(228,87,46,0.15)", color: "#E4572E", border: "1px solid rgba(228,87,46,0.4)" }}>
                        UNDER SIEGE by the {w.factions[sel.siege.by].name} since {sel.siege.since} — all trade severed
                      </div>
                    )}
                    <div className="grid grid-cols-3 gap-2">
                      <div><div style={{ color: "#7C8798" }}>pop</div><b>{sel.pop.toFixed(1)}M</b></div>
                      <div><div style={{ color: "#7C8798" }}>wealth</div><b>{sel.wealth.toFixed(0)}</b></div>
                      <div><div style={{ color: "#7C8798" }}>dev</div><b>{sel.dev.toFixed(2)}</b></div>
                    </div>
                    <div>
                      <div className="flex justify-between"><span style={{ color: "#7C8798" }}>wellbeing</span><span>{(sel.wb * 100).toFixed(0)}%</span></div>
                      <Bar v={sel.wb} color={sel.wb < 0.5 ? "#E4572E" : sel.wb < 0.65 ? "#F2A93B" : "#6FBF73"} />
                    </div>
                    {(() => {
                      const i = sel.infra;
                      const seat = w.houses.filter((h) => !h.dead && h.home === sel.id);
                      if (!i.gran && !i.gate && !i.mine && !seat.length) return null;
                      const pips = (n, max) => "●".repeat(n) + "○".repeat(max - n);
                      return (
                        <div style={{ color: "#7C8798" }} className="space-y-0.5">
                          {(i.gran > 0 || i.gate > 0 || i.mine > 0) && (
                            <div>
                              {i.gran > 0 && <span>granaries <b style={{ color: "#6FBF73" }}>{pips(i.gran, 3)}</b>  </span>}
                              {i.gate > 0 && <span>gate docks <b style={{ color: "#5CC8DA" }}>{pips(i.gate, 3)}</b>  </span>}
                              {i.mine > 0 && <span>deep mines <b style={{ color: "#E8B04B" }}>{pips(i.mine, 2)}</b></span>}
                            </div>
                          )}
                          {seat.map((h) => (
                            <div key={h.id}>seat of <b style={{ color: "#E8B04B" }}>{h.name}</b> ({h.ships.toFixed(0)} hulls)</div>
                          ))}
                        </div>
                      );
                    })()}
                    {(() => {
                      const imp = GOODS.filter((g) => sel.flow[g] > 0.3);
                      const exp = GOODS.filter((g) => sel.flow[g] < -0.3);
                      if (!imp.length && !exp.length) return null;
                      return (
                        <div style={{ color: "#7C8798" }}>
                          {exp.length > 0 && <span>exports <b style={{ color: "#6FBF73" }}>{exp.join(", ")}</b></span>}
                          {exp.length > 0 && imp.length > 0 && " · "}
                          {imp.length > 0 && <span>imports <b style={{ color: "#5CC8DA" }}>{imp.join(", ")}</b></span>}
                        </div>
                      );
                    })()}
                    {sel.trace.length > 5 && (
                      <div className="space-y-1">
                        <div style={{ color: "#7C8798" }}>last {sel.trace.length} years</div>
                        <Spark data={sel.trace.map((t) => t.p)} color="#E6E1D3" label="pop" fmt={(v) => v.toFixed(1) + "M"} />
                        <Spark data={sel.trace.map((t) => t.f)} color="#6FBF73" label="food ¤" fmt={(v) => v.toFixed(2)} />
                        <Spark data={sel.trace.map((t) => t.g)} color="#C05DD6" label="goods ¤" fmt={(v) => v.toFixed(2)} />
                      </div>
                    )}
                  </>
                )}

                <div className="space-y-1.5">
                  <div style={{ color: "#7C8798" }}>endowments</div>
                  <div className="flex items-center gap-2"><span className="w-14">fertile</span><div className="flex-1"><Bar v={sel.fert} color="#6FBF73" /></div></div>
                  <div className="flex items-center gap-2"><span className="w-14">minerals</span><div className="flex-1"><Bar v={sel.min * Math.sqrt(Math.max(0, sel.minRes / sel.minRes0))} color="#E8B04B" /></div><span style={{ color: "#7C8798" }}>{((sel.minRes / sel.minRes0) * 100).toFixed(0)}% left</span></div>
                  <div className="flex items-center gap-2"><span className="w-14">energy</span><div className="flex-1"><Bar v={sel.en * Math.sqrt(Math.max(0, sel.enRes / sel.enRes0))} color="#5CC8DA" /></div></div>
                  <div className="flex items-center gap-2"><span className="w-14">habitable</span><div className="flex-1"><Bar v={sel.hab} color="#C05DD6" /></div></div>
                </div>

                {sel.pop > 0.05 && (
                  <div>
                    <div style={{ color: "#7C8798" }} className="mb-1">market (stock · price)</div>
                    <table className="w-full">
                      <tbody>
                        {GOODS.map((g) => (
                          <tr key={g}>
                            <td className="capitalize">{g}</td>
                            <td className="text-right">{sel.stock[g].toFixed(1)}</td>
                            <td className="text-right" style={{ color: sel.price[g] > BASE_PRICE[g] * 1.8 ? "#E4572E" : sel.price[g] < BASE_PRICE[g] * 0.6 ? "#6FBF73" : "#E6E1D3" }}>
                              {sel.price[g].toFixed(2)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {sel.history.length > 0 && (
                  <div>
                    <div style={{ color: "#7C8798" }} className="mb-1">local record</div>
                    {[...sel.history].reverse().map((h, i) => (
                      <div key={i} className="mb-1">
                        <span style={{ color: "#F2A93B" }}>{h.y}</span> {h.s}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* POWERS TAB */}
            {tab === "powers" && w && (
              <div className="space-y-3">
                {liveFactions
                  .map((f) => ({ f, members: w.systems.filter((s) => s.fid === f.id && s.pop > 0.05) }))
                  .sort((a, b) => b.members.reduce((x, s) => x + s.pop, 0) - a.members.reduce((x, s) => x + s.pop, 0))
                  .map(({ f, members }) => {
                    const fp = members.reduce((a, s) => a + s.pop, 0);
                    const myWars = wars.filter(({ k }) => k.split("|").map(Number).includes(f.id));
                    return (
                      <div key={f.id} className="pb-2" style={{ borderBottom: "1px solid rgba(230,225,211,0.08)" }}>
                        <div className="flex items-center gap-2">
                          <span style={{ color: f.color }}>■</span>
                          <b>{f.name}</b>
                          <span className="ml-auto" style={{ color: "#7C8798" }}>est. {f.foundedYear}</span>
                        </div>
                        <div style={{ color: "#7C8798" }}>
                          {members.length} systems · {fp.toFixed(0)}M · treasury {f.treasury.toFixed(0)} · capital {w.systems[f.capital].name}
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <span style={{ color: "#7C8798" }}>stability</span>
                          <div className="flex-1"><Bar v={f.stability} color={f.stability < 0.35 ? "#E4572E" : "#6FBF73"} /></div>
                        </div>
                        {myWars.length > 0 && (
                          <div style={{ color: "#E4572E" }} className="mt-1">
                            at war with {myWars.map(({ k }) => {
                              const other = k.split("|").map(Number).find((x) => x !== f.id);
                              return w.factions[other].name;
                            }).join(", ")}
                          </div>
                        )}
                      </div>
                    );
                  })}
                {w.factions.filter((f) => f.dead).length > 0 && (
                  <div>
                    <div style={{ color: "#7C8798" }} className="mb-1 uppercase tracking-widest">fallen powers</div>
                    {w.factions.filter((f) => f.dead).map((f) => (
                      <div key={f.id} style={{ color: "#7C8798" }}>
                        <span style={{ color: f.color, opacity: 0.5 }}>■</span> {f.name} ({f.foundedYear}–{f.diedYear})
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* TRADE TAB */}
            {tab === "trade" && w && (
              <div className="space-y-3">
                <div>
                  <div style={{ color: "#7C8798" }} className="mb-1 uppercase tracking-widest">merchant houses</div>
                  {[...w.houses].filter((h) => !h.dead).sort((a, b) => b.wealth - a.wealth).map((h) => (
                    <div key={h.id} className="flex gap-2 mb-0.5 items-baseline">
                      <span style={{ color: "#E8B04B" }}>◆</span>
                      <span className="cursor-pointer" onClick={() => { setSelected(h.home); setTab("system"); }}>
                        <b>{h.name}</b> <span style={{ color: "#7C8798" }}>of {w.systems[h.home].name}</span>
                      </span>
                      <span className="ml-auto" style={{ color: "#7C8798" }}>
                        {h.ships.toFixed(0)} hulls · <span style={{ color: h.wealth < 0 ? "#E4572E" : "#E6E1D3" }}>{h.wealth.toFixed(0)}¤</span>
                      </span>
                    </div>
                  ))}
                  {w.houses.some((h) => h.dead) && (
                    <div style={{ color: "#7C8798" }} className="mt-1">
                      {w.houses.filter((h) => h.dead).length} house{w.houses.filter((h) => h.dead).length > 1 ? "s" : ""} ruined: {w.houses.filter((h) => h.dead).map((h) => h.name).join(", ")}
                    </div>
                  )}
                </div>
                <div>
                  <div style={{ color: "#7C8798" }} className="mb-1 uppercase tracking-widest">busiest lanes</div>
                  {[...w.edges]
                    .filter((e) => e.vol > 0.3)
                    .sort((a, b) => b.vol - a.vol)
                    .slice(0, 12)
                    .map((e, i) => {
                      const A = w.systems[e.a], B = w.systems[e.b];
                      return (
                        <div key={i} className="flex gap-2 mb-0.5">
                          <span style={{ color: "#5CC8DA", minWidth: 40, textAlign: "right" }}>{e.vol.toFixed(1)}</span>
                          <span className="cursor-pointer" onClick={() => { setSelected(A.id); setTab("system"); }}>{A.name}</span>
                          <span style={{ color: "#7C8798" }}>↔</span>
                          <span className="cursor-pointer" onClick={() => { setSelected(B.id); setTab("system"); }}>{B.name}</span>
                        </div>
                      );
                    })}
                  {w.edges.every((e) => e.vol <= 0.3) && (
                    <div style={{ color: "#7C8798" }}>The lanes are quiet. War, poverty, or self-sufficiency — check the overlays.</div>
                  )}
                </div>
                <div>
                  <div style={{ color: "#7C8798" }} className="mb-1 uppercase tracking-widest">great exporters</div>
                  {GOODS.map((g) => {
                    const top = liveSystems.filter((s) => s.flow[g] < -0.5).sort((a, b) => a.flow[g] - b.flow[g])[0];
                    return (
                      <div key={g} className="flex gap-2 mb-0.5">
                        <span className="capitalize w-14">{g}</span>
                        {top ? (
                          <span className="cursor-pointer" onClick={() => { setSelected(top.id); setTab("system"); }}>
                            {top.name} <span style={{ color: "#6FBF73" }}>({(-top.flow[g]).toFixed(1)}/yr)</span>
                          </span>
                        ) : (
                          <span style={{ color: "#7C8798" }}>no major exporter</span>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div>
                  <div style={{ color: "#7C8798" }} className="mb-1 uppercase tracking-widest">galaxy prices (mean)</div>
                  {(() => {
                    const last = w.stats.series[w.stats.series.length - 1];
                    if (!last) return null;
                    return (
                      <div className="flex gap-4">
                        <span>food <b style={{ color: last.pFood > 2 ? "#E4572E" : "#E6E1D3" }}>{last.pFood}</b></span>
                        <span>goods <b style={{ color: last.pGoods > 6 ? "#E4572E" : "#E6E1D3" }}>{last.pGoods}</b></span>
                        <span>trade vol <b style={{ color: "#5CC8DA" }}>{last.trade}</b></span>
                        <span>fleet <b style={{ color: "#E8B04B" }}>{last.fleet}</b></span>
                      </div>
                    );
                  })()}
                </div>
              </div>
            )}

            {/* CHRONICLE TAB */}
            {tab === "chronicle" && w && (
              <div>
                <div className="flex gap-1 mb-2">
                  {Object.keys(EV_FILTERS).map((fk) => (
                    <button
                      key={fk}
                      onClick={() => setEvFilter(fk)}
                      className="px-2 py-0.5 text-xs rounded uppercase tracking-wider"
                      style={{
                        fontFamily: "'Chakra Petch', sans-serif",
                        background: evFilter === fk ? "#E6E1D3" : "rgba(230,225,211,0.06)",
                        color: evFilter === fk ? "#06090F" : "#7C8798",
                      }}
                    >
                      {fk}
                    </button>
                  ))}
                </div>
                {[...w.events].reverse()
                  .filter((ev) => !EV_FILTERS[evFilter] || EV_FILTERS[evFilter].has(ev.t))
                  .slice(0, 150).map((ev, i) => {
                    const st = EV_STYLE[ev.t] || EV_STYLE.era;
                    return (
                      <div
                        key={i}
                        className="mb-1.5 flex gap-2 cursor-pointer"
                        onClick={() => { if (ev.sysId !== null) { setSelected(ev.sysId); setTab("system"); } }}
                      >
                        <span style={{ color: "#F2A93B", minWidth: 34 }}>{ev.y}</span>
                        <span style={{ color: st.c, minWidth: 52, fontWeight: 600 }}>{st.tag}</span>
                        <span style={{ color: "#C9C4B6" }}>{ev.s}</span>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
