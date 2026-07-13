import { makeRng } from "./rng.js";
import { rebuildAdj } from "./galaxy.js";
import { EVENT_SEV } from "./events.js";

// ---------------------------------------------------------------------------
// Versioned save / load of the world object.
//
// The whole simulation is one big mutable `w` (see types.js). Everything in it
// is plain JSON-safe data EXCEPT two fields:
//   • `w.rng` — a closure over a 32-bit counter. We snapshot that counter so
//     the generator resumes its stream exactly (determinism is sacred).
//   • `w.adj` — pure derived index rebuilt from `w.edges` by `rebuildAdj`.
// So a save is: a version tag + the rng counter + the rest of `w` verbatim.
//
// This module is DOM-free engine code: it produces/consumes plain objects and
// never touches localStorage, files, or `Date` (the UI layer owns storage and
// timestamps — see ui/saves.js). Keep it that way so `npm run sim` and the
// tests can round-trip a save headlessly.
// ---------------------------------------------------------------------------

// Bump when the world shape changes in a way an old save can't be loaded as-is,
// and add a step to MIGRATIONS below to carry old saves forward.
export const SAVE_VERSION = 2;

// Human-readable tag stored on every save so a stray blob is recognizable and
// we can refuse to load something that isn't one of ours.
export const SAVE_MAGIC = "aeons.save";

/**
 * Snapshot the live world into a plain, JSON-serializable object.
 * The returned object shares no functions with `w`; the caller may
 * `JSON.stringify` it directly. It does copy references to `w`'s arrays, so
 * stringify (or otherwise consume it) before advancing the simulation again.
 * @param {object} w  a live world (from genGalaxy / simulateYear)
 * @returns {object}  the versioned snapshot
 */
export function serializeWorld(w) {
  // strip the two non-data fields; keep everything else by reference
  const { rng, adj, ...rest } = w;
  return {
    magic: SAVE_MAGIC,
    v: SAVE_VERSION,
    // denormalized headline fields so a loader can show a save list without
    // parsing the whole world blob
    seed: w.seed,
    year: w.year,
    rngState: rng.snapshot(),
    world: rest,
  };
}

/**
 * Rebuild a live, runnable world from a snapshot (migrating older versions
 * forward first). Returns a world you can pass straight to `simulateYear`.
 * @param {object} snap  a snapshot from `serializeWorld` (already JSON-parsed)
 * @returns {object}  a live world
 */
export function deserializeWorld(snap) {
  const migrated = migrateSave(snap);
  const w = migrated.world;
  // restore the generator to the exact counter it held when saved, then
  // rebuild the derived adjacency from the (data-only) edges
  w.rng = makeRng(w.seed, migrated.rngState);
  rebuildAdj(w);
  return w;
}

/**
 * Validate that `snap` looks like one of our saves and can be loaded by this
 * build. Throws an Error with a player-facing message otherwise. Returns the
 * (possibly migrated) snapshot on success.
 */
export function migrateSave(snap) {
  if (!snap || typeof snap !== "object" || snap.magic !== SAVE_MAGIC) {
    throw new Error("Not an AEONS save file.");
  }
  let v = snap.v;
  if (typeof v !== "number" || !Number.isFinite(v)) {
    throw new Error("Save is missing a version and cannot be loaded.");
  }
  if (v > SAVE_VERSION) {
    throw new Error(
      `This save was made by a newer version of AEONS (format v${v}); ` +
      `this build understands up to v${SAVE_VERSION}.`
    );
  }
  if (!snap.world || typeof snap.world !== "object") {
    throw new Error("Save is corrupt: no world data.");
  }
  // walk each migration step from the save's version up to the current one
  let cur = snap;
  while (v < SAVE_VERSION) {
    const step = MIGRATIONS[v];
    if (!step) {
      throw new Error(`No migration path from save format v${v}.`);
    }
    cur = step(cur);
    cur.v = v + 1;
    v++;
  }
  return cur;
}

// Ordered migration steps: MIGRATIONS[n] upgrades a v(n) snapshot to v(n+1).
// Each is a pure transform of the snapshot object; future world-shape changes
// add their upgrade here so old saves keep loading.
const MIGRATIONS = {
  // v1 → v2: structured, durable chronicle. Old events carried only
  // {y, t, s, sysId, i}; give them the structured fields (with severity
  // derived from type), add the decade-digest store, and drop the retired
  // per-system 12-entry history (the local record is now derived from the
  // global archive). Old saves had already trimmed their log to 800 entries,
  // so a migrated archive simply starts at its earliest surviving record.
  1: (snap) => {
    const world = { ...snap.world };
    world.events = (world.events || []).map((ev) => ({
      sev: EVENT_SEV[ev.t] ?? 2,
      actors: [], targets: [],
      systems: ev.sysId !== null && ev.sysId !== undefined ? [ev.sysId] : [],
      cause: null, why: null, effects: [],
      ...ev,
    }));
    world.eventAgg = world.eventAgg || [];
    world.systems = (world.systems || []).map((s) => {
      const { history, ...rest } = s;
      return rest;
    });
    return { ...snap, world };
  },
};
