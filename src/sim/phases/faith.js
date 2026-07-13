import { T, FAITH_COLORS, CULTURES } from "../constants.js";
import { clamp } from "../util.js";
import { log, faithRef, sysRef } from "../events.js";
import { genName } from "../names.js";

// --- faith: creeds travel the trade lanes; isolation breeds schism ---
export function runFaith(w, rng, alive) {
  // conversion flows along busy lanes, from the greater world to the lesser
  for (const e of w.edges) {
    if (e.vol < 1.0) continue;
    const A = w.systems[e.a], B = w.systems[e.b];
    if (A.pop <= 0.05 || B.pop <= 0.05 || A.faith === B.faith) continue;
    if (!rng.chance(clamp(e.vol * 0.004, 0, 0.02))) continue;
    const big = A.pop >= B.pop ? A : B;
    const small = big === A ? B : A;
    const oldFaith = small.faith;
    small.faith = big.faith;
    w.stats.c.conversion++;
    if (small.pop > 6) {
      log(w, "faith", rng.pick([
        `${small.name} embraces ${w.faiths[big.faith].name}; the old shrines empty with the grain ships.`,
        `Missionaries riding the freighters win ${small.name} over to ${w.faiths[big.faith].name}.`,
      ]), small.id, {
        actors: [faithRef(big.faith), sysRef(big)], targets: [sysRef(small), faithRef(oldFaith)],
        systems: [big.id],
        cause: "faith.conversion", why: "creeds travel the busy lanes, from the greater world to the lesser",
      });
    }
  }

  // schism: a large, cut-off world declares its own creed
  for (const s of alive) {
    if (w.faiths.length >= T.MAX_FAITHS) break;
    if (s.pop < 12 || s.tradeIn > 2 || !rng.chance(0.001)) continue;
    const cult = CULTURES.find((c) => c.name === s.cultName) || CULTURES[0];
    const root = genName(rng, cult).split(" ")[0];
    const f = {
      id: w.faiths.length,
      name: rng.pick([
        `The Way of ${root}`, `The ${root} Heresy`, `The ${root} Revelation`,
        `${root}ism`, `The New ${root} Creed`,
      ]),
      color: FAITH_COLORS[w.faiths.length % FAITH_COLORS.length],
      founded: w.year, home: s.id,
    };
    w.faiths.push(f);
    const old = w.faiths[s.faith];
    s.faith = f.id;
    w.stats.c.schism++;
    log(w, "faith", `Schism at ${s.name}: preachers cast out ${old.name} and proclaim ${f.name}.`, s.id, {
      sev: 3, actors: [sysRef(s), faithRef(f.id)], targets: [faithRef(old.id)],
      cause: "faith.schism", why: "a great world grown too isolated to keep another's creed",
    });
  }
}

// the creed most of a faction's subjects follow
export function majorityFaith(members) {
  const counts = {};
  for (const s of members) counts[s.faith] = (counts[s.faith] || 0) + s.pop;
  let best = null, bp = -1;
  for (const [f, p] of Object.entries(counts))
    if (p > bp) { bp = p; best = +f; }
  return best;
}
