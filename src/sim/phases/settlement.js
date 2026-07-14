import { T, GOODS } from "../constants.js";
import { dist2 } from "../util.js";
import { log, facRef, houseRef, sysRef } from "../events.js";
import { relocateCapital } from "../factions.js";
import { movePop } from "../society.js";

const ALIVE = 0.05;
const COLONY_SOURCE_COOLDOWN = 12;
const COLONY_STABILIZE_YEARS = 8;
const RESETTLE_BASE_WAIT = 60;
const RESETTLE_FAILURE_WAIT = 30;

const resettleWait = (s) => RESETTLE_BASE_WAIT + (s.failedSettlements || 0) * RESETTLE_FAILURE_WAIT;

function failureSnapshot(w, s, cause, owner, finalPop) {
  const workerWb = s.classWb?.worker ?? s.wb;
  const grainCover = s.stock.grain / Math.max(0.05, s.peakPop);
  const liveNeighbors = (w.adj[s.id] || []).filter(({ to }) => w.systems[to].pop > ALIVE).length;
  const factors = [];

  if (cause === "plague") factors.push(`Plague struck in year ${s.lastPlague}; the colony never recovered its population.`);
  if (cause === "war attrition") factors.push(`War reached the system in year ${s.lastWar}, destroying lives and supply capacity.`);
  if (cause === "famine") factors.push(`Its last famine began in year ${s.lastFamine}; food losses continued until the final evacuation.`);
  if (cause === "resource depletion") factors.push(`Only ${Math.max(0, s.minRes / s.minRes0 * 100).toFixed(1)}% of the original mineral reserves remained.`);
  if (workerWb < 0.55) factors.push(`Worker wellbeing was ${(workerWb * 100).toFixed(1)}%, below the level needed to sustain population.`);
  if (s.fert < 0.3) factors.push(`Local fertility was only ${(s.fert * 100).toFixed(1)}%; the settlement depended on imported food.`);
  if (s.flow.grain < 0.3) factors.push(`Net grain imports were ${Math.max(0, s.flow.grain).toFixed(2)} units in its final year.`);
  if (grainCover < 1) factors.push(`The last granaries held only ${grainCover.toFixed(2)} annual grain units per resident at peak population.`);
  if (liveNeighbors === 0) factors.push("No inhabited system remained within one jump to supply or receive evacuees.");
  else if (s.tradeIn < 1) factors.push(`Only ${s.tradeIn.toFixed(2)} freight units arrived in its final year despite ${liveNeighbors} inhabited neighbor${liveNeighbors === 1 ? "" : "s"}.`);
  if (owner) factors.push(`Its owner, the ${owner.name}, held ${owner.treasury.toFixed(1)} credits at ${(owner.stability * 100).toFixed(1)}% stability.`);

  return {
    year: w.year,
    cause,
    ownerId: owner?.id ?? null,
    ownerName: owner?.name ?? null,
    settledYear: s.settledYear,
    age: s.settledYear === null ? null : w.year - s.settledYear,
    peakPop: +s.peakPop.toFixed(3),
    finalPop: +finalPop.toFixed(4),
    wellbeing: +s.wb.toFixed(4),
    workerWellbeing: +workerWb.toFixed(4),
    fertility: +s.fert.toFixed(4),
    grainCover: +grainCover.toFixed(4),
    grainImports: +(s.flow.grain || 0).toFixed(4),
    tradeIn: +(s.tradeIn || 0).toFixed(4),
    liveNeighbors,
    mineralRemaining: +(s.minRes / s.minRes0).toFixed(4),
    factors,
  };
}

