import { GOODS } from "./constants.js";
import { carryCap } from "./config.js";

// ---------------------------------------------------------------------------
// System archetypes — a world's character at a glance.
//
// `diagnose.js` answers "what is wrong here"; this answers "what KIND of place
// is this". It reads the same live world state and names each settled world's
// dominant identity — a Breadbasket, a Trade Hub, a Pleasure World — plus a
// handful of secondary tags (its flag, its underworld, a siege). Pure and
// deterministic: no rng, no mutation, safe to call from the engine or the UI.
//
// Every living world (`pop > 0.05`) classifies to EXACTLY ONE primary archetype
// — the ordered list ends in an unconditional fallback, so the loop always
// returns. Ruins and empty systems get their own non-economic markers.
// ---------------------------------------------------------------------------

const MFG = new Set(["consumer", "electronics", "medicine", "weapons"]);

// a value at percentile `p` of an ascending-sorted array (nearest-rank)
const q = (sorted, p) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] : 0);

// Galaxy-relative thresholds, computed once per classification pass. A "trade
// hub" is busy *relative to its peers*, not against an absolute that tech and
// inflation would drift out from under. Pass the same ctx to every
// `classifySystem` call in a frame (or omit it and it is computed lazily).
export function classifyContext(w) {
  const live = w.systems.filter((s) => s.pop > 0.05);
  const trades = live.map((s) => s.tradeIn + s.tradeOut).sort((a, b) => a - b);
  const perCap = live.map((s) => s.wealth / (s.pop * 10 + 1)).sort((a, b) => a - b);
  return {
    hubTrade: Math.max(10, q(trades, 0.8)),
    richPerCap: Math.max(1.2, q(perCap, 0.85)),
  };
}

// one system's economic profile — the fields the archetype tests read
function profile(w, s, ctx) {
  const f = s.fid !== null ? w.factions[s.fid] : null;
  let domGood = GOODS[0], domShare = -1;
  for (const g of GOODS) if (s.shares[g] > domShare) { domShare = s.shares[g]; domGood = g; }
  const cap = carryCap(w, s);
  const minLeft = s.minRes0 > 0 ? s.minRes / s.minRes0 : 0;
  return {
    s, f, yr: w.year,
    gov: f ? f.gov : null,
    gates: (w.adj[s.id] || []).length,
    tradeTotal: s.tradeIn + s.tradeOut,
    perCap: s.wealth / (s.pop * 10 + 1),
    eliteShare: s.classes.elite + s.classes.upper,
    workerShare: s.classes.worker,
    domGood, domShare, minLeft, cap,
    over: s.pop > cap * 1.1,
    slaveShare: s.slaves > 0 ? s.slaves / (s.pop + s.slaves) : 0,
    hub: ctx.hubTrade, rich: ctx.richPerCap,
  };
}

// Primary archetypes, in priority order — the FIRST whose `test` passes wins.
// Ordered by how strongly it defines the world: a parasitic corsair economy or
// built ring-cities before what the fields happen to grow; the bland fallback
// last. `test(d)` reads the profile above.
export const ARCHETYPES = [
  { key: "corsair", label: "Corsair Nest", icon: "☠", tint: "#A34A3A",
    blurb: "lives on the loot of other worlds' lanes",
    test: (d) => d.gov === "pirate" },
  { key: "hub", label: "Trade Hub", icon: "⇄", tint: "#5CC8DA",
    blurb: "an entrepôt where the great lanes cross",
    test: (d) => d.tradeTotal >= d.hub && d.gates >= 3 },
  { key: "pleasure", label: "Pleasure World", icon: "♛", tint: "#DA5CB0",
    blurb: "a gilded playground of the idle rich",
    test: (d) => d.perCap >= d.rich && d.eliteShare >= 0.16 && d.workerShare < 0.5 },
  { key: "arsenal", label: "Arsenal World", icon: "⚔", tint: "#E4572E",
    blurb: "its foundries turn out weapons of war",
    // dominant arms labor, or a standing net exporter of weapons to the galaxy
    test: (d) => d.s.dev >= 0.9 && (d.domGood === "weapons" || d.s.flow.weapons <= -0.2) },
  { key: "forge", label: "Forge World", icon: "⚒", tint: "#D9823B",
    blurb: "stacks and shipyards, an engine of industry",
    test: (d) => (MFG.has(d.domGood) && d.s.dev >= 1.0) || d.s.dev > 1.3 },
  { key: "breadbasket", label: "Breadbasket", icon: "❦", tint: "#6FBF73",
    blurb: "broad grain belts that feed the lanes",
    test: (d) => d.domGood === "grain" && d.s.fert >= 0.35 },
  { key: "mine", label: "Mining World", icon: "⛏", tint: "#E8B04B",
    blurb: "a world of pits and smelters",
    test: (d) => (d.domGood === "metals" || d.domGood === "rares") && d.minLeft > 0.1 },
  { key: "refinery", label: "Fuel World", icon: "⚡", tint: "#7B8CE8",
    blurb: "tapped energy fields light half a sector",
    // dominant fuel labor, or a well-endowed net exporter of fuel
    test: (d) => d.domGood === "fuel" || (d.s.flow.fuel <= -0.3 && d.s.en > 0.5) },
  { key: "megacity", label: "Megacity", icon: "▨", tint: "#4FD0A5",
    blurb: "a teeming world of ring-cities and stacked habitats",
    test: (d) => d.s.mega.arcology || d.over },
  { key: "frontier", label: "Frontier Colony", icon: "✧", tint: "#B8C94A",
    blurb: "young towers on the edge of the settled sky",
    test: (d) => d.s.settledYear > 0 && (d.yr - d.s.settledYear) <= 25 && d.s.dev < 0.8 && d.s.pop < 10 },
  { key: "backwater", label: "Backwater", icon: "·", tint: "#8A94A6",
    blurb: "a quiet world the great lanes pass by",
    test: (d) => d.tradeTotal < 3 && d.gates <= 2 && d.s.pop < 6 },
  { key: "settled", label: "Settled World", icon: "○", tint: "#9AA5B5",
    blurb: "an ordinary settled world",
    test: () => true },
];
export const ARCHETYPE_BY_KEY = Object.fromEntries(ARCHETYPES.map((a) => [a.key, a]));

