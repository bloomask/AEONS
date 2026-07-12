// Invariant tests — the world's structural truths must hold after EVERY phase,
// not merely at the end of a run. We step the year through the phase pipeline
// (via simulateYear's `onPhase` hook) and assert `checkInvariants` finds nothing
// broken at each step. This is what pins a bug to the phase that caused it: a
// famine that leaves a NaN, a conquest that forgets abolition, a ruin that keeps
// its flag — all surface here, against the mechanic responsible, not 400 years on.
import { test } from "node:test";
import assert from "node:assert/strict";
import { genGalaxy, simulateYear } from "../src/sim/index.js";
import { checkInvariants } from "../src/sim/invariants.js";
import { PRESETS } from "../src/sim/config.js";

// step one year, checking invariants after each phase; collect any breach.
// Slavery legality is reconciled by the contraband phase, so the `settled`
// abolition check only kicks in from contraband onward within each year (the
// structural invariants — finiteness, ownership, ruin state — hold throughout).
function runChecked(seed, years, cfg) {
  const w = genGalaxy(seed, cfg);
  const breaches = [];
  // check the freshly generated world too — genGalaxy must hand off a lawful one
  for (const v of checkInvariants(w, { label: "genesis" })) breaches.push(`y0 ${v}`);
  for (let i = 0; i < years && breaches.length === 0; i++) {
    let settled = false;
    simulateYear(w, (name) => {
      if (name === "economy") settled = false; // new year: abolition not yet reconciled
      if (name === "contraband") settled = true; // the chains come off here
      if (breaches.length) return;
      for (const v of checkInvariants(w, { label: name, settled }))
        breaches.push(`y${w.year} ${v}`);
    });
  }
  return { w, breaches };
}

test("invariants hold after every phase, every year (default galaxy)", () => {
  for (const seed of [1, 42, 99]) {
    const { breaches } = runChecked(seed, 250);
    assert.deepEqual(breaches, [], `seed ${seed}:\n  ${breaches.slice(0, 8).join("\n  ")}`);
  }
});

test("invariants hold under every authored preset", () => {
  // presets push the knobs to extremes (blood & iron, the long dark, crowded
  // sky) — exactly where a fragile invariant would snap. Shorter horizon each,
  // enough to exercise the mechanic each preset dials up.
  for (const preset of PRESETS) {
    const { breaches } = runChecked(7, 160, preset.overrides);
    assert.deepEqual(breaches, [], `preset "${preset.key}":\n  ${breaches.slice(0, 8).join("\n  ")}`);
  }
});

test("checkInvariants actually catches a deliberately broken world", () => {
  // a checker that never fires proves nothing — corrupt a world and confirm
  // each planted breach is reported
  const w = genGalaxy(3);
  simulateYear(w);
  const live = w.systems.filter((s) => s.pop > 0.05);
  live[0].pop = NaN;
  live[1].stock.grain = -5;
  const ruin = live[2]; // corrupt a distinct system so the breaches don't collide
  ruin.ruined = true; ruin.pop = 0; ruin.fid = 0; // a ruin flying a flag
  const report = checkInvariants(w).join("\n");
  assert.match(report, /pop non-finite/);
  assert.match(report, /stock\.grain non-finite\/negative/);
  assert.match(report, /ruined yet flagged/);
});
