import { clamp, jumpHops } from "../util.js";
import { T } from "../constants.js";
import { log, facRef, sysRef } from "../events.js";
import { foundPirateHaven, killFaction } from "../factions.js";

// lane volume a ship based at `sysId` can reach through the gates —
// the quality of the hunting grounds
function reachableVolume(w, sysId) {
  const hops = jumpHops(w, [sysId], T.RAID_JUMPS);
  let vol = 0;
  for (const e of w.edges) {
    const ha = hops[e.a], hb = hops[e.b];
    if ((ha >= 0 && ha <= T.RAID_JUMPS) || (hb >= 0 && hb <= T.RAID_JUMPS)) vol += e.vol;
  }
  return vol;
}

// where does the black flag rise? Where prey passes and law does not:
// candidates are weighted by the trade within striking range times the
// distance in gates to the nearest state-owned world. Nassau, not nowhere.
function pickHavenSite(w, rng, cands) {
  const lawSources = [];
  for (const s of w.systems) {
    if (s.pop <= 0.05 || s.fid === null) continue;
    const f = w.factions[s.fid];
    if (f && !f.dead && f.gov !== "pirate") lawSources.push(s.id);
  }
  const lawHops = jumpHops(w, lawSources, 6);
  // no crew anchors where there is nothing to steal: a site needs real
  // traffic within striking range to be worth founding at all
  const scouted = cands
    .map((s) => ({ s, vol: reachableVolume(w, s.id) }))
    .filter(({ vol }) => vol >= 12);
  if (!scouted.length) return null;
  const weights = scouted.map(({ s, vol }) => {
    const h = lawHops[s.id] < 0 ? 7 : lawHops[s.id];
    return vol * (1 + h);
  });
  let r = rng.n() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < scouted.length; i++) {
    r -= weights[i];
    if (r <= 0) return scouted[i].s;
  }
  return scouted[scouted.length - 1].s;
}

