// Rendering helpers for the structured chronicle (sim/events.js): resolving
// actor/target refs to names, formatting measurable effects, phrasing cause
// codes, and condensing decade digests into prose. Pure functions — safe in
// render, no world mutation.

// resolve a typed event ref {k, id} to a display name (dead entities included —
// the arrays are append-only, so history stays resolvable forever)
export function refName(w, r) {
  if (!r) return "—";
  const e = {
    faction: w.factions[r.id],
    house: w.houses[r.id],
    system: w.systems[r.id],
    faith: w.faiths[r.id],
  }[r.k];
  return e ? e.name : `${r.k} ${r.id}`;
}

const facName = (w, id) => (id === null || id === undefined ? "free" : (w.factions[id]?.name ?? `power ${id}`));

// human labels for effect keys; anything unmapped falls back to the key itself
const EFFECT_LABEL = {
  pop: "population", "peak-pop": "peak population", slaves: "bonded population",
  wealth: "local wealth", credits: "credits", plunder: "plunder",
  unrest: "unrest", rivalry: "rivalry",
  grain: "grain stocks", medicine: "medicine stocks", consumer: "consumer goods",
  drugs: "narcotics", ships: "hulls", "ore-reserves": "ore reserves",
  stockpiles: "stockpiles", "trade-severed": "freight severed",
  "tech-era": "technology era", "war-years": "war length", "siege-years": "siege length",
  "reign-years": "reign", lifespan: "lifespan", built: "built",
  cost: "projected cost", "credit-frozen": "credit frozen",
  systems: "systems ruled", "systems-ceded": "systems ceded", "worlds-freed": "worlds set free",
  powers: "powers", fertility: "fertility", habitability: "habitability",
  gran: "granaries", gate: "gate docks", mine: "deep mines",
};

const fmtNum = (v) => {
  const a = Math.abs(v);
  if (a >= 100) return v.toFixed(0);
  if (a >= 10 || Number.isInteger(v)) return String(Math.round(v * 10) / 10);
  return v.toFixed(1);
};

// one effect entry → a display string ("population −12.3M", "allegiance: X → free")
export function fmtEffect(w, e) {
  if (e.k === "owner") return `allegiance: ${facName(w, e.from)} → ${facName(w, e.to)}`;
  if (e.k === "gov") return `government: ${e.from} → ${e.to}`;
  const label = EFFECT_LABEL[e.k] || e.k;
  const u = e.u || "";
  if (typeof e.d === "number") return `${label} ${e.d >= 0 ? "+" : "−"}${fmtNum(Math.abs(e.d))}${u}`;
  if (typeof e.v === "number") return `${label}: ${fmtNum(e.v)}${u}`;
  return label;
}

// fallback "Why" for events whose site records a cause code but no prose
const CAUSE_TEXT = {
  "era.foundation": "the beginning of recorded history",
  "found.faction": "a great world crowned itself a power",
  "house.chartered": "a rich port put its wealth into hulls",
  "strike.ore": "prospectors struck new seams",
  "feud.settled": "the feud cost more than it won",
  "reign.succession": "a long reign ran its natural course",
  "record.largest-realm": "no realm had ever ruled so many systems",
  "record.longest-war": "no war in living memory had run so long",
  "record.worst-famine": "no famine had ever taken so many",
  "record.richest-house": "no fortune had ever run so deep",
};

export function whyText(ev) {
  return ev.why || CAUSE_TEXT[ev.cause] || null;
}

// nouns for decade digests (singular, plural); unmapped types pluralize naively
const AGG_NOUN = {
  famine: ["famine", "famines"],
  riot: ["riot", "riots"],
  battle: ["battle at the gates", "battles at the gates"],
  raid: ["corsair raid", "corsair raids"],
  strike: ["ore strike", "ore strikes"],
  flare: ["stellar flare", "stellar flares"],
  build: ["public work raised", "public works raised"],
  drug: ["smuggling affair", "smuggling affairs"],
  slave: ["slaving affair", "slaving affairs"],
  credit: ["credit dealing", "credit dealings"],
};

// a decade digest → one prose line ("4 famines at Xanthe over 341–348 — population −18.2M")
export function digestText(w, a) {
  const noun = AGG_NOUN[a.t] || [a.t, `${a.t}s`];
  const where = a.sysId !== null && a.sysId !== undefined ? ` at ${w.systems[a.sysId].name}` : "";
  const span = a.y0 === a.y1 ? `in ${a.y0}` : `over ${a.y0}–${a.y1}`;
  const eff = Object.entries(a.eff || {})
    .filter(([, d]) => Math.abs(d) >= 0.05)
    .map(([k, d]) => fmtEffect(w, { k, d, u: k === "pop" || k === "slaves" ? "M" : "" }))
    .join(", ");
  return `${a.n} ${a.n > 1 ? noun[1] : noun[0]}${where} ${span}${eff ? ` — ${eff}` : ""}`;
}

// newest-first scan of the retained log without copying the whole array
export function lastEvents(w, pred, n) {
  const out = [];
  for (let i = w.events.length - 1; i >= 0 && out.length < n; i--)
    if (pred(w.events[i])) out.push(w.events[i]);
  return out;
}
