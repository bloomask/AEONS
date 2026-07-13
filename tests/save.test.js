// Save/load tests — plain node:test. Run with `npm test`.
// The load-bearing property: a saved world resumes byte-for-byte, so history
// after a save/load round-trip is identical to an uninterrupted run.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  genGalaxy, simulateYear, buildStats,
  serializeWorld, deserializeWorld, migrateSave, SAVE_VERSION,
} from "../src/sim/index.js";

// serialize through a real JSON string, the way the store persists it
function roundTrip(w) {
  return deserializeWorld(JSON.parse(JSON.stringify(serializeWorld(w))));
}

test("a save/load round-trip resumes the identical history", () => {
  // straight run of 250 years
  const straight = genGalaxy(42);
  for (let i = 0; i < 250; i++) simulateYear(straight);

  // run 120, save, reload, run the remaining 130
  const w = genGalaxy(42);
  for (let i = 0; i < 120; i++) simulateYear(w);
  const resumed = roundTrip(w);
  for (let i = 0; i < 130; i++) simulateYear(resumed);

  assert.equal(resumed.year, 250);
  const a = buildStats(straight);
  const b = buildStats(resumed);
  assert.deepEqual(b.summary, a.summary, "summary diverged after reload");
  assert.deepEqual(b.series, a.series, "yearly series diverged after reload");
});

test("round-trip preserves the rng stream exactly", () => {
  const w = genGalaxy(7);
  for (let i = 0; i < 80; i++) simulateYear(w);
  const resumed = roundTrip(w);
  // the next 20 draws must match on both the live and the reloaded generator
  const live = Array.from({ length: 20 }, () => w.rng.n());
  const back = Array.from({ length: 20 }, () => resumed.rng.n());
  assert.deepEqual(back, live);
});

test("a reloaded world keeps running deterministically", () => {
  const a = genGalaxy(3);
  for (let i = 0; i < 60; i++) simulateYear(a);
  const b = roundTrip(a);
  // reloading twice from the same snapshot yields the same future
  const c = roundTrip(a);
  for (let i = 0; i < 40; i++) { simulateYear(b); simulateYear(c); }
  assert.deepEqual(buildStats(c).series, buildStats(b).series);
});

test("the save carries the current format version and headline fields", () => {
  const w = genGalaxy(9);
  for (let i = 0; i < 15; i++) simulateYear(w);
  const snap = serializeWorld(w);
  assert.equal(snap.v, SAVE_VERSION);
  assert.equal(snap.seed, w.seed);
  assert.equal(snap.year, w.year);
  assert.equal(typeof snap.rngState, "number");
});

test("loading refuses foreign, versionless, and future saves", () => {
  const w = genGalaxy(1);
  const good = serializeWorld(w);

  assert.throws(() => deserializeWorld({ hello: "world" }), /Not an AEONS save/);
  assert.throws(() => migrateSave({ ...good, magic: "aeons.save", v: undefined }), /missing a version/);
  assert.throws(() => migrateSave({ ...good, v: SAVE_VERSION + 5 }), /newer version/);
  assert.throws(() => migrateSave({ magic: "aeons.save", v: 1, world: null }), /no world data/);
});
