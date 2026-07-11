import { clamp, dist2 } from "../util.js";
import { log } from "../events.js";
import { foundPirateHaven, killFaction } from "../factions.js";

const RAID_RANGE = 150;

// --- corsairs: lawless power that lives on the lanes of others ---
export function runPirates(w, rng, alive) {
  // desperation breeds havens: poor free systems raise the black flag
  const havens = w.factions.filter((f) => !f.dead && f.gov === "pirate");
  if (havens.length < 5 && rng.chance(0.05)) {
    const cands = alive.filter((s) => s.fid === null && s.wb < 0.55 && s.pop > 0.8);
    if (cands.length) foundPirateHaven(w, rng, rng.pick(cands));
  }

  for (const f of w.factions) {
    if (f.dead || f.gov !== "pirate") continue;
    const members = w.systems.filter((s) => s.fid === f.id && s.pop > 0.05);
    if (!members.length) continue; // the politics phase buries empty factions

    // raiding: skim every busy lane within reach of a haven
    let loot = 0;
    let richest = null;
    for (const e of w.edges) {
      if (e.vol < 0.3) continue;
      const A = w.systems[e.a], B = w.systems[e.b];
      if (A.fid === f.id || B.fid === f.id) continue; // don't eat your own port
      if (!members.some((m) => dist2(m, A) < RAID_RANGE || dist2(m, B) < RAID_RANGE)) continue;
      const take = e.vol * 0.05;
      loot += take;
      A.wealth = Math.max(-20, A.wealth - take * 0.5);
      B.wealth = Math.max(-20, B.wealth - take * 0.5);
      if (!richest || e.vol > richest.vol) richest = e;
    }
    f.treasury += loot;
    f.lootY = loot;
    if (loot > 0) w.stats.c.raids++;
    if (richest && loot > 3 && rng.chance(0.25)) {
      log(w, "raid", rng.pick([
        `${f.name} take a convoy on the ${w.systems[richest.a].name}–${w.systems[richest.b].name} lane. Insurance rates triple.`,
        `Black sails on the ${w.systems[richest.a].name}–${w.systems[richest.b].name} run: freighters arrive stripped to the frames, or not at all.`,
      ]), f.capital);
    }

    // a haven is only as loyal as its last haul
    f.stability = clamp(f.stability + (loot > 1.5 ? 0.04 : -0.05), 0, 1);

    // hungry neighbors join the black banner
    if (loot > 3 && rng.chance(0.06)) {
      for (const m of members) {
        const o = w.adj[m.id]
          .map(({ to }) => w.systems[to])
          .find((s) => s.fid === null && s.pop > 0.05 && s.wb < 0.55);
        if (o) {
          o.fid = f.id;
          o.freePort = false;
          log(w, "pirate", `The black banners of ${f.name} rise over ${o.name}.`, o.id);
          break;
        }
      }
    }

    // suppression: a rich neighbor at peace sends a punitive squadron
    if (rng.chance(0.15)) {
      const atWarSet = new Set();
      for (const [k, r] of Object.entries(w.relations))
        if (r.war) k.split("|").forEach((x) => atWarSet.add(+x));
      const hunter = w.factions
        .filter((h) =>
          !h.dead && h.gov !== "pirate" && h.treasury > 120 && !atWarSet.has(h.id) &&
          w.systems.some((s) => s.fid === h.id && members.some((m) => dist2(s, m) < RAID_RANGE + 30)))
        .sort((a, b) => b.treasury - a.treasury)[0];
      if (hunter) {
        const hunterStr =
          w.systems.filter((s) => s.fid === hunter.id && s.pop > 0.05)
            .reduce((a, s) => a + s.pop * s.dev, 0) * 0.1 + Math.max(0, hunter.treasury) * 0.05;
        const pirateStr =
          members.reduce((a, s) => a + s.pop * s.dev, 0) * 0.25 + Math.max(0, f.treasury) * 0.1;
        w.stats.c.suppressions++;
        if (hunterStr * rng.range(0.7, 1.3) > pirateStr * rng.range(0.7, 1.3)) {
          hunter.treasury -= 25;
          const haven = w.systems[f.capital];
          haven.fid = null;
          haven.lastWar = w.year;
          if (members.length <= 1) {
            killFaction(w, f, "is burned out of its last anchorage; the survivors scatter into the dark", "suppression");
          } else {
            log(w, "pirate", `The ${hunter.name} burns out the corsair haven at ${haven.name}. The wrecks smoulder in orbit for years.`, haven.id);
            const rest = w.systems.filter((s) => s.fid === f.id && s.pop > 0.05);
            if (rest.length) f.capital = rest[0].id;
          }
        } else {
          hunter.treasury -= 30;
          f.treasury += 15;
          log(w, "raid", `The ${hunter.name}'s punitive squadron is ambushed in the shoals off ${w.systems[f.capital].name} and limps home.`, f.capital);
        }
      }
    }
  }
}
