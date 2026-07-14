// Configuration-layer tests: the Quick Start screen's intensity summary is a
// pure read of a config, so pin the tiers the named presets land on — their
// one-word temperament must keep matching the story their blurbs promise.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  defaultConfig, galaxyIntensity, INTENSITY_TIERS, PRESETS, CONFIG_PARAMS,
} from "../src/sim/config.js";
import { genGalaxy } from "../src/sim/galaxy.js";
import { checkInvariants } from "../src/sim/invariants.js";

test("a galaxy can begin with no founding powers", () => {
  const w = genGalaxy(31415, { factions: 0, burnYears: 0 });
  assert.equal(w.factions.length, 0);
  assert.equal(w.nextFid, 0);
  assert.ok(w.systems.every((s) => s.fid === null));
  assert.deepEqual(checkInvariants(w), []);
});

test("a galaxy can begin with no people", () => {
  const w = genGalaxy(27182, { settled: 0, factions: 0, burnYears: 0 });
  assert.equal(w.stats.seeded, 0);
  assert.equal(w.factions.length, 0);
  assert.equal(w.houses.length, 0);
  assert.ok(w.systems.every((s) => s.pop === 0 && s.fid === null));
  assert.deepEqual(checkInvariants(w), []);
});

test("every preset resolves to a known intensity tier", () => {
  const keys = new Set(INTENSITY_TIERS.map((t) => t.key));
  for (const p of PRESETS) {
    const t = galaxyIntensity({ ...defaultConfig(), ...p.overrides });
    assert.ok(keys.has(t.key), `${p.key} → unknown tier ${t.key}`);
    assert.ok(Number.isFinite(t.score), `${p.key} → non-finite score`);
  }
});

test("preset temperaments match their blurbs", () => {
  const tier = (overrides) => galaxyIntensity({ ...defaultConfig(), ...overrides }).key;
  const byKey = Object.fromEntries(PRESETS.map((p) => [p.key, p.overrides]));
  assert.equal(tier({}), "temperate"); // the Standard Model is the baseline
  assert.equal(tier(byKey.golden), "peaceful");
  assert.equal(tier(byKey.longdark), "catastrophic");
  assert.equal(tier(byKey.bloodiron), "volatile");
});

test("intensity responds to hostility and abundance in the right direction", () => {
  const base = galaxyIntensity(defaultConfig()).score;
  assert.ok(galaxyIntensity({ ...defaultConfig(), aggression: 3, plague: 4 }).score > base);
  assert.ok(galaxyIntensity({ ...defaultConfig(), fertility: 2, richness: 3, piracy: 0 }).score < base);
});

test("preset overrides only name real config params", () => {
  const known = new Set(CONFIG_PARAMS.map((p) => p.key));
  for (const p of PRESETS) {
    for (const k of Object.keys(p.overrides)) {
      assert.ok(known.has(k), `${p.key} overrides unknown param ${k}`);
    }
  }
});
