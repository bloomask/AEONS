import { BASE_PRICE, GOODS, GOOD_LABEL } from "./constants.js";
import { relKey } from "./events.js";

// ---------------------------------------------------------------------------
// Cause & effect — why the galaxy did what it did.
//
// The simulation already knows why things happen; these pure helpers surface it
// in words. `diagnose.js` names what is wrong with a world; this names the
// *reason*: why a staple turned dear, why two powers took up arms. No rng, no
// mutation — safe to call in render, and (for war causes) to record at the
// moment of declaration.
// ---------------------------------------------------------------------------

const CAUSE_LABEL = {
  creed: "a clash of creeds",
  culture: "irreconcilable cultures",
  border: "friction along a long frontier",
  ambition: "the ambition of a rising power",
  estrangement: "estrangement — too little trade to bind them",
  rivalry: "years of hardening rivalry",
};

// The dominant reason a war ignited. These are the same terms that feed the
// rivalry that pushed the pair to war (see diplomacy.js), so we report whichever
// SITUATIONAL driver contributed most — a holy schism, a cultural rift, a long
// contested frontier — and fall back to raw ambition or estrangement only when
// no single flashpoint stands out. Pure: plain numbers in, a labelled cause out.
export function warCause({ holy, cd, aggr, border, mutualTrade }) {
  const situational = { creed: holy ? 0.5 : 0, culture: cd * 1.4, border: border * 0.2 };
  let key = null, max = 0.49; // must clear the baseline grievance to be "the" cause
  for (const [k, v] of Object.entries(situational)) if (v > max) { max = v; key = k; }
  if (key) return { key, label: CAUSE_LABEL[key] };
  if (aggr > 0.6) return { key: "ambition", label: CAUSE_LABEL.ambition };
  if (mutualTrade < 0.5) return { key: "estrangement", label: CAUSE_LABEL.estrangement };
  return { key: "rivalry", label: CAUSE_LABEL.rivalry };
}

// format a stored war record's cause (or derive nothing if it predates causes)
export function explainWar(rec) {
  return rec && rec.causeText ? rec.causeText : null;
}

// The staple a world is most starved of right now — the good trading furthest
// above its base price. Returns { good, ratio } or null if nothing is dear.
export function dearestStaple(w, s) {
  let best = null;
  for (const g of GOODS) {
    const ratio = s.price[g] / BASE_PRICE[g];
    if (ratio > 1.4 && (!best || ratio > best.ratio)) best = { good: g, ratio };
  }
  return best;
}

// Why a good is dear on a given world: a chain of contributing reasons, most
// decisive first. Empty when the good is not meaningfully expensive here.
export function explainScarcity(w, s, g) {
  const out = [];
  const add = (key, text) => out.push({ key, text });
  if (s.price[g] / BASE_PRICE[g] < 1.4) return out;

  // 1. the world is sealed off
  if (s.siege) add("siege", `the blockade since ${s.siege.since} lets nothing dock`);

  // 2. its lanes are cut by war or embargo
  let liveN = 0, severed = 0;
  for (const { to } of w.adj[s.id] || []) {
    const o = w.systems[to];
    if (o.pop <= 0.05) continue;
    liveN++;
    if (s.fid !== null && o.fid !== null && o.fid !== s.fid) {
      const r = w.relations[relKey(s.fid, o.fid)];
      if (r?.war || r?.embargo) severed++;
    }
  }
  if (!s.siege && liveN > 0 && severed === liveN) add("cutoff", "every neighboring lane is shut by war or embargo");
  else if (severed > 0) add("lanes", `${severed} neighboring lane${severed > 1 ? "s are" : " is"} closed by war or embargo`);

  // 3. the ground it comes from is giving out
  const minLeft = s.minRes0 > 0 ? s.minRes / s.minRes0 : 1;
  const enLeft = s.enRes0 > 0 ? s.enRes / s.enRes0 : 1;
  if (g === "metals" && s.min > 0.3 && minLeft < 0.2) add("depletion", "the ore veins are nearly exhausted");
  if (g === "rares" && s.rare > 0.2 && minLeft < 0.2) add("depletion", "the rare-earth seams are running out");
  if (g === "fuel" && s.en > 0.3 && enLeft < 0.25) add("wells", "the fuel wells are drying up");

  // 4. a cartel is holding the price up
  if ((w.cartelMul?.[g] || 1) > 1.05) add("cartel", `a cartel corners the ${GOOD_LABEL[g]} trade`);

  // 5. this world barely makes its own
  const endow = { grain: s.fert, metals: s.min, rares: s.rare * s.min, fuel: s.en }[g];
  if (endow !== undefined && endow < 0.25 && s.shares[g] < 0.12)
    add("barren", `this world makes little ${GOOD_LABEL[g]} of its own`);

  // 6. nothing structural — just more mouths than the lanes can feed
  if (!out.length) add("demand", "local demand outruns what the lanes bring in");
  return out;
}
