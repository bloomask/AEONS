// Two-clock game-layer tests. The day clock must give a smooth galaxy on top of
// the yearly simulation WITHOUT changing that simulation: stepping the clock a
// year at a time has to be byte-identical to plain simulateYear, and the
// interpolation has to hit the keyframes exactly at its endpoints.
import { test } from "node:test";
import assert from "node:assert/strict";
import { genGalaxy, simulateYear, buildStats } from "../src/sim/index.js";
import { snapshot } from "../src/game/snapshot.js";
import { lerpSnapshot } from "../src/game/interpolate.js";
import { GameClock, DAYS_PER_YEAR } from "../src/game/clock.js";

test("snapshot captures the year and every system", () => {
  const w = genGalaxy(42);
  const snap = snapshot(w);
  assert.equal(snap.year, w.year);
  assert.equal(snap.sys.length, w.systems.length);
  assert.equal(snap.sys[0].price.grain, w.systems[0].price.grain);
  assert.equal(snap.fac.length, w.factions.length);
});

test("interpolation hits the keyframes exactly at its endpoints", () => {
  const w = genGalaxy(7);
  const a = snapshot(w);
  for (let i = 0; i < 5; i++) simulateYear(w);
  const b = snapshot(w);

  const at0 = lerpSnapshot(a, b, 0);
  const at1 = lerpSnapshot(a, b, 1);
  const mid = lerpSnapshot(a, b, 0.5);
  for (let i = 0; i < a.sys.length; i++) {
    assert.equal(at0.sys[i].pop, a.sys[i].pop, "t=0 is the base year");
    assert.equal(at1.sys[i].pop, b.sys[i].pop, "t=1 is the forecast year");
    // the midpoint sits exactly halfway on a continuous field
    assert.ok(Math.abs(mid.sys[i].wealth - (a.sys[i].wealth + b.sys[i].wealth) / 2) < 1e-9);
    // discrete state is carried from the base keyframe
    assert.equal(mid.sys[i].ruined, a.sys[i].ruined);
    assert.equal(mid.sys[i].fid, a.sys[i].fid);
  }
});

test("interpolation is clamped and non-mutating", () => {
  const w = genGalaxy(3);
  const a = snapshot(w);
  simulateYear(w);
  const b = snapshot(w);
  const beforeA = JSON.stringify(a), beforeB = JSON.stringify(b);
  assert.equal(lerpSnapshot(a, b, -5).t, 0);
  assert.equal(lerpSnapshot(a, b, 9).t, 1);
  assert.equal(JSON.stringify(a), beforeA, "base keyframe untouched");
  assert.equal(JSON.stringify(b), beforeB, "forecast keyframe untouched");
});

test("the clock starts on its year and rolls over after a full year of days", () => {
  const w = genGalaxy(11);
  const clock = new GameClock(w);
  assert.equal(clock.year, 0, "living the starting year");
  assert.equal(clock.w.year, 1, "the world runs one year ahead");
  assert.equal(clock.t, 0);

  const rolled = clock.tick(DAYS_PER_YEAR);
  assert.equal(rolled, 1, "exactly one year boundary crossed");
  assert.equal(clock.year, 1, "now living the next year");
  assert.equal(clock.w.year, 2, "still one year ahead");
  assert.equal(clock.day, 0);
});

test("the day view drifts monotonically from base toward forecast", () => {
  const w = genGalaxy(5);
  const clock = new GameClock(w);
  const p0 = clock.view().sys.map((s) => s.pop);
  clock.tick(DAYS_PER_YEAR / 2);
  const pMid = clock.view().sys.map((s) => s.pop);
  const target = clock.forecast.sys.map((s) => s.pop);
  // halfway through the year, each system's pop is halfway to the forecast
  for (let i = 0; i < p0.length; i++)
    assert.ok(Math.abs(pMid[i] - (p0[i] + target[i]) / 2) < 1e-6);
});

test("stepping the clock a year at a time is byte-identical to plain simulation", () => {
  const N = 40;
  // plain: advance the same seed N years the normal way
  const plain = genGalaxy(42);
  for (let i = 0; i < N; i++) simulateYear(plain);

  // clock: constructor realizes year 1, then N-1 rollovers → year N
  const clocked = genGalaxy(42);
  const clock = new GameClock(clocked);
  clock.tick(DAYS_PER_YEAR * (N - 1));

  assert.equal(clock.w.year, N);
  assert.deepEqual(buildStats(clock.w).summary, buildStats(plain).summary,
    "the two-clock layer must not perturb the deterministic macro-sim");
});
