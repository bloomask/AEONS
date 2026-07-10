import { T, GOODS, FREIGHT_COST } from "../constants.js";
import { dist2 } from "../util.js";
import { log, getRel } from "../events.js";
import { foundHouse } from "../houses.js";

// --- shipping, trade, and merchant-house economics ---
export function runTrade(w, rng) {
  // shipping allocation: houses put hulls on the best lanes near home
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
      m = Math.max(m, Math.abs(B.price[g] - A.price[g]) - (e.d / 220) * FREIGHT_COST[g] * gf);
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

  // trade: arbitrage across gates, limited by hulls, taxed at borders
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
      const cost = (e.d / 220) * FREIGHT_COST[g] * gf + 0.05;
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

  // house economics: freight profit, upkeep, fleets, fortunes, ruin
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
}
