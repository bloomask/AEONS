import { log } from "../events.js";

// --- yearly statistics snapshot, history traces, and era detection ---
export function recordYear(w, rng) {
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
