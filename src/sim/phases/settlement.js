import { T, GOODS } from "../constants.js";
import { dist2 } from "../util.js";
import { log } from "../events.js";
import { relocateCapital } from "../factions.js";
import { movePop } from "../society.js";

// --- migration, colonization, infrastructure, and system death ---
export function runSettlement(w, rng, alive) {
  // migration & colonization
  for (const s of alive) {
    if (s.wb < 0.55 && s.pop > 0.1 && !s.siege) {
      const frac = (0.55 - s.wb) * 0.35 * w.cfg.migration;
      const dest = w.adj[s.id]
        .map(({ to }) => w.systems[to])
        .filter((o) => o.pop > 0.05 && !o.siege && o.wb > s.wb + 0.02)
        .sort((a, b) => b.wb - a.wb)[0];
      if (dest) movePop(s, dest, s.pop * frac);
    }
    // found colonies on empty (or long-dead) habitable neighbors.
    // Settlers weigh the land before they board: farmland first, ore
    // money second. Nobody bets their children on barren dust — unless
    // a megacorp pays the freight to get at the veins beneath it.
    if (s.wb > 0.7 && s.pop > 8 && rng.chance(0.09 * w.cfg.migration)) {
      const target = w.adj[s.id]
        .map(({ to }) => w.systems[to])
        .filter((o) =>
          o.pop <= 0.05 && o.hab > 0.3 &&
          (!o.ruined || w.year - o.diedYear > 25)
        )
        .sort((a, b) => (b.fert * 2 + b.min + b.rare) - (a.fert * 2 + a.min + a.rare))[0];
      if (target) {
        // a megacorp may bankroll the expedition for a share of its trade
        const backer = w.houses.find(
          (h) => !h.dead && h.corp && h.wealth > 180 &&
            dist2(w.systems[h.home], target) < T.HOUSE_RANGE * 1.3
        );
        const sponsored = !!backer && rng.chance(0.35);
        // land that can't feed a family is a prospector colony:
        // corp-provisioned to mine the veins, or not settled at all
        const viable = target.fert >= 0.3 || (sponsored && target.min + target.rare > 0.7);
        if (viable) {
          const m = Math.min(2.0, s.pop * 0.07);
          target.pop = 0;
          movePop(s, target, m); // colony ships fill from the lower decks
          target.fid = s.fid; target.dev = 0.6;
          target.unrest = 0; target.riotCd = 0;
          target.stock.grain = m * 4; target.stock.consumer = m;
          // the first generation plants fields before it builds factories
          target.shares = Object.fromEntries(
            GOODS.map((g) => [g, g === "grain" ? 0.55 : 0.45 / (GOODS.length - 1)])
          );
          const wasRuin = target.ruined;
          target.ruined = false;
          target.settledYear = w.year; target.peakPop = m;
          target.lastFamine = -99; target.lastPlague = -99; target.lastWar = -99;
          target.faith = s.faith; target.sponsor = null;

          if (sponsored) {
            backer.wealth -= 25;
            target.sponsor = backer.id;
            target.dev = 0.75;
            target.stock.grain += m * 3; target.stock.consumer += m;
            target.stock.medicine += m * 0.2;
            backer.sponsored.push({ sys: target.id, until: w.year + 60 });
            w.stats.c.colonySponsored++;
          }

          w.stats.c[wasRuin ? "resettle" : "colony"]++;
          log(w, "colony",
            target.sponsor !== null
              ? `${s.name} founds a colony at ${target.name}, its holds and habitats paid for by ${w.houses[target.sponsor].name}.`
              : wasRuin
                ? `Settlers from ${s.name} raise new towers over the ruins of ${target.name}.`
                : `${s.name} founds a colony at ${target.name}.`,
            target.id);
        }
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
      s.freePort = false;
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
