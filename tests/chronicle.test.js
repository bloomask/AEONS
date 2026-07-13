// Chronicle tests — the structured, durable event log (sim/events.js).
// Two properties under guard:
//   1. every event is STRUCTURED: severity, actors/targets, affected systems,
//      a cause code, and measurable effects — the UI filters on these fields,
//      never on names embedded in prose.
//   2. the chronicle is DURABLE: major/notable events survive the whole
//      session verbatim; minor recurring events are folded into per-decade
//      digests instead of being discarded.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  genGalaxy, simulateYear,
  log, compactChronicle, chronicleRange, systemRecord, eventInvolves,
  sysRef, EVENT_SEV, MINOR_KEEP_YEARS, SEV_MINOR,
  serializeWorld, deserializeWorld, migrateSave, SAVE_VERSION,
} from "../src/sim/index.js";
import { makeSystem, makeWorld } from "./helpers.js";

function run(seed, years) {
  const w = genGalaxy(seed);
  for (let i = 0; i < years; i++) simulateYear(w);
  return w;
}

test("every event carries the structured causal fields", () => {
  const w = run(42, 300);
  assert.ok(w.events.length > 50, "a few centuries write a real chronicle");
  for (const ev of w.events) {
    assert.ok([1, 2, 3].includes(ev.sev), `event "${ev.t}" has a severity tier`);
    assert.ok(Array.isArray(ev.actors), "actors is an array");
    assert.ok(Array.isArray(ev.targets), "targets is an array");
    assert.ok(Array.isArray(ev.effects), "effects is an array");
    assert.ok(Array.isArray(ev.systems), "systems is an array");
    assert.equal(typeof ev.cause, "string", `event "${ev.t}" (${ev.s}) records a cause code`);
    if (ev.sysId !== null) assert.ok(ev.systems.includes(ev.sysId), "systems includes the primary system");
    for (const r of [...ev.actors, ...ev.targets]) {
      assert.ok(["faction", "house", "system", "faith"].includes(r.k), `ref kind ${r.k}`);
      assert.equal(typeof r.id, "number", "ref id is numeric");
    }
  }
  // wars record their belligerents as faction refs — the basis of faction filtering
  const war = w.events.find((ev) => ev.t === "war");
  if (war) {
    const facs = war.actors.filter((r) => r.k === "faction");
    assert.equal(facs.length, 2, "a war names both powers as actors");
    assert.ok(eventInvolves(war, "faction", facs[0].id), "eventInvolves finds a belligerent");
    assert.ok(!eventInvolves(war, "faction", 9999), "eventInvolves rejects a stranger");
  }
});

test("major events survive the whole session; stale minors are digested, not discarded", () => {
  const w = run(42, 500);
  // the founding records (year 0) are still there, verbatim
  assert.ok(w.events.some((ev) => ev.y === 0), "year-0 records retained after 500 years");
  // no verbatim minor event outlives its keep window (compaction runs each decade,
  // so allow one decade of slack past the cutoff)
  const cutoff = w.year - MINOR_KEEP_YEARS - 10;
  assert.equal(
    w.events.filter((ev) => ev.sev === SEV_MINOR && ev.y < cutoff).length, 0,
    "old minors have been folded into decade digests"
  );
  // ...and they became digests rather than vanishing
  assert.ok(w.eventAgg.length > 0, "decade digests exist");
  for (const a of w.eventAgg) {
    assert.ok(a.n >= 1 && a.y0 <= a.y1, "digest counts and span are coherent");
    assert.equal(a.dec, Math.floor(a.y0 / 10) * 10, "digest keyed to its decade");
    assert.equal(EVENT_SEV[a.t], SEV_MINOR, "only minor types are digested");
  }
  // the reported range covers the whole session
  const range = chronicleRange(w);
  assert.ok(range.from <= 1, `retained range starts at the beginning (got ${range.from})`);
  assert.equal(range.to, w.year);
  // events remain in chronological order (paging depends on it)
  for (let i = 1; i < w.events.length; i++)
    assert.ok(w.events[i].y >= w.events[i - 1].y, "event log stays year-ordered");
});

