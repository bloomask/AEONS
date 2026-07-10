import { T } from "../constants.js";
import { log } from "../events.js";
import { relocateCapital } from "../factions.js";

// --- migration, colonization, infrastructure, and system death ---
export function runSettlement(w, rng, alive) {
  // migration & colonization
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

  // infrastructure: rich systems turn wealth into durable capital
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

  // system death
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
}
