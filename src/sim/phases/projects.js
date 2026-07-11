import { PROJECT_TYPES } from "../constants.js";
import { log } from "../events.js";

// --- megaprojects: works of generations, paid for out of the treasury ---
export function runProjects(w, rng) {
  // fund what is already under construction
  for (const p of w.projects) {
    if (p.done || p.abandoned) continue;
    const f = w.factions[p.fid];
    const s = w.systems[p.sysId];
    if (!f || f.dead || s.fid !== p.fid || s.pop <= 0.05) {
      p.abandoned = true; p.endedYear = w.year;
      w.stats.c.megaAbandoned++;
      log(w, "mega", `Work on the ${p.name} at ${s.name} falls silent, ${Math.round((p.progress / p.cost) * 100)}% built. The scaffolds will outlive their builders.`, p.sysId);
      continue;
    }
    if (f.treasury <= 60) continue;
    const pay = Math.min(10, f.treasury * 0.05);
    f.treasury -= pay;
    p.progress += pay;
    if (p.progress >= p.cost) {
      p.done = true; p.endedYear = w.year;
      w.stats.c.megaBuilt++;
      if (p.type === "nexus") {
        s.mega.nexus = true;
        log(w, "mega", `The ${p.name} of ${s.name} is complete after ${w.year - p.started} years — freighters queue a hundred deep to ride its gates.`, s.id);
      } else if (p.type === "arcology") {
        s.mega.arcology = true;
        log(w, "mega", `The ${p.name} above ${s.name} opens its ring-cities after ${w.year - p.started} years. Millions look down on the old world.`, s.id);
      } else {
        s.fert = Math.min(1, s.fert + 0.35);
        s.hab = Math.min(1, s.hab + 0.25);
        s.mega.terraformed = true;
        log(w, "mega", `After ${w.year - p.started} years the ${p.name} at ${s.name} falls quiet: the rains have come, and the rock is green.`, s.id);
      }
    }
  }

  // rich, unburdened factions break ground on something monumental
  for (const f of w.factions) {
    if (f.dead || f.treasury < 380) continue;
    if (w.projects.some((p) => p.fid === f.id && !p.done && !p.abandoned)) continue;
    if (!rng.chance(0.012)) continue;
    const members = w.systems.filter((s) => s.fid === f.id && s.pop > 0.05);
    if (!members.length) continue;

    const options = [];
    const hub = [...members].sort((a, b) => b.tradeIn - a.tradeIn)[0];
    if (hub && hub.tradeIn > 8 && !hub.mega.nexus) options.push(["nexus", hub]);
    const crowded = [...members].sort((a, b) => b.pop - a.pop)
      .find((s) => !s.mega.arcology && s.pop > (s.hab * 120 + s.fert * 80 + 8) * 0.7);
    if (crowded) options.push(["arcology", crowded]);
    const barren = [...members].sort((a, b) => a.fert - b.fert)
      .find((s) => !s.mega.terraformed && s.fert < 0.35 && s.pop > 3);
    if (barren) options.push(["terraform", barren]);
    if (!options.length) continue;

    const [type, sys] = rng.pick(options);
    const spec = PROJECT_TYPES[type];
    f.treasury -= 60;
    w.projects.push({
      type, name: spec.name, sysId: sys.id, fid: f.id,
      started: w.year, endedYear: null, progress: 60, cost: spec.cost,
      done: false, abandoned: false,
    });
    w.stats.c.megaStarted++;
    const art = /^[AEIOU]/.test(spec.name) ? "an" : "a";
    log(w, "mega", `The ${f.name} breaks ground on ${art} ${spec.name} at ${sys.name} — ${spec.blurb}. A work of generations.`, sys.id);
  }
}
