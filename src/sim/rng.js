// ---------- rng ----------
export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A stateful mulberry32 whose internal counter can be read and restored, so
// the simulation's RNG can be saved and resumed byte-for-byte (see sim/save.js).
// The stepping math is identical to `mulberry32` above — same seed replays the
// same stream — it just keeps the counter in a variable we can snapshot.
export function makeRng(seed, state) {
  let a = (state == null ? seed : state) | 0;
  const f = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    n: f,
    range: (a2, b) => a2 + (b - a2) * f(),
    int: (a2, b) => Math.floor(a2 + (b - a2 + 1) * f()),
    pick: (arr) => arr[Math.floor(f() * arr.length)],
    chance: (p) => f() < p,
    gauss: () => (f() + f() + f() - 1.5) / 1.5,
    // opaque 32-bit counter — the sole mutable state of the generator
    snapshot: () => a,
    restore: (s) => { a = s | 0; },
  };
}
