import { T, GOOD_LABEL, BASE_PRICE } from "./constants.js";
import { carryCap } from "./config.js";
import { relKey } from "./events.js";
import { clamp, dist2 } from "./util.js";

// ---------- system diagnostics ----------
// Reads a settled system against the same thresholds the simulation itself
// uses (growth, famine, riots, depletion, crowding...) and names everything
// that is holding it back. The contract: a system with an empty problem
// list is above the growth threshold and free of shocks — left alone, it
// thrives. Anything short of that shows up here with a reason.

export const SEV_CRISIS = 2, SEV_WARNING = 1, SEV_WATCH = 0;

const RAID_RANGE = 150; // matches phases/pirates.js

export function diagnoseSystem(w, s) {
  const out = [];
  const add = (sev, tag, text) => out.push({ sev, tag, text });
  if (s.pop <= 0.05) return out;
  const yr = w.year;
  const pct = (v) => (v * 100).toFixed(0) + "%";

  // --- war on the doorstep ---
  let frontier = 0, embargoed = 0, liveNeighbors = 0;
  for (const { to } of w.adj[s.id] || []) {
    const o = w.systems[to];
    if (o.pop > 0.05) liveNeighbors++;
    if (s.fid !== null && o.fid !== null && o.fid !== s.fid) {
      const r = w.relations[relKey(s.fid, o.fid)];
      if (r?.war) frontier++;
      else if (r?.embargo) embargoed++;
    }
  }
  if (s.siege) {
    add(SEV_CRISIS, "siege",
      `Besieged by the ${w.factions[s.siege.by].name} since ${s.siege.since} — nothing flies in or out, and the granaries will not be refilled.`);
  } else if (frontier > 0) {
    add(SEV_CRISIS, "front line",
      `${frontier} neighboring gate${frontier > 1 ? "s are" : " is"} held by an enemy power — battle can reach this system any year.`);
  } else if (yr - s.lastWar <= 4) {
    add(SEV_WARNING, "war-torn",
      `Fighting reached this system in ${s.lastWar}; the docks and fields still bear the scars.`);
  }
  if (embargoed > 0) {
    add(SEV_WARNING, "embargo",
      `${embargoed} neighboring lane${embargoed > 1 ? "s are" : " is"} closed by embargo — trade must route the long way around.`);
  }

  // --- hunger, the killer of worlds ---
  if (s.classWb.worker < 0.45) {
    add(SEV_CRISIS, "hunger",
      `The workers go hungry (${pct(s.classWb.worker)} of their needs met) — famine and flight are one bad harvest away.`);
  } else if (s.classWb.worker < 0.6) {
    add(SEV_WARNING, "hunger",
      `Ration lines in the lower quarters: the workers meet only ${pct(s.classWb.worker)} of their needs.`);
  }
  if (yr - s.lastFamine <= 5) {
    add(SEV_CRISIS, "famine",
      `Famine struck in ${s.lastFamine}. The dead are counted, the granaries are still empty.`);
  } else if (yr - s.lastFamine <= 15) {
    add(SEV_WATCH, "famine",
      `Still recovering from the famine of ${s.lastFamine}.`);
  }
  if (s.fert < 0.15 && s.flow.grain < 0.3) {
    add(SEV_WARNING, "barren",
      `Barren fields and no steady grain imports — this world eats only what the freighters happen to bring.`);
  }

  // --- scarcity: staples far dearer than the going galactic rate ---
  // measured against the live galactic mean, not BASE_PRICE: when the whole
  // galaxy is expensive that is the credit inflating, not this world failing
  const live = w.systems.filter((o) => o.pop > 0.05);
  for (const [g, warnAt, crisisAt] of [
    ["grain", 2, 3.5], ["fuel", 2, 3.5], ["medicine", 2, 3.5],
  ]) {
    const avg = live.reduce((a, o) => a + o.price[g], 0) / Math.max(1, live.length);
    const ratio = s.price[g] / Math.max(BASE_PRICE[g] * 0.15, avg);
    if (ratio >= crisisAt) {
      add(SEV_CRISIS, "scarcity",
        `${GOOD_LABEL[g]} trades at ×${ratio.toFixed(1)} the galactic going rate — priced out of common reach.`);
    } else if (ratio >= warnAt) {
      add(SEV_WARNING, "scarcity",
        `${GOOD_LABEL[g]} is scarce here: ×${ratio.toFixed(1)} the galactic going rate.`);
    }
  }

  // --- plague aftermath ---
  if (yr - s.lastPlague <= 3) {
    add(SEV_WARNING, "plague",
      `Plague swept this system in ${s.lastPlague}; the quarantine beacons only just went dark.`);
  } else if (yr - s.lastPlague <= 12) {
    add(SEV_WATCH, "plague",
      `Still recovering from the plague of ${s.lastPlague}.`);
  }

  // --- crowding against the world's carrying capacity ---
  const capPop = carryCap(w, s);
  if (s.pop > capPop * 1.25) {
    add(SEV_CRISIS, "crowding",
      `${(s.pop / capPop).toFixed(1)}× more people than this world can carry — crowding crushes wellbeing across every class.`);
  } else if (s.pop > capPop) {
    add(SEV_WARNING, "crowding",
      `Past its habitable limit — every soul above ${capPop.toFixed(0)}M drags wellbeing down.`);
  } else if (s.pop > capPop * 0.9) {
    add(SEV_WATCH, "crowding",
      `Nearing its habitable limit of ${capPop.toFixed(0)}M; growth will soon press against the domes.`);
  }

  // --- the ground giving out ---
  const mr = s.minRes / s.minRes0;
  if (s.min > 0.35) {
    if (mr < 0.08) {
      add(SEV_CRISIS, "depletion",
        `The great veins are all but exhausted (${pct(mr)} left) — the ore money is gone and worlds like this go dark.`);
    } else if (mr < 0.3) {
      add(SEV_WARNING, "depletion",
        `The mines are running dry: ${pct(mr)} of the original veins remain.`);
    }
  }
  const er = s.enRes / s.enRes0;
  if (s.en > 0.3 && er < 0.25) {
    add(SEV_WARNING, "fuel wells",
      `Energy reserves down to ${pct(er)} — the fuel that lit this system is running out.`);
  }

  // --- the social pyramid straining ---
  if (s.unrest > 0.8) {
    add(SEV_CRISIS, "unrest",
      `Unrest at ${pct(s.unrest)} — insurrection brews; the next riot burns wealth and stock.`);
  } else if (s.unrest > 0.45) {
    add(SEV_WARNING, "unrest",
      `Unrest simmers at ${pct(s.unrest)}; the lower quarters are counting who eats.`);
  }
  const gap = s.classWb.elite - s.classWb.worker;
  if (gap > 0.35) {
    add(SEV_WARNING, "inequality",
      `The towers dine while the tenements queue — the gap between elite and worker wellbeing (${pct(gap)}) feeds the unrest.`);
  }
  const rich = clamp(s.wealth / (s.pop * 10 + 1), 0, 2);
  const top = s.classes.upper + s.classes.elite;
  if (top > 0.1 + rich * 0.25 + 0.05) {
    add(SEV_WATCH, "top-heavy",
      `More lords than the economy beneath them can carry (${pct(top)} in the upper strata) — old money is sliding back down.`);
  }

  // --- empty coffers ---
  if (s.wealth < 0) {
    add(SEV_WARNING, "debt",
      `The treasury is ${(-s.wealth).toFixed(0)} cr in the red — no imports, no granaries, no docks until it recovers.`);
  } else if (s.wealth < 15) {
    add(SEV_WATCH, "poor",
      `Coffers nearly empty (${s.wealth.toFixed(0)} cr) — one bad year from debt, nothing spare to build with.`);
  }

  // --- cut off from the lanes ---
  if (liveNeighbors === 0) {
    add(SEV_WARNING, "isolated",
      `No living neighbor within one jump — whatever this world cannot make, it does without.`);
  }

  // --- corsairs within reach ---
  for (const f of w.factions) {
    if (f.dead || f.gov !== "pirate" || f.id === s.fid) continue;
    const near = w.systems.some((o) => o.fid === f.id && o.pop > 0.05 && dist2(o, s) < RAID_RANGE);
    if (near) {
      add(SEV_WARNING, "corsairs",
        `${f.name} holds an anchorage within raiding range — every busy lane here pays their toll.`);
      break;
    }
  }

  // --- the bottom line: below the growth threshold, a world shrinks ---
  // this check is what makes the contract hold: no problems ⇒ growing
  if (s.wb < 0.55) {
    add(SEV_WARNING, "decline",
      `Wellbeing at ${pct(s.wb)} — births lag deaths, and emigrants board every outbound freighter.`);
  } else if (s.wb <= T.GROWTH_THRESHOLD) {
    add(SEV_WARNING, "stagnation",
      `Wellbeing at ${pct(s.wb)}, just under the growth threshold (${pct(T.GROWTH_THRESHOLD)}) — the population quietly thins.`);
  }

  return out.sort((a, b) => b.sev - a.sev);
}
