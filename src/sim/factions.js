import { factionColor, FACTION_SUFFIX_AGGR, FACTION_SUFFIX_CALM } from "./constants.js";
import { log } from "./events.js";

export function foundFaction(w, rng, cap, spread) {
  const aggr = rng.n();
  const f = {
    id: w.nextFid++, capital: cap.id,
    name: `${cap.name.split(" ")[0]} ${aggr > 0.55 ? rng.pick(FACTION_SUFFIX_AGGR) : rng.pick(FACTION_SUFFIX_CALM)}`,
    color: factionColor(w.nextFid - 1),
    aggr, expans: rng.n(), treasury: 60, stability: 0.8,
    dead: false, foundedYear: w.year,
    peakSystems: 1, peakPop: cap.pop,
    tariff: rng.range(0.05, 0.25),
    trace: [],
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

export function relocateCapital(w, f) {
  const members = w.systems.filter((s) => s.fid === f.id && s.pop > 0.05);
  if (members.length) {
    members.sort((a, b) => b.pop - a.pop);
    f.capital = members[0].id;
    log(w, "cap", `The ${f.name} moves its seat to ${members[0].name}.`, members[0].id);
  }
}

export function killFaction(w, f, verb, cause = "extinction") {
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