// --- corsairs: lawless power that lives on the lanes of others ---
// Everything here runs on the jumpgate graph, not straight-line distance:
// a haven raids what its ships can reach through the gates, and a state
// strikes back with what it can project down those same lanes. Remoteness
// is not a buff — it is geography working both ways.
export function runPirates(w, rng, alive) {
  // desperation breeds havens: poor free systems raise the black flag.
  // The year after a war ends, the odds jump — demobilized privateer
  // crews don't go home, they go looking for an anchorage.
  const havens = w.factions.filter((f) => !f.dead && f.gov === "pirate");
  const demob = w.stats.wars.some((r) => r.end === w.year) ? 4 : 1;
  if (havens.length < 5 && rng.chance(0.05 * demob * w.cfg.piracy)) {
    const cands = alive.filter((s) => s.fid === null && s.wb < 0.6 && s.pop > 0.5);
    const site = cands.length ? pickHavenSite(w, rng, cands) : null;
    if (site) foundPirateHaven(w, rng, site);
  }

  for (const f of w.factions) {
    if (f.dead || f.gov !== "pirate") continue;
    const members = w.systems.filter((s) => s.fid === f.id && s.pop > 0.05);
    if (!members.length) continue; // the politics phase buries empty factions

    // one map serves both sides: gates outward from the haven
    const hops = jumpHops(w, members.map((m) => m.id), Math.max(T.RAID_JUMPS, T.SUPP_JUMPS));

    // old grievances fade — but this year's raids are added below
    if (!f.grievance) f.grievance = {};
    for (const k of Object.keys(f.grievance)) {
      f.grievance[k] *= T.GRIEVANCE_DECAY;
      if (f.grievance[k] < 0.3) delete f.grievance[k];
    }

    // raiding: skim every busy lane the ships can reach through the gates
    let loot = 0;
    let richest = null;
    for (const e of w.edges) {
      if (e.vol < 0.3) continue;
      const A = w.systems[e.a], B = w.systems[e.b];
      if (A.fid === f.id || B.fid === f.id) continue; // don't eat your own port
      const ha = hops[e.a], hb = hops[e.b];
      if ((ha < 0 || ha > T.RAID_JUMPS) && (hb < 0 || hb > T.RAID_JUMPS)) continue;
      const take = e.vol * 0.05 * w.cfg.piracy;
      loot += take;
      A.wealth = Math.max(-20, A.wealth - take * 0.5);
      B.wealth = Math.max(-20, B.wealth - take * 0.5);
      // the victims keep books: every skimmed cargo is a grievance filed
      // against this haven in some admiralty office
      if (A.fid !== null && A.fid !== f.id)
        f.grievance[A.fid] = (f.grievance[A.fid] || 0) + take * 0.5;
      if (B.fid !== null && B.fid !== f.id)
        f.grievance[B.fid] = (f.grievance[B.fid] || 0) + take * 0.5;
      if (!richest || e.vol > richest.vol) richest = e;
    }
    f.treasury += loot;
    f.lootY = loot;
    if (loot > 0) w.stats.c.raids++;
    if (richest && loot > 3 && rng.chance(0.25)) {
      log(w, "raid", rng.pick([
        `${f.name} take a convoy on the ${w.systems[richest.a].name}–${w.systems[richest.b].name} lane. Insurance rates triple.`,
        `Black sails on the ${w.systems[richest.a].name}–${w.systems[richest.b].name} run: freighters arrive stripped to the frames, or not at all.`,
      ]), f.capital, {
        actors: [facRef(f)],
        targets: [sysRef(richest.a), sysRef(richest.b)],
        systems: [richest.a, richest.b],
        cause: "raid.convoy", why: "the busiest lane within striking range of the haven",
        effects: [{ k: "plunder", d: loot, u: "cr" }],
      });
    }

    // a haven is only as loyal as its last haul: fat years bind the crews,
    // lean years fray them slowly, empty holds scatter them
    f.stability = clamp(
      f.stability + (loot > 1.5 ? 0.04 : loot > 0.6 ? -0.015 : -0.05),
      0, 1
    );

    // hungry neighbors join the black banner
    if (loot > 3 && rng.chance(0.06 * w.cfg.piracy)) {
      for (const m of members) {
        const o = w.adj[m.id]
          .map(({ to }) => w.systems[to])
          .find((s) => s.fid === null && s.pop > 0.05 && s.wb < 0.55);
        if (o) {
          o.fid = f.id;
          o.freePort = false;
          log(w, "pirate", `The black banners of ${f.name} rise over ${o.name}.`, o.id, {
            actors: [facRef(f)], targets: [sysRef(o)], cause: "pirate.expansion",
            why: "a hungry free neighbor joined a haven fat on plunder",
            effects: [{ k: "owner", from: null, to: f.id }],
          });
          break;
        }
      }
    }

    // suppression: a punitive squadron sails when some aggrieved power's
    // ledger says the raids now cost more than an expedition would. The
    // squadron gathers from worlds near the haven and thins with every
    // gate it must transit — a haven deep in the shallows faces only what
    // its hunters can actually carry that far.
    const atWarSet = new Set();
    for (const [k, r] of Object.entries(w.relations))
      if (r.war) k.split("|").forEach((x) => atWarSet.add(+x));
    let expedition = null;
    for (const vid of Object.keys(f.grievance)) {
      const V = w.factions[vid];
      if (!V || V.dead || V.gov === "pirate" || atWarSet.has(V.id)) continue;
      let str = 0, minH = Infinity;
      for (const s of w.systems) {
        if (s.fid !== V.id || s.pop <= 0.05) continue;
        const h = hops[s.id];
        if (h < 0 || h > T.SUPP_JUMPS) continue;
        str += s.pop * s.dev * Math.pow(T.SUPP_DECAY, h);
        if (h < minH) minH = h;
      }
      if (!Number.isFinite(minH)) continue; // no worlds within projection range
      const cost = T.SUPP_BASE_COST + minH * T.SUPP_JUMP_COST;
      if (V.treasury < cost + 60) continue;        // can't afford to fit one out
      if (f.grievance[vid] < cost * 0.6) continue; // not yet worth the fleet
      const power = str * 0.7 + Math.max(0, V.treasury) * 0.02 * Math.pow(T.SUPP_DECAY, minH);
      if (!expedition || power > expedition.power) expedition = { V, cost, power };
    }
    if (expedition && rng.chance(0.5)) {
      const { V: hunter, cost, power } = expedition;
      const pirateStr =
        members.reduce((a, s) => a + s.pop * s.dev, 0) * 0.25 + Math.max(0, f.treasury) * 0.1;
      hunter.treasury -= cost;
      f.grievance[hunter.id] = 0; // win or lose, the books are settled for now
      w.stats.c.suppressions++;
      if (power * rng.range(0.7, 1.3) > pirateStr * rng.range(0.7, 1.3)) {
        const haven = w.systems[f.capital];
        haven.fid = null;
        haven.lastWar = w.year;
        if (members.length <= 1) {
          // a fleet with money left doesn't die with its anchorage — it
          // slips away and drops anchor where prey passes and law doesn't
          // unlike a founding, a fleet in being doesn't need local misery —
          // it needs an undefended anchorage with prey in reach. Any modest
          // free world will do; the crews are the new economy.
          const flee = alive.filter((s) =>
            s.fid === null && !s.freePort && s.wb < 0.7 && s.pop > 0.3 &&
            s.id !== haven.id && hops[s.id] !== 1);
          const refuge = f.treasury > 40 && flee.length
            ? pickHavenSite(w, rng, flee)
            : null;
          if (refuge) {
            f.treasury = Math.max(10, f.treasury * 0.5 - 20);
            f.capital = refuge.id;
            refuge.fid = f.id;
            refuge.freePort = false;
            f.stability = 0.5;
            w.stats.c.pirateScatters++;
            log(w, "pirate", `Burned out of ${haven.name}, the ${f.name} slip away down the dark lanes. Two winters later the black flag rises over ${refuge.name}.`, refuge.id, {
              actors: [facRef(f)], targets: [facRef(hunter)],
              systems: [haven.id, refuge.id],
              cause: "pirate.scattered",
              why: `the ${hunter.name}'s punitive squadron burned out the old anchorage`,
              effects: [{ k: "owner", from: null, to: f.id }],
            });
          } else {
            killFaction(w, f, "is burned out of its last anchorage; the survivors scatter into the dark", "suppression");
          }
        } else {
          log(w, "pirate", `The ${hunter.name} burns out the corsair haven at ${haven.name}. The wrecks smoulder in orbit for years.`, haven.id, {
            actors: [facRef(hunter)], targets: [facRef(f), sysRef(haven)],
            cause: "pirate.suppressed",
            why: "the ledger of raid losses finally outweighed the cost of a fleet",
            effects: [{ k: "owner", from: f.id, to: null }],
          });
          const rest = w.systems.filter((s) => s.fid === f.id && s.pop > 0.05);
          if (rest.length) f.capital = rest[0].id;
        }
      } else {
        f.treasury += cost * 0.5; // salvage and ransoms from the mauled squadron
        log(w, "raid", `The ${hunter.name}'s punitive squadron is ambushed in the shoals off ${w.systems[f.capital].name} and limps home.`, f.capital, {
          actors: [facRef(f)], targets: [facRef(hunter)], cause: "raid.ambush",
          why: "the corsairs knew their own shoals better than the admiralty's charts",
          effects: [{ k: "plunder", d: cost * 0.5, u: "cr" }],
        });
      }
    }
  }
}