// --- migration, colonization, infrastructure, and system death ---
export function runSettlement(w, rng, alive) {
  // New colonies remain a fiscal responsibility, not disposable dots on the
  // map. For their first fifteen years the owning power (or their free-world
  // parent) maintains a two-year strategic grain reserve when it can afford it.
  for (const colony of alive) {
    const age = colony.settledYear === null ? Infinity : w.year - colony.settledYear;
    if (colony.settledYear <= 0 || age < 0 || age > 15) continue;
    const need = Math.max(0, colony.pop * 2 - colony.stock.grain);
    if (need <= 0.05) continue;
    const owner = colony.fid !== null ? w.factions[colony.fid] : null;
    const parent = colony.colonyFrom != null ? w.systems[colony.colonyFrom] : null;
    const cost = need * 0.4;
    if (owner && !owner.dead && owner.treasury > cost + 20) {
      owner.treasury -= cost;
      colony.stock.grain += need;
    } else if (parent && parent.pop > ALIVE && parent.wealth > cost + 25) {
      parent.wealth -= cost;
      colony.stock.grain += need;
    }
  }

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
    const owner = s.fid !== null ? w.factions[s.fid] : null;
    const youngColony = owner && w.systems.some((o) =>
      o.fid === owner.id && o.id !== s.id && o.settledYear > 0 &&
      w.year - o.settledYear < COLONY_STABILIZE_YEARS);
    const canFinance = owner
      ? !owner.dead && owner.treasury > 20 + w.systems.filter((o) => o.fid === owner.id && o.pop > ALIVE).length * 2
      : s.wealth > 60;
    // Wellbeing already measures whether food and other needs were actually
    // met this year. Pair it with cash and a famine-free decade rather than a
    // raw grain-stock floor (grain is intentionally perishable in economy.js).
    const sourceSurplus = s.wealth > 35 && w.year - s.lastFamine > 8;
    if (
      s.wb > 0.7 && s.pop > 10 && sourceSurplus && canFinance && !youngColony &&
      w.year - (s.lastColonyYear ?? -99) >= COLONY_SOURCE_COOLDOWN &&
      rng.chance(0.075 * w.cfg.migration)
    ) {
      const target = w.adj[s.id]
        .map(({ to }) => w.systems[to])
        .filter((o) =>
          o.pop <= 0.05 && o.hab > 0.3 &&
          (!o.ruined || w.year - o.diedYear > resettleWait(o))
        )
        .sort((a, b) => (b.fert * 2 + b.min + b.rare) - (a.fert * 2 + a.min + a.rare))[0];
      if (target) {
        // a megacorp may bankroll the expedition for a share of its trade —
        // unless the credit market is frozen and no charter gets financed
        const backer = w.credit.crunch > 0 ? null : w.houses.find(
          (h) => !h.dead && h.corp && h.wealth > 180 &&
            dist2(w.systems[h.home], target) < T.HOUSE_RANGE * 1.3
        );
        const sponsored = !!backer && rng.chance(0.35);
        // land that can't feed a family is a prospector colony:
        // corp-provisioned to mine the veins, or not settled at all
        const priorStructuralFailure = target.failure && ["famine", "economic decline", "resource depletion"].includes(target.failure.cause);
        const viable = priorStructuralFailure
          ? target.fert >= 0.58 || (sponsored && target.min + target.rare > 0.9)
          : target.fert >= 0.34 || (sponsored && target.min + target.rare > 0.75);
        if (viable) {
          const m = Math.min(3.5, Math.max(1.5, s.pop * 0.08));
          target.pop = 0;
          movePop(s, target, m); // colony ships fill from the lower decks
          s.lastColonyYear = w.year;
          if (owner) owner.treasury -= 12;
          else s.wealth -= 15;
          target.fid = s.fid; target.dev = 0.6;
          target.colonyFrom = s.id;
          target.freePort = false; // a colony raised under a flag is no free port
          target.unrest = 0; target.riotCd = 0;
          target.stock.grain = m * 8; target.stock.consumer = m * 2;
          target.stock.medicine = Math.max(target.stock.medicine, m * 0.2);
          // the first generation plants fields before it builds factories
          target.shares = Object.fromEntries(
            GOODS.map((g) => [g, g === "grain" ? 0.55 : 0.45 / (GOODS.length - 1)])
          );
          const wasRuin = target.ruined;
          target.ruined = false;
          target.failure = null;
          target.settledYear = w.year; target.peakPop = m;
          target.lastFamine = -99; target.lastPlague = -99; target.lastWar = -99;
          target.faith = s.faith; target.sponsor = null;
          // a fresh colony inherits none of the dead world's underworld —
          // no bonded population, no narcotics stock, no addicted underclass
          target.slaves = 0; target.drugs = 0; target.drugLoad = 0;

          if (sponsored) {
            backer.wealth -= 25;
            target.sponsor = backer.id;
            target.dev = 0.75;
            target.stock.grain += m * 4; target.stock.consumer += m;
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
            target.id, {
              actors: target.sponsor !== null
                ? [sysRef(s), houseRef(target.sponsor)]
                : [sysRef(s)],
              targets: [sysRef(target)],
              systems: [s.id],
              cause: wasRuin ? "colony.resettled" : "colony.founded",
              why: "a thriving world's surplus went looking for land next door",
              effects: [
                { k: "pop", d: m, u: "M" },
                ...(target.fid !== null ? [{ k: "owner", from: null, to: target.fid }] : []),
              ],
            });
        }
      }
    }
  }

  // infrastructure: rich systems turn wealth into durable capital
  for (const s of alive) {
    if (s.wealth > T.BUILD_WEALTH && rng.chance(0.15)) {
      const i = s.infra;
      let what = null, kind = null;
      if (s.fert > 0.45 && i.gran < 3) { i.gran++; s.wealth -= 25 * i.gran; what = `raises new orbital granaries (level ${i.gran})`; kind = "gran"; }
      else if (s.tradeIn > 15 && i.gate < 3) { i.gate++; s.wealth -= 30; what = `expands its jumpgate docks (level ${i.gate})`; kind = "gate"; }
      else if (s.min > 0.5 && s.minRes / s.minRes0 < 0.4 && i.mine < 2) { i.mine++; s.wealth -= 40; what = `sinks deep shafts into the played-out veins (level ${i.mine})`; kind = "mine"; }
      else if (i.gran < 3) { i.gran++; s.wealth -= 25 * i.gran; what = `raises new orbital granaries (level ${i.gran})`; kind = "gran"; }
      if (what) {
        w.stats.c.build++;
        log(w, "build", `${s.name} ${what}.`, s.id, {
          actors: [sysRef(s)], cause: `build.${kind}`,
          why: "surplus wealth turned into durable capital",
          effects: [{ k: kind, v: i[kind] }],
        });
      }
    }
  }

  // system death
  for (const s of w.systems) {
    if (s.pop > 0 && s.pop < 0.05 && !s.ruined) {
      const finalPop = s.pop;
      let cause = "economic decline";
      if (w.year - s.lastPlague <= 8) cause = "plague";
      else if (w.year - s.lastWar <= 6) cause = "war attrition";
      else if (s.min > 0.35 && s.minRes / s.minRes0 < 0.08) cause = "resource depletion";
      else if (w.year - s.lastFamine <= 10) cause = "famine";
      const f = s.fid !== null ? w.factions[s.fid] : null;
      s.failure = failureSnapshot(w, s, cause, f, finalPop);
      s.failedSettlements = (s.failedSettlements || 0) + 1;
      s.ruined = true; s.diedYear = w.year; s.pop = 0;
      w.stats.deaths.push({
        system: s.name, year: w.year,
        age: s.settledYear === null ? null : w.year - s.settledYear,
        peakPop: +s.peakPop.toFixed(1), cause, failure: s.failure,
      });
      s.siege = null;
      s.freePort = false;
      // a dead world holds nothing: its bonded population perishes with it and
      // its underworld goes dark. Clearing here (not only on resettlement) keeps
      // a ruin's state consistent — no ghost slaves or narcotics on a corpse.
      s.slaves = 0; s.drugs = 0; s.drugLoad = 0;
      s.fid = null;
      const deathText = {
        plague: `${s.name} goes dark — the last quarantine beacon fails in ${w.year}.`,
        "war attrition": `${s.name} goes dark, ground to dust by the war. No one remains to surrender.`,
        "resource depletion": `${s.name} goes dark. The mines gave out, the money left, and then the people did.`,
        famine: `${s.name} goes dark — starved to silence. The last transmissions beg for grain that never came.`,
        "economic decline": `${s.name} goes dark, forgotten by the trade lanes long before the end.`,
      }[cause];
      log(w, "death", deathText, s.id, {
        actors: [sysRef(s)],
        targets: f ? [facRef(f)] : [],
        cause: `death.${{
          plague: "plague", "war attrition": "war", "resource depletion": "depletion",
          famine: "famine", "economic decline": "decline",
        }[cause]}`,
        why: {
          plague: "the last plague broke it",
          "war attrition": "the war ground it to dust",
          "resource depletion": "its veins gave out and the money left",
          famine: "the hunger years starved it to silence",
          "economic decline": "the trade lanes forgot it long before the end",
        }[cause],
        effects: [
          { k: "pop", v: 0, u: "M" },
          { k: "peak-pop", v: +s.peakPop.toFixed(1), u: "M" },
          ...(f ? [{ k: "owner", from: f.id, to: null }] : []),
        ],
      });
      if (f && f.capital === s.id) relocateCapital(w, f);
    }
  }
}
