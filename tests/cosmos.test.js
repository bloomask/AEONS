// Composition tests — the star + planets layered on each system. Two jobs:
// prove generation is deterministic and well-formed, and prove the physical
// make-up stays CONSISTENT with the endowments the engine actually runs on
// (a fertile world has a green homeworld, an energy-rich one has gas giants).
import { test } from "node:test";
import assert from "node:assert/strict";
import { genGalaxy, buildStats, simulateYear } from "../src/sim/index.js";
import {
  genComposition, describeComposition, primaryBody,
  STAR_BY_KEY, BODY_TYPES,
} from "../src/sim/cosmos.js";

const GREEN = new Set(["terran", "ocean", "savanna"]);
const GIANT = new Set(["gasgiant", "icegiant"]);
const ROCK = new Set(["belt", "volcanic"]);

test("every system gets a valid star and worlds", () => {
  const w = genGalaxy(42);
  for (const s of w.systems) {
    assert.ok(STAR_BY_KEY[s.star], `${s.name} has unknown star "${s.star}"`);
    assert.ok(s.bodies.length >= 1, `${s.name} has no worlds`);
    const primaries = s.bodies.filter((b) => b.primary);
    assert.equal(primaries.length, 1, `${s.name} must have exactly one homeworld`);
    assert.ok(BODY_TYPES[primaries[0].t].settle, `${s.name}'s homeworld is unsettleable`);
    for (const b of s.bodies) {
      assert.ok(BODY_TYPES[b.t], `${s.name} has unknown body "${b.t}"`);
      assert.ok(Number.isFinite(b.size) && b.size > 0, `${s.name} body size bad`);
      if (b.moons != null) assert.ok(GIANT.has(b.t), `${s.name}: only giants have moons`);
    }
  }
});

test("composition is deterministic in (seed, id)", () => {
  const a = genGalaxy(7), b = genGalaxy(7);
  for (let i = 0; i < a.systems.length; i++) {
    assert.equal(a.systems[i].star, b.systems[i].star);
    assert.deepEqual(a.systems[i].bodies, b.systems[i].bodies);
  }
  // and the pure generator matches what genGalaxy stored
  const s = a.systems[3];
  assert.deepEqual(genComposition(7, s), { star: s.star, bodies: s.bodies });
});

test("composition never perturbs the simulation's history", () => {
  // it is drawn from a per-system sub-rng, so a galaxy with composition must
  // replay byte-for-byte identically to one built the same way (determinism
  // already guards this, but assert the summary is stable across two builds)
  const run = () => { const w = genGalaxy(42); for (let i = 0; i < 150; i++) simulateYear(w); return buildStats(w).summary; };
  assert.deepEqual(run(), run());
});

test("the star fits the world's habitability", () => {
  const w = genGalaxy(42);
  const warm = new Set(["G", "K", "F"]);
  const hi = w.systems.filter((s) => s.hab > 0.7);
  const lo = w.systems.filter((s) => s.hab < 0.25);
  const hiWarm = hi.filter((s) => warm.has(s.star)).length;
  const loWarm = lo.filter((s) => warm.has(s.star)).length;
  assert.ok(hiWarm / hi.length > 0.4, `habitable worlds should mostly get warm stars (${hiWarm}/${hi.length})`);
  assert.ok(loWarm / Math.max(1, lo.length) < 0.2, `dead worlds rarely get warm stars (${loWarm}/${lo.length})`);
});

test("worlds match their endowments", () => {
  const w = genGalaxy(42);
  const frac = (arr, pred) => (arr.length ? arr.filter(pred).length / arr.length : 1);
  // a green homeworld needs BOTH fertility and habitability — a lush *and*
  // liveable world (fert and hab are independent rolls, so high fert alone,
  // on an inhospitable rock, correctly yields a desert/tundra, not a garden)
  const verdant = w.systems.filter((s) => s.fert > 0.55 && s.hab > 0.55);
  const energetic = w.systems.filter((s) => s.en > 0.6);
  const mineral = w.systems.filter((s) => s.min > 0.6);
  assert.ok(frac(verdant, (s) => GREEN.has(primaryBody(s).t)) > 0.75,
    "lush, liveable worlds mostly have green homeworlds");
  assert.ok(frac(energetic, (s) => s.bodies.some((b) => GIANT.has(b.t))) > 0.9,
    "energy-rich worlds have gas/ice giants");
  assert.ok(frac(mineral, (s) => s.bodies.some((b) => ROCK.has(b.t))) > 0.9,
    "mineral-rich worlds have belts or slag worlds");
});

test("describeComposition reads as prose", () => {
  const w = genGalaxy(3);
  const s = w.systems[0];
  const text = describeComposition(s);
  assert.match(text, /star|dwarf|giant|pair/, "names the star");
  assert.match(text, /world/, "names the worlds");
});
