// Engine tests — plain node:test, no framework. Run with `npm test`.
// These guard the two properties every change must preserve:
//   1. determinism: same seed + config replays the same history
//   2. structural sanity: a few centuries produce a living, coherent galaxy
import { test } from "node:test";
import assert from "node:assert/strict";
import { genGalaxy, simulateYear, buildStats } from "../src/sim/index.js";

function run(seed, years, cfg) {
  const w = genGalaxy(seed, cfg);
  for (let i = 0; i < years; i++) simulateYear(w);
  return w;
}

test("same seed and config replay the identical history", () => {
  const a = buildStats(run(42, 200));
  const b = buildStats(run(42, 200));
  assert.deepEqual(a.summary, b.summary);
  assert.deepEqual(a.series, b.series);
});

test("different seeds diverge", () => {
  const a = buildStats(run(1, 100));
  const b = buildStats(run(2, 100));
  assert.notDeepEqual(a.series, b.series);
});

test("config knobs change history", () => {
  const base = buildStats(run(42, 100));
  const hot = buildStats(run(42, 100, { aggression: 3 }));
  assert.notDeepEqual(base.series, hot.series);
});

test("300 years produce a coherent galaxy", () => {
  const w = run(7, 300);
  assert.equal(w.year, 300);

  const alive = w.systems.filter((s) => s.pop > 0.05);
  assert.ok(alive.length > 0, "civilization survived");
  assert.ok(w.factions.some((f) => !f.dead), "at least one power still stands");
  assert.ok(w.events.length > 0, "event log populated");
  // the chronicle is durable: the founding record still stands three centuries on
  assert.ok(w.events.some((ev) => ev.y === 0 && ev.t === "era"), "the founding era record survives");
  assert.ok(w.stats.series.length === 300, "one stats row per year");

  // every claimed system points at a real, living faction
  for (const s of alive) {
    if (s.fid !== null) {
      const f = w.factions[s.fid];
      assert.ok(f && !f.dead, `${s.name} is owned by a dead or missing faction`);
      assert.ok(!s.freePort, `${s.name} is a free port but flies a flag`);
    }
  }
  // every living faction's capital exists and belongs to it
  for (const f of w.factions) {
    if (f.dead) continue;
    const cap = w.systems[f.capital];
    assert.ok(cap, `${f.name} has no capital`);
  }
  // relations only reference known factions, war records are consistent
  for (const [k, r] of Object.entries(w.relations)) {
    const [a, b] = k.split("|").map(Number);
    assert.ok(w.factions[a] && w.factions[b], `relation ${k} references unknown faction`);
    if (r.war) assert.ok(r.war.since <= w.year);
  }
  // numeric health: nothing exploded into NaN
  for (const s of alive) {
    assert.ok(Number.isFinite(s.pop) && Number.isFinite(s.wealth) && Number.isFinite(s.wb),
      `${s.name} has non-finite state`);
  }
});

test("commodities and contraband stay lawful and finite", () => {
  // step year by year so the legality invariant is checked at EVERY tick,
  // not just at the end — a resettled colony can briefly inherit stale state
  for (const seed of [3, 11, 42, 77]) {
    const w = genGalaxy(seed);
    for (let y = 0; y < 400; y++) {
      simulateYear(w);
      for (const s of w.systems) {
        if (s.pop <= 0.05) continue;
        assert.ok(Number.isFinite(s.stock.weapons) && s.stock.weapons >= 0, `${s.name} arms non-finite (y${w.year})`);
        assert.ok(Number.isFinite(s.slaves) && s.slaves >= 0, `${s.name} slaves non-finite/negative (y${w.year})`);
        assert.ok(Number.isFinite(s.drugs) && s.drugs >= 0, `${s.name} drugs non-finite/negative (y${w.year})`);
        assert.ok(s.drugLoad >= 0 && s.drugLoad <= 1, `${s.name} drugLoad out of range (y${w.year})`);
        // the load-bearing legality invariant: no republic or corporation
        // ever holds slaves — abolition is absolute under those flags
        if (s.fid !== null && s.slaves > 0.01) {
          const gov = w.factions[s.fid].gov;
          assert.ok(gov !== "republic" && gov !== "corporate",
            `${s.name} is a ${gov} yet holds ${s.slaves}M slaves (y${w.year})`);
        }
      }
    }
  }
});
