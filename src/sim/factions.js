import {
  factionColor, FACTION_SUFFIX_AGGR, FACTION_SUFFIX_CALM,
  GOVS, PIRATE_COLORS, CORP_STATE_COLORS,
} from "./constants.js";
import { log, facRef, houseRef, sysRef } from "./events.js";

// tariffs everywhere scale with the configured multiplier, capped so a
// duty never eats more than half a cargo's value
const setTariff = (w, rng, gov) =>
  Math.min(0.5, rng.range(...GOVS[gov].tariff) * (w.cfg?.tariffs ?? 1));

export function foundFaction(w, rng, cap, spread) {
  const aggr = rng.n();
  const gov = aggr > 0.55 ? "empire" : "republic";
  const f = {
    id: w.nextFid++, capital: cap.id, gov,
    name: `${cap.name.split(" ")[0]} ${gov === "empire" ? rng.pick(FACTION_SUFFIX_AGGR) : rng.pick(FACTION_SUFFIX_CALM)}`,
    color: factionColor(w.nextFid - 1),
    aggr, expans: rng.n(), treasury: 60, stability: 0.8,
    dead: false, foundedYear: w.year,
    peakSystems: 1, peakPop: cap.pop,
    tariff: setTariff(w, rng, gov),
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
  if (w.year > 0) log(w, "found", `${f.name} proclaimed at ${cap.name}.`, cap.id, {
    actors: [facRef(f)], cause: "found.faction",
    effects: [{ k: "owner", from: null, to: f.id }],
  });
  return f;
}

export function foundPirateHaven(w, rng, sys) {
  sys.freePort = false; // whatever charter it had dies with the black flag
  const base = sys.name.split(" ")[0];
  const f = {
    id: w.nextFid++, capital: sys.id, gov: "pirate",
    name: rng.pick([
      `The ${base} Reavers`, `Corsairs of ${base}`,
      `The ${base} Black Fleet`, `${base} Freeblades`,
    ]),
    color: rng.pick(PIRATE_COLORS),
    aggr: 0.9, expans: 0.2, treasury: 20, stability: 0.6,
    dead: false, foundedYear: w.year,
    peakSystems: 1, peakPop: sys.pop,
    tariff: 0, trace: [], lootY: 0, fort: 0,
    grievance: {}, // decaying ledger of raid losses per victim faction id
  };
  sys.fid = f.id;
  w.factions.push(f);
  w.stats.c.pirateHavens++;
  log(w, "pirate", `${f.name} raise the black flag over ${sys.name}. No convoy on the nearby lanes is safe again.`, sys.id, {
    actors: [facRef(f)], targets: [sysRef(sys)], cause: "pirate.haven",
    why: "a poor free world with prey in reach and no law nearby",
    effects: [{ k: "owner", from: null, to: f.id }],
  });
  return f;
}

export function foundCorporateState(w, rng, h, sys) {
  const base = h.name.split(" ").find((word) => word !== "The") || h.name;
  const f = {
    id: w.nextFid++, capital: sys.id, gov: "corporate",
    name: rng.pick([
      `${base} Charterspace`, `${base} Concession`,
      `${base} Free Zone`, `${base} Directorate`,
    ]),
    color: rng.pick(CORP_STATE_COLORS),
    aggr: 0.1, expans: rng.range(0.3, 0.7), treasury: 80, stability: 0.8,
    dead: false, foundedYear: w.year,
    peakSystems: 1, peakPop: sys.pop,
    tariff: setTariff(w, rng, "corporate"),
    trace: [], corpId: h.id,
  };
  sys.fid = f.id;
  h.stateId = f.id;
  w.factions.push(f);
  w.stats.c.charterStates++;
  log(w, "corp", `${h.name} proclaims the ${f.name} at ${sys.name}. The boardroom becomes a government.`, sys.id, {
    actors: [houseRef(h), facRef(f)], targets: [sysRef(sys)],
    cause: "corp.charter-state",
    why: "a megacorp rich enough to want a flag of its own",
    effects: [{ k: "owner", from: null, to: f.id }],
  });
  return f;
}

export function relocateCapital(w, f) {
  const members = w.systems.filter((s) => s.fid === f.id && s.pop > 0.05);
  if (members.length) {
    members.sort((a, b) => b.pop - a.pop);
    f.capital = members[0].id;
    log(w, "cap", `The ${f.name} moves its seat to ${members[0].name}.`, members[0].id, {
      actors: [facRef(f)], cause: "politics.capital-moved",
      why: "the old seat was lost or went dark",
    });
  }
}

export function killFaction(w, f, verb, cause = "extinction") {
  f.dead = true; f.diedYear = w.year;
  if (f.corpId != null && w.houses[f.corpId]) w.houses[f.corpId].stateId = null;
  w.stats.factionDeaths.push({
    faction: f.name, gov: f.gov, founded: f.foundedYear, died: w.year,
    lifespan: w.year - f.foundedYear, cause,
    peakSystems: f.peakSystems, peakPop: +f.peakPop.toFixed(1),
  });
  const freed = [];
  for (const s of w.systems) {
    if (s.fid === f.id) { s.fid = null; freed.push(s); }
    if (s.siege && (s.siege.by === f.id || s.siege.pair.split("|").map(Number).includes(f.id))) s.siege = null;
  }
  // the richest world of a fallen power often keeps the lights on alone
  const port = freed.filter((s) => s.pop > 1 && (s.wealth > 40 || s.tradeIn > 4) && !s.freePort)
    .sort((a, b) => b.wealth - a.wealth)[0];
  if (port && f.gov !== "pirate") {
    port.freePort = true;
    w.stats.c.freePorts++;
    log(w, "found", `As the ${f.name} falls, ${port.name} declares itself a Free Port and keeps trading.`, port.id, {
      actors: [sysRef(port)], targets: [facRef(f)], cause: "found.free-port",
      why: `the fall of the ${f.name} left it masterless`,
    });
  }
  for (const k of Object.keys(w.relations))
    if (k.split("|").map(Number).includes(f.id)) delete w.relations[k];
  log(w, "collapse", `The ${f.name} ${verb}. (${f.foundedYear}–${w.year})`, null, {
    actors: [facRef(f)], systems: freed.map((s) => s.id),
    cause: `collapse.${cause}`,
    why: {
      bankruptcy: "its treasury sank past saving",
      unrest: "its stability collapsed from within",
      extinction: "its last worlds went silent",
      suppression: "its last anchorage was burned out",
    }[cause] || null,
    effects: [
      { k: "lifespan", v: w.year - f.foundedYear, u: "yr" },
      { k: "worlds-freed", d: freed.length },
    ],
  });
}
