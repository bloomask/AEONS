// System-archetype tests. Two jobs: prove the taxonomy is TOTAL and unambiguous
// (every living world lands on exactly one known primary archetype, every year,
// across seeds and presets), and pin the individual archetype/tag rules with
// small handcrafted worlds.
import { test } from "node:test";
import assert from "node:assert/strict";
import { genGalaxy, simulateYear } from "../src/sim/index.js";
import {
  classifySystem, classifyContext, systemTags,
  ARCHETYPE_BY_KEY, RUIN, WILDERNESS,
} from "../src/sim/classify.js";
import { PRESETS } from "../src/sim/config.js";
import { makeSystem, makeFaction, makeWorld, alive } from "./helpers.js";

test("every living world classifies to exactly one known archetype, every year", () => {
  for (const [seed, preset] of [[42, null], [7, PRESETS[3]], [1, PRESETS[2]]]) {
    const w = genGalaxy(seed, preset ? preset.overrides : undefined);
    for (let y = 0; y < 200; y++) {
      simulateYear(w);
      const ctx = classifyContext(w);
      for (const s of w.systems) {
        const a = classifySystem(w, s, ctx);
        assert.ok(a && a.key, `${s.name} classified to nothing (y${w.year})`);
        if (s.ruined) assert.equal(a, RUIN, `${s.name} is a ruin but classified ${a.key}`);
        else if (s.pop <= 0.05) assert.equal(a, WILDERNESS, `${s.name} is empty but classified ${a.key}`);
        else assert.ok(ARCHETYPE_BY_KEY[a.key], `${s.name} got unknown primary "${a.key}" (y${w.year})`);
      }
    }
  }
});

test("classification never mutates the world", () => {
  // it must be a pure read — safe to call every frame from the UI
  const w = genGalaxy(5);
  for (let i = 0; i < 50; i++) simulateYear(w);
  const before = JSON.stringify(w.systems.map((s) => [s.pop, s.shares, s.wealth]));
  const ctx = classifyContext(w);
  for (const s of w.systems) { classifySystem(w, s, ctx); systemTags(w, s); }
  assert.equal(JSON.stringify(w.systems.map((s) => [s.pop, s.shares, s.wealth])), before);
});

// ---- focused archetype rules on handcrafted worlds ----
test("a pirate-owned world is a Corsair Nest", () => {
  const s = makeSystem(0, { fid: 0, pop: 5 });
  const f = makeFaction(0, { gov: "pirate", capital: 0 });
  const w = makeWorld({ systems: [s], factions: [f] });
  assert.equal(classifySystem(w, s).key, "corsair");
});

test("a fertile, grain-farming world is a Breadbasket", () => {
  const s = makeSystem(0, { fert: 0.8, pop: 10, wealth: 40,
    shares: { grain: 0.6 } });
  const w = makeWorld({ systems: [s] });
  assert.equal(classifySystem(w, s).key, "breadbasket");
});

test("a rich, elite-heavy world is a Pleasure World", () => {
  const s = makeSystem(0, { pop: 10, wealth: 6000, dev: 0.6,
    classes: { elite: 0.12, upper: 0.22, middle: 0.36, worker: 0.3 } });
  const w = makeWorld({ systems: [s] });
  assert.equal(classifySystem(w, s).key, "pleasure");
});

test("a developed net-exporter of weapons is an Arsenal World", () => {
  const s = makeSystem(0, { pop: 10, dev: 1.2, wealth: 30 });
  s.flow.weapons = -1; // standing arms exporter
  const w = makeWorld({ systems: [s] });
  assert.equal(classifySystem(w, s).key, "arsenal");
});

test("ruins and empty systems get non-economic markers", () => {
  const ruin = makeSystem(0, { pop: 0, ruined: true, diedYear: 1 });
  const empty = makeSystem(1, { pop: 0 });
  const w = makeWorld({ systems: [ruin, empty] });
  assert.equal(classifySystem(w, ruin).key, "ruin");
  assert.equal(classifySystem(w, empty).key, "wild");
});

test("secondary tags stack independently of the primary archetype", () => {
  const s = makeSystem(0, { fert: 0.8, pop: 10, fid: 0, freePort: false,
    shares: { grain: 0.6 }, slaves: 3, siege: { by: 0, since: 1, pair: "x" },
    mega: { nexus: true } });
  const f = makeFaction(0, { gov: "empire", capital: 0 });
  const w = makeWorld({ systems: [s], factions: [f] });
  const primary = classifySystem(w, s).key;
  const tagKeys = systemTags(w, s).map((t) => t.key);
  assert.equal(primary, "breadbasket", "primary is still the economic identity");
  assert.ok(tagKeys.includes("capital"), "capital tag");
  assert.ok(tagKeys.includes("nexus"), "gate nexus tag");
  assert.ok(tagKeys.includes("slaveholding"), "slave-holding tag");
  assert.ok(tagKeys.includes("besieged"), "besieged tag");
});
