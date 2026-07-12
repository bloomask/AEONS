import { BASE_PRICE, TECH_ERAS } from "../constants.js";
import { clamp } from "../util.js";
import { log } from "../events.js";

// --- the slow climb: research and technology eras ---
// Research flows from developed worlds with educated (non-worker) strata,
// and cheap electronics feed it — the commodity tree drives the tech tree.
// War and collapse starve it naturally: a poor galaxy stops inventing.
// research points needed to reach the era after `lv`
export const techCost = (lv) => 70 * Math.pow(1.45, lv);

export function runTech(w, rng, alive) {
  const t = w.tech;
  if (t.level >= TECH_ERAS.length - 1) return;

  let R = 0;
  for (const s of alive) {
    if (s.dev <= 0.55) continue;
    const schooled = s.classes.elite + s.classes.upper + s.classes.middle;
    const elx = clamp(1.4 - s.price.electronics / (BASE_PRICE.electronics * 2), 0.4, 1.4);
    R += (s.dev - 0.5) * Math.sqrt(s.pop) * (0.25 + 0.75 * schooled) * elx;
  }
  t.progress += R * 0.03 * (w.cfg.research ?? 1);

  const cost = techCost(t.level);
  if (t.progress >= cost) {
    t.progress -= cost;
    t.level++;
    const era = TECH_ERAS[t.level];
    t.history.push({ level: t.level, year: w.year, name: era.name, tech: era.tech });
    w.stats.c.breakthrough++;
    log(w, "tech", `${era.tech[0].toUpperCase() + era.tech.slice(1)} spreads from the great workshops. Chroniclers will call what follows ${era.name}.`);
  }
}
