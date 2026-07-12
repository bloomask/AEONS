import { T, GOOD_LABEL } from "./constants.js";
import { dist2 } from "./util.js";
import { genHouseName } from "./names.js";
import { log } from "./events.js";

export function foundHouse(w, rng, home, ships, wealth) {
  const h = {
    id: w.houses.length, name: genHouseName(rng, home),
    home: home.id, wealth, ships, dead: false,
    foundedYear: w.year, diedYear: null, peakWealth: wealth,
    corp: false, corpYear: null, stateId: null, depots: [], sponsored: [],
    feud: null, absorbedBy: null,
    income: 0, incFreight: 0, incDepots: 0, incColonies: 0, trace: [],
  };
  w.houses.push(h);
  if (w.year > 0) {
    w.stats.c.houseFounded++;
    log(w, "house", `${h.name} is chartered at ${home.name}, ${ships.toFixed(0)} hulls under its banner.`, home.id);
  }
  return h;
}

// --- rivalries, cartels, and hostile takeovers ---
// Commerce with teeth: rich corps corner markets together, rival houses
// bleed each other in the dark, and the strong swallow the faltering.
const CARTEL_GOODS = ["rares", "fuel", "medicine", "electronics"];
const CARTEL_NAMES = ["Compact", "Ring", "Syndicate", "Combine", "Consortium"];

export function runHouseIntrigues(w, rng) {
  const live = w.houses.filter((h) => !h.dead);

  // --- cartels ---
  // collapse first: a cartel dies with a member, or simply falls to quarrel
  for (const c of w.cartels) {
    if (c.ended !== null) continue;
    const memberDied = c.members.some((hid) => w.houses[hid].dead);
    if (memberDied || rng.chance(0.05)) {
      c.ended = w.year;
      w.stats.c.cartelBroken++;
      log(w, "corp", memberDied
        ? `The ${c.name} dissolves with the ruin of its members; ${GOOD_LABEL[c.good]} prices tumble overnight.`
        : `The ${c.name} breaks apart amid accusations of secret discounts. The ${GOOD_LABEL[c.good]} market is free again — for now.`);
    }
  }
  // formation: two or three rich corps corner a high-value good
  const cartelized = new Set(w.cartels.filter((c) => c.ended === null).map((c) => c.good));
  const inCartel = new Set(w.cartels.filter((c) => c.ended === null).flatMap((c) => c.members));
  for (const g of CARTEL_GOODS) {
    if (cartelized.has(g)) continue;
    const cands = live.filter((h) => h.corp && h.wealth > 200 && !inCartel.has(h.id));
    if (cands.length < 2 || !rng.chance(0.02)) continue;
    const members = cands.sort((a, b) => b.wealth - a.wealth).slice(0, rng.chance(0.4) ? 3 : 2).map((h) => h.id);
    const name = `The ${GOOD_LABEL[g][0].toUpperCase() + GOOD_LABEL[g].slice(1)} ${rng.pick(CARTEL_NAMES)}`;
    w.cartels.push({ id: w.cartels.length, name, good: g, members, since: w.year, ended: null });
    members.forEach((hid) => inCartel.add(hid));
    cartelized.add(g);
    w.stats.c.cartelFormed++;
    log(w, "corp", `${name} is signed in a closed room: ${members.map((hid) => w.houses[hid].name).join(" and ")} will set the price of ${GOOD_LABEL[g]} together.`);
  }
  // the skim: importers pay a private duty on every cartelized unit
  w.cartelMul = {};
  for (const c of w.cartels) {
    if (c.ended !== null) continue;
    w.cartelMul[c.good] = 1.12;
    let take = 0;
    for (const s of w.systems) {
      if (s.pop <= 0.05 || s.flow[c.good] <= 0.1) continue;
      const levy = Math.min(s.wealth * 0.02, s.flow[c.good] * s.price[c.good] * 0.06);
      if (levy <= 0) continue;
      s.wealth -= levy;
      take += levy;
    }
    for (const hid of c.members) w.houses[hid].wealth += take / c.members.length;
  }

  // --- feuds ---
  for (const h of live) {
    if (h.feud === null) continue;
    const r = w.houses[h.feud];
    if (r.dead || r.feud !== h.id) { h.feud = null; continue; }
    if (h.id > r.id) continue; // handle each pair once
    // sabotage, poached contracts, security retainers — both bleed
    h.wealth -= h.wealth * 0.012 + 0.5;
    r.wealth -= r.wealth * 0.012 + 0.5;
    if (rng.chance(0.06)) {
      const [victim, culprit] = rng.chance(0.5) ? [h, r] : [r, h];
      victim.ships *= 0.94;
      victim.wealth -= 8;
      w.stats.c.raids++;
      log(w, "raid", `Freighters of ${victim.name} burn in the roads off ${w.systems[victim.home].name}. No flag claims the deed; everyone names ${culprit.name}.`, victim.home);
    }
    if (rng.chance(0.05)) {
      h.feud = null; r.feud = null;
      log(w, "house", `${h.name} and ${r.name} end their feud over a table at a neutral port. The insurers breathe again.`);
      continue;
    }
    // the kill: a giant swallows a bleeding rival
    const [big, small] = h.wealth > r.wealth ? [h, r] : [r, h];
    if (big.wealth > small.wealth * 3 + 100 && small.wealth < 80) {
      big.wealth -= Math.max(0, small.wealth) * 0.5 + 40;
      big.ships += small.ships * 0.8;
      small.dead = true; small.diedYear = w.year; small.absorbedBy = big.id;
      small.feud = null; big.feud = null;
      w.stats.c.takeover++;
      log(w, "corp", `${big.name} swallows ${small.name} whole — hulls reflagged, name struck from the registries after ${w.year - small.foundedYear} years.`, big.home);
    }
  }
  // new feuds: two rich houses working the same waters
  if (rng.chance(0.08)) {
    const free = live.filter((h) => h.feud === null && h.wealth > 120 && !h.dead);
    for (let i = 0; i < free.length; i++) {
      for (let j = i + 1; j < free.length; j++) {
        const a = free[i], b = free[j];
        if (dist2(w.systems[a.home], w.systems[b.home]) > T.HOUSE_RANGE) continue;
        if (!rng.chance(0.3)) continue;
        a.feud = b.id; b.feud = a.id;
        w.stats.c.feudStarted++;
        log(w, "house", `${a.name} and ${b.name} fall into open feud over the same lanes. Dockside brawls first; burnt manifests will follow.`);
        return; // at most one new feud a year
      }
    }
  }

  // --- salvage: a bankrupt house's hulls go to the richest bidder ---
  for (const h of w.houses) {
    if (!h.dead || h.diedYear !== w.year || h.absorbedBy !== null || h.ships < 5) continue;
    const buyer = live.filter((b) => !b.dead && b.wealth > 150).sort((a, b) => b.wealth - a.wealth)[0];
    if (!buyer) continue;
    const hulls = h.ships * 0.5;
    const price = hulls * T.SHIP_COST * 0.4;
    buyer.wealth -= price;
    buyer.ships += hulls;
    log(w, "house", `${buyer.name} buys ${hulls.toFixed(0)} seized hulls of ${h.name} at auction, for ${price.toFixed(0)}cr on the credit.`, buyer.home);
  }
}
