// world event log + inter-faction relation records
//
// Every chronicle entry is STRUCTURED: alongside the in-world prose (`s`) it
// carries who acted (`actors`), who or what it was done to (`targets`), every
// system it touched (`systems`), a machine-readable cause code (`cause`), a
// prose reason (`why`), a severity tier (`sev`), and its measurable effects
// (`effects`). Consumers filter and explain from these fields — NEVER from
// names embedded in the rendered text.
//
// Retention: the chronicle is durable for the whole session. Notable and
// major events (sev 2–3) are kept verbatim forever; minor recurring events
// (sev 1 — raids, riots, battles, famines…) are kept verbatim for
// MINOR_KEEP_YEARS and then folded into per-decade aggregates (`w.eventAgg`)
// by `compactChronicle`. History is condensed, never discarded.

// severity tiers
export const SEV_MINOR = 1;   // recurring texture — aggregated by decade after MINOR_KEEP_YEARS
export const SEV_NOTABLE = 2; // kept verbatim forever, rendered compact
export const SEV_MAJOR = 3;   // headline history — kept verbatim forever

// default severity per event type; a call site may override via meta.sev
// (e.g. a credit panic is a major event while a routine loan is minor)
export const EVENT_SEV = {
  era: 3, war: 3, peace: 3, collapse: 3, found: 3, capture: 3, mega: 3,
  corp: 3, pirate: 3, revolution: 3, tech: 3, curate: 3, death: 3,
  secede: 3, annex: 3, cede: 3, gate: 3,
  cap: 2, faith: 2, plague: 2, siege: 2, embargo: 2, accord: 2,
  house: 2, reign: 2, colony: 2,
  famine: 1, riot: 1, battle: 1, raid: 1, strike: 1, flare: 1,
  build: 1, drug: 1, slave: 1, credit: 1,
};

// years a minor (sev 1) event stays verbatim before folding into its decade
export const MINOR_KEEP_YEARS = 60;

// typed references for actors/targets — accept an id or the entity itself
const ref = (k) => (x) => ({ k, id: typeof x === "object" && x !== null ? x.id : x });
export const facRef = ref("faction");
export const houseRef = ref("house");
export const sysRef = ref("system");
export const faithRef = ref("faith");

/**
 * Append one chronicle entry. `meta` (all fields optional):
 *   sev      — severity override (defaults to EVENT_SEV[t])
 *   actors   — refs of who did it (facRef/houseRef/sysRef/faithRef)
 *   targets  — refs of who/what it was done to
 *   systems  — additional affected system ids (sysId is included automatically)
 *   cause    — machine-readable cause code, e.g. "war.creed", "famine.siege"
 *   why      — prose reason, shown as the event's "Why"
 *   effects  — measurable changes: {k, d?, v?, u?} deltas/values, or
 *              {k:"owner", from, to} (faction ids or null) and
 *              {k:"gov", from, to} (government keys)
 * Pure data — never draws from `w.rng`.
 */
export function log(w, t, s, sysId = null, meta = null) {
  // monotonic sequence number so the UI can detect fresh events even
  // after minors have been compacted out of the log's past
  w.eventSeq = (w.eventSeq || 0) + 1;
  const m = meta || {};
  const systems = m.systems ? [...m.systems] : [];
  if (sysId !== null && !systems.includes(sysId)) systems.unshift(sysId);
  w.events.push({
    y: w.year, t, s, sysId, i: w.eventSeq,
    sev: m.sev ?? EVENT_SEV[t] ?? SEV_NOTABLE,
    actors: m.actors || [],
    targets: m.targets || [],
    systems,
    cause: m.cause ?? null,
    why: m.why ?? null,
    effects: m.effects || [],
  });
}

// does this event involve entity (kind, id) as actor or target?
export const eventInvolves = (ev, k, id) =>
  (ev.actors || []).some((r) => r.k === k && r.id === id) ||
  (ev.targets || []).some((r) => r.k === k && r.id === id);

const aggKey = (dec, t, sysId) => `${dec}|${t}|${sysId}`;

/**
 * Fold minor (sev 1) events older than MINOR_KEEP_YEARS into per-decade
 * aggregates in `w.eventAgg`: one record per (decade, type, system) carrying
 * the count, the year span, and the summed numeric effects. Called by the
 * chronicle phase once a decade. Pure data movement — no rng, and it never
 * touches sev 2–3 events, so the headline history is complete forever.
 */
export function compactChronicle(w) {
  const cutoff = w.year - MINOR_KEEP_YEARS;
  if (!w.eventAgg) w.eventAgg = [];
  let byKey = null; // built lazily — most decades there is nothing to fold
  const kept = [];
  for (const ev of w.events) {
    if (ev.sev !== SEV_MINOR || ev.y >= cutoff) { kept.push(ev); continue; }
    if (!byKey) byKey = new Map(w.eventAgg.map((a) => [aggKey(a.dec, a.t, a.sysId), a]));
    const dec = Math.floor(ev.y / 10) * 10;
    const key = aggKey(dec, ev.t, ev.sysId);
    let a = byKey.get(key);
    if (!a) {
      a = { dec, t: ev.t, sysId: ev.sysId, n: 0, y0: ev.y, y1: ev.y, eff: {} };
      byKey.set(key, a);
      w.eventAgg.push(a);
    }
    a.n++;
    if (ev.y < a.y0) a.y0 = ev.y;
    if (ev.y > a.y1) a.y1 = ev.y;
    for (const e of ev.effects || [])
      if (typeof e.d === "number") a.eff[e.k] = (a.eff[e.k] || 0) + e.d;
  }
  if (byKey) w.events = kept;
}

/**
 * The chronicle's retained range — what the archive actually holds.
 * Pure; safe to call in render.
 */
export function chronicleRange(w) {
  const agg = w.eventAgg || [];
  let from = w.events.length ? w.events[0].y : w.year;
  for (const a of agg) if (a.y0 < from) from = a.y0;
  return { from, to: w.year, events: w.events.length, digests: agg.length };
}

/**
 * A system's full local record, newest first: every retained event that
 * touched it plus its decade digests. Entries are {y, ev} or {y, agg}.
 * Pure; the UI pages it.
 */
export function systemRecord(w, sid) {
  const out = [];
  for (const a of w.eventAgg || [])
    if (a.sysId === sid) out.push({ y: a.y1, agg: a });
  for (const ev of w.events)
    if (ev.systems && ev.systems.includes(sid)) out.push({ y: ev.y, ev });
  out.sort((p, q) => q.y - p.y || (q.ev?.i ?? 0) - (p.ev?.i ?? 0));
  return out;
}

// short-lived visual effects (battles, sieges) the map animates;
// entries carry world data only, the renderer decides how they look
export function fx(w, payload) {
  w.fxSeq = (w.fxSeq || 0) + 1;
  w.fx.push({ ...payload, i: w.fxSeq, y: w.year });
  if (w.fx.length > 120) w.fx.splice(0, w.fx.length - 120);
}

export const relKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);

export function getRel(w, a, b) {
  const k = relKey(a, b);
  if (!w.relations[k]) w.relations[k] = { rivalry: 20, war: null, allied: false };
  return w.relations[k];
}
