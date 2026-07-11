import { GOODS } from "../constants.js";
import { clamp, dist2 } from "../util.js";
import { log } from "../events.js";
import { rebuildAdj } from "../galaxy.js";
import { skewDeaths } from "../society.js";

// --- random shocks, gate shifts, and culture drift ---
export function runShocks(w, rng, alive) {
  for (const s of alive) {
    if (rng.chance(0.004 * w.cfg.plague)) {
      // a stocked pharmacopoeia blunts the death toll — and is spent doing it
      const med = clamp(s.stock.medicine / (s.pop * 0.25 + 0.01), 0, 1);
      const before = s.pop;
      s.pop *= rng.range(0.4, 0.7) + 0.25 * med;
      s.stock.medicine *= 0.2;
      skewDeaths(s, (before - s.pop) / before); // the poor quarters bury the most
      s.lastPlague = w.year;
      w.stats.c.plague++;
      log(w, "plague",
        med > 0.5
          ? `Plague sweeps ${s.name}, but its clinics hold the line; the pharmacopoeia is spent to the last vial.`
          : `Plague sweeps ${s.name}. Quarantine beacons burn for a generation.`,
        s.id);
    }
    if (rng.chance(0.005 * w.cfg.oreStrikes)) {
      s.minRes += s.minRes0 * rng.range(0.4, 1.2);
      w.stats.c.strike++;
      log(w, "strike", `Vast new ore seams discovered at ${s.name}. Prospectors flood in.`, s.id);
    }
    if (rng.chance(0.002 * w.cfg.flare)) {
      for (const g of GOODS) s.stock[g] *= 0.5;
      w.stats.c.flare++;
      log(w, "flare", `A stellar flare scours the orbitals of ${s.name}; stockpiles are lost.`, s.id);
    }
  }
  if (rng.chance(0.02 * w.cfg.gateFlux) && w.edges.length > w.systems.length) {
    const ei = rng.int(0, w.edges.length - 1);
    const e = w.edges[ei];
    w.stats.c.gateClose++;
    log(w, "gate", `The jumpgate between ${w.systems[e.a].name} and ${w.systems[e.b].name} collapses.`);
    w.edges.splice(ei, 1); rebuildAdj(w);
  }
  if (rng.chance(0.02 * w.cfg.gateFlux)) {
    for (let tries = 0; tries < 20; tries++) {
      const a = rng.int(0, w.systems.length - 1), b = rng.int(0, w.systems.length - 1);
      if (a !== b && dist2(w.systems[a], w.systems[b]) < 260 &&
        !w.edges.some((e) => (e.a === a && e.b === b) || (e.a === b && e.b === a))) {
        w.edges.push({ a, b, d: dist2(w.systems[a], w.systems[b]), vol: 0, net: 0 });
        rebuildAdj(w);
        w.stats.c.gateOpen++;
        log(w, "gate", `A new jumpgate opens between ${w.systems[a].name} and ${w.systems[b].name}.`);
        break;
      }
    }
  }

  // culture drift: trade converges, isolation diverges
  for (const e of w.edges) {
    if (e.vol > 0.5) {
      const A = w.systems[e.a], B = w.systems[e.b];
      for (let k = 0; k < 3; k++) {
        const mid = (A.cult[k] + B.cult[k]) / 2;
        A.cult[k] += (mid - A.cult[k]) * 0.01;
        B.cult[k] += (mid - B.cult[k]) * 0.01;
      }
    }
  }
  for (const s of alive)
    for (let k = 0; k < 3; k++)
      s.cult[k] = clamp(s.cult[k] + rng.range(-0.004, 0.004), 0, 1);
}