// markers for the un-living, kept out of the economic taxonomy
export const RUIN = { key: "ruin", label: "Ruins", icon: "☓", tint: "#B0453A", blurb: "gone dark" };
export const WILDERNESS = { key: "wild", label: "Uncolonized", icon: "◌", tint: "#7C8798", blurb: "no flag, no people" };

/**
 * The single defining archetype of a system.
 * @returns {{key,label,icon,tint,blurb}} always non-null.
 */
export function classifySystem(w, s, ctx) {
  if (s.ruined) return RUIN;
  if (s.pop <= 0.05) return WILDERNESS;
  const d = profile(w, s, ctx || classifyContext(w));
  d.s._yr = w.year; // frontier test needs the current year without mutating s
  for (const a of ARCHETYPES) if (a.test(d)) return a;
  return ARCHETYPES[ARCHETYPES.length - 1]; // unreachable — fallback always matches
}

// Secondary tags — orthogonal to the primary archetype and stackable. A
// Breadbasket can also be a Capital, a Free Port, and Besieged all at once.
const TAGS = [
  { key: "capital", label: "Capital", icon: "★", tint: "#E8B04B",
    test: (w, s, f) => f && f.gov !== "pirate" && f.capital === s.id },
  { key: "freeport", label: "Free Port", icon: "⚓", tint: "#5CC8DA",
    test: (w, s) => s.freePort },
  { key: "nexus", label: "Gate Nexus", icon: "◈", tint: "#4FD0A5",
    test: (w, s) => !!s.mega.nexus },
  { key: "arcology", label: "Arcology", icon: "◍", tint: "#4FD0A5",
    test: (w, s) => !!s.mega.arcology },
  { key: "terraformed", label: "Terraformed", icon: "❋", tint: "#6FBF73",
    test: (w, s) => !!s.mega.terraformed },
  { key: "faithcradle", label: "Faith Cradle", icon: "✚", tint: "#C05DD6",
    test: (w, s) => w.faiths.some((fa) => fa.home === s.id) },
  { key: "slaveholding", label: "Slave-holding", icon: "⛓", tint: "#B0453A",
    test: (w, s) => s.slaves > 0 && s.slaves / (s.pop + s.slaves) > 0.08 },
  { key: "narco", label: "Narco-den", icon: "☣", tint: "#C05DD6",
    test: (w, s) => (s.drugLoad || 0) > 0.2 },
  { key: "besieged", label: "Besieged", icon: "✖", tint: "#E4572E",
    test: (w, s) => !!s.siege },
  { key: "overcrowded", label: "Overcrowded", icon: "▲", tint: "#F2A93B",
    test: (w, s) => !s.mega.arcology && s.pop > carryCap(w, s) * 1.1 },
  { key: "minesfailing", label: "Mines failing", icon: "⚑", tint: "#F2A93B",
    test: (w, s) => s.min > 0.4 && s.minRes0 > 0 && s.minRes / s.minRes0 < 0.2 },
];

/** Zero or more secondary tags for a living system. */
export function systemTags(w, s) {
  if (s.pop <= 0.05) return [];
  const f = s.fid !== null ? w.factions[s.fid] : null;
  return TAGS.filter((t) => t.test(w, s, f)).map(({ test, ...rest }) => rest);
}
