import { CLASSES, CLASS_DEF, START_MIX, ELITE_CAP } from "./constants.js";
import { clamp } from "./util.js";

// ---------- the social pyramid: shared class-mix arithmetic ----------
// A system's `classes` object holds fractions of s.pop per stratum and
// always sums to 1; every mutation here renormalizes.

export function startMix() {
  return { ...START_MIX };
}

function normalize(mix) {
  let tot = 0;
  for (const c of CLASSES) tot += mix[c];
  if (tot <= 0) return Object.assign(mix, startMix());
  for (const c of CLASSES) mix[c] /= tot;
  return mix;
}

// fraction of the population that actually shows up for work
export function laborForce(mix) {
  let l = 0;
  for (const c of CLASSES) l += mix[c] * CLASS_DEF[c].labor;
  return l;
}

// move `m` million from src to dst; emigrants skew poor — the comfortable
// rarely board the refugee ships. Handles pop and class mix on both ends.
export function movePop(src, dst, m) {
  m = Math.min(m, src.pop);
  if (m <= 0) return;
  const wts = CLASSES.map((c) => src.classes[c] * CLASS_DEF[c].mobility);
  const wtot = wts.reduce((a, b) => a + b, 0);
  if (wtot <= 0) { src.pop -= m; dst.pop += m; return; }
  const srcPop0 = src.pop, dstPop0 = dst.pop;
  src.pop -= m; dst.pop += m;
  CLASSES.forEach((c, i) => {
    const moved = m * (wts[i] / wtot);
    const srcLeft = Math.max(0, src.classes[c] * srcPop0 - moved);
    const dstNow = dst.classes[c] * dstPop0 + moved;
    src.classes[c] = src.pop > 0 ? srcLeft / src.pop : START_MIX[c];
    dst.classes[c] = dst.pop > 0 ? dstNow / dst.pop : START_MIX[c];
  });
  normalize(src.classes);
  normalize(dst.classes);
}

// add `m` million people straight into the worker stratum — freed slaves,
// manumitted labor. Keeps the class fractions summing to 1.
export function addWorkers(s, m) {
  if (m <= 0) return;
  const p0 = s.pop;
  s.pop += m;
  for (const c of CLASSES)
    s.classes[c] = (s.classes[c] * p0 + (c === "worker" ? m : 0)) / s.pop;
  normalize(s.classes);
}

// a die-off reshapes the pyramid: deaths land hardest on the bottom.
// `deadFrac` is the share of total pop lost (pop itself is cut by the caller).
export function skewDeaths(s, deadFrac) {
  // guard non-finite input (a 0/0 death fraction from a zero-pop world) —
  // written as a positive test so NaN falls through to the early return
  if (!(deadFrac > 0.005)) return;
  for (const c of CLASSES)
    s.classes[c] *= 1 - clamp(deadFrac * CLASS_DEF[c].mortality, 0, 0.95);
  normalize(s.classes);
}

// yearly social mobility: a well-fed class climbs, a deprived one slides —
// and a top too wide for the economy beneath it slides back regardless,
// because the upper strata buy first and would otherwise never feel a
// downturn. Promotion needs real wealth: nobody ennobles paupers.
export function socialMobility(s) {
  const wb = s.classWb;
  const rich = clamp(s.wealth / (s.pop * 10 + 1), 0, 2); // wealth per capita
  const move = (from, to, f) => {
    f = Math.min(Math.max(0, f), s.classes[from]);
    s.classes[from] -= f; s.classes[to] += f;
  };
  move("worker", "middle", s.classes.worker * Math.max(0, wb.worker - 0.72) * 0.05 * Math.min(1, rich + 0.3));
  move("middle", "upper", s.classes.middle * Math.max(0, wb.middle - 0.75) * 0.03 * Math.min(1, rich));
  if (s.classes.elite < ELITE_CAP && rich > 0.6)
    move("upper", "elite", s.classes.upper * Math.max(0, wb.upper - 0.8) * 0.02);
  move("elite", "upper", s.classes.elite * Math.max(0, 0.55 - wb.elite) * 0.1);
  move("upper", "middle", s.classes.upper * Math.max(0, 0.55 - wb.upper) * 0.1);
  move("middle", "worker", s.classes.middle * Math.max(0, 0.55 - wb.middle) * 0.1);
  const top = s.classes.upper + s.classes.elite;
  const cap = 0.1 + rich * 0.25; // how many idle-ish households the economy carries
  if (top > cap) move("upper", "middle", (top - cap) * 0.15);
  if (rich < 0.15) move("elite", "upper", s.classes.elite * 0.03); // old money runs out
  normalize(s.classes);
}

// unrest: how loudly the bottom notices the gap to the top. Fed by
// inequality of outcomes and by outright worker misery; `mult` is the
// configured class-anger multiplier (w.cfg.unrest).
export function computeUnrest(s, mult = 1) {
  const gap = Math.max(0, s.classWb.elite - s.classWb.worker);
  const misery = Math.max(0, 0.55 - s.classWb.worker);
  return clamp(s.unrest * 0.8 + (gap * 0.7 + misery * 1.0) * 0.2 * mult, 0, 1);
}