test("compaction folds counts and sums measurable effects per decade", () => {
  const s = makeSystem(0, { pop: 10 });
  const w = makeWorld({ systems: [s] });
  w.year = 3;
  log(w, "famine", "Famine one.", 0, { actors: [sysRef(s)], cause: "famine.harvest", effects: [{ k: "pop", d: -2, u: "M" }] });
  w.year = 5;
  log(w, "famine", "Famine two.", 0, { actors: [sysRef(s)], cause: "famine.harvest", effects: [{ k: "pop", d: -3, u: "M" }] });
  w.year = 12;
  log(w, "famine", "Famine three.", 0, { actors: [sysRef(s)], cause: "famine.harvest", effects: [{ k: "pop", d: -1, u: "M" }] });
  w.year = 20;
  log(w, "collapse", "A power falls.", null, { cause: "collapse.bankruptcy" });

  w.year = 200; // everything is now far past the keep window
  compactChronicle(w);

  assert.equal(w.events.length, 1, "only the major event stays verbatim");
  assert.equal(w.events[0].t, "collapse");
  assert.equal(w.eventAgg.length, 2, "one digest per (decade, type, system)");
  const d0 = w.eventAgg.find((a) => a.dec === 0);
  assert.equal(d0.n, 2);
  assert.equal(d0.y0, 3);
  assert.equal(d0.y1, 5);
  assert.equal(d0.eff.pop, -5, "numeric effects are summed into the digest");
  const d10 = w.eventAgg.find((a) => a.dec === 10);
  assert.equal(d10.n, 1);
  assert.equal(d10.eff.pop, -1);

  // the digests appear in the system's derived local record
  const rec = systemRecord(w, 0);
  assert.equal(rec.filter((r) => r.agg).length, 2, "digests surface in the local record");
});

test("a system's local record is derived from the durable archive", () => {
  const w = run(7, 200);
  const touched = w.systems.find((s) => w.events.some((ev) => ev.systems.includes(s.id)));
  assert.ok(touched, "some system was touched by history");
  const rec = systemRecord(w, touched.id);
  assert.ok(rec.length > 0, "the local record is non-empty");
  for (let i = 1; i < rec.length; i++)
    assert.ok(rec[i].y <= rec[i - 1].y, "local record is newest-first");
  for (const r of rec) {
    if (r.ev) assert.ok(r.ev.systems.includes(touched.id), "every event actually touched the system");
    else assert.equal(r.agg.sysId, touched.id, "every digest belongs to the system");
  }
});

test("a v1 save (text-only events, per-system history) migrates forward and runs", () => {
  const w = genGalaxy(11);
  for (let i = 0; i < 60; i++) simulateYear(w);
  // forge a v1-era snapshot: strip the structured fields and digests,
  // restore the retired per-system history list
  const snap = JSON.parse(JSON.stringify(serializeWorld(w)));
  snap.v = 1;
  snap.world.events = snap.world.events.map(({ y, t, s, sysId, i }) => ({ y, t, s, sysId, i }));
  delete snap.world.eventAgg;
  for (const s of snap.world.systems) s.history = [{ y: 1, t: "colony", s: "old text" }];

  const migrated = migrateSave(JSON.parse(JSON.stringify(snap)));
  assert.equal(migrated.v, SAVE_VERSION);
  for (const ev of migrated.world.events) {
    assert.ok([1, 2, 3].includes(ev.sev), "migrated events get a severity");
    assert.ok(Array.isArray(ev.actors) && Array.isArray(ev.effects), "migrated events get structured fields");
    if (ev.sysId !== null) assert.deepEqual(ev.systems, [ev.sysId]);
  }
  assert.ok(Array.isArray(migrated.world.eventAgg), "digest store added");
  assert.ok(migrated.world.systems.every((s) => !("history" in s)), "per-system history dropped");

  // and the migrated world actually runs
  const live = deserializeWorld(JSON.parse(JSON.stringify(snap)));
  simulateYear(live);
  assert.equal(live.year, w.year + 1);
});

test("severity tiers stay consistent with the type table", () => {
  const w = run(3, 150);
  for (const ev of w.events) {
    const base = EVENT_SEV[ev.t] ?? 2;
    // sites may raise severity above the type default (a panic, a sack) but never lower it
    assert.ok(ev.sev >= base, `event "${ev.t}" severity ${ev.sev} below its type default ${base}`);
  }
});
