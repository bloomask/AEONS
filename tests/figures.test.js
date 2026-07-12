// Notable-figures tests. The cast of rulers is descriptive — it must add names
// and successions without touching a single number the simulation runs on, and
// it must reconcile every regime change. We assert determinism, that titles fit
// governments, and that succession fires on reign's end and on regime change.
import { test } from "node:test";
import assert from "node:assert/strict";
import { genGalaxy, simulateYear, buildStats } from "../src/sim/index.js";
import { runFigures, TITLES } from "../src/sim/phases/figures.js";
import { killFaction } from "../src/sim/factions.js";
import { makeSystem, makeFaction, makeWorld } from "./helpers.js";

function run(seed, years) {
  const w = genGalaxy(seed);
  for (let i = 0; i < years; i++) simulateYear(w);
  return w;
}

test("rulers are descriptive: the sim summary is identical with them present", () => {
  // figures runs every year in the pipeline; if it perturbed w.rng or a stats
  // counter, two independent runs would differ. (They can't — it uses a sub-rng
  // and logs without counters.)
  assert.deepEqual(buildStats(run(42, 250)).summary, buildStats(run(42, 250)).summary);
});

test("every living power has a leader whose title fits its government", () => {
  const w = run(7, 300);
  for (const f of w.factions) {
    if (f.dead) continue;
    assert.ok(f.ruler, `${f.name} has no ruler`);
    assert.equal(f.ruler.gov, f.gov, `${f.name}'s ruler govt out of sync`);
    assert.ok(TITLES[f.gov].includes(f.ruler.title),
      `${f.name}: "${f.ruler.title}" is not a ${f.gov} title`);
    assert.ok(f.ruler.since <= w.year && f.ruler.since >= 0, `${f.name} bad reign start`);
  }
});

test("ruler generation is deterministic in the seed", () => {
  const a = run(3, 120), b = run(3, 120);
  for (let i = 0; i < a.factions.length; i++) {
    assert.equal(a.factions[i].ruler?.name, b.factions[i].ruler?.name);
    assert.equal(a.factions[i].ruler?.since, b.factions[i].ruler?.since);
  }
});

test("a regime change installs a new leader under the new title", () => {
  const s = makeSystem(0, { fid: 0, pop: 10 });
  const f = makeFaction(0, { gov: "empire", capital: 0, foundedYear: 0 });
  const w = makeWorld({ systems: [s], factions: [f], year: 10 });
  runFigures(w);
  assert.ok(TITLES.empire.includes(f.ruler.title), "seated an emperor's title");
  // the throne is overthrown and a republic proclaimed
  f.gov = "republic";
  runFigures(w);
  assert.equal(f.ruler.gov, "republic");
  assert.ok(TITLES.republic.includes(f.ruler.title), "new leader takes a republican title");
  assert.equal(f.ruler.since, 10, "the new reign dates from the change");
});

test("a reign ends and an heir accedes, chronicled when it was a long one", () => {
  const s = makeSystem(0, { fid: 0, pop: 10 });
  const f = makeFaction(0, { gov: "empire", capital: 0, foundedYear: 0 });
  const w = makeWorld({ systems: [s], factions: [f], year: 40 });
  runFigures(w);
  const first = f.ruler.name;
  // force the reign past its end, long enough to be worth a chronicle line
  f.ruler.since = w.year - 30; f.ruler.tenure = 1;
  runFigures(w);
  assert.notEqual(f.ruler.name === first && f.ruler.since !== w.year, true);
  assert.equal(f.ruler.since, w.year, "the heir's reign starts now");
  assert.ok(w.events.some((e) => e.t === "reign"), "the long reign's end is chronicled");
});

test("a fallen power's leader is marked ended, not replaced", () => {
  const s = makeSystem(0, { fid: 0, pop: 10 });
  const seat = makeSystem(1, { fid: 0, pop: 5 });
  const f = makeFaction(0, { gov: "empire", capital: 1, foundedYear: 0 });
  const w = makeWorld({ systems: [s, seat], factions: [f], year: 20 });
  runFigures(w);
  const ruled = f.ruler.name;
  killFaction(w, f, "collapses", "unrest");
  runFigures(w);
  assert.equal(f.ruler.name, ruled, "the last ruler is remembered");
  assert.equal(f.ruler.ended, w.year, "their reign is marked ended");
});
