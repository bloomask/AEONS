import { serializeWorld, deserializeWorld } from "../sim/index.js";

// ---------------------------------------------------------------------------
// The browser save store: manual named slots + a rotating ring of autosaves,
// all persisted to localStorage. This is the UI/storage layer — it owns
// timestamps, ids, and quota handling; the actual world (de)serialization and
// versioning lives in the engine (sim/save.js), which this delegates to.
//
// Layout in localStorage:
//   aeons.saves.index         → JSON array of light metadata rows (see SaveMeta),
//                               newest first. This is what the load menu reads.
//   aeons.saves.blob.<id>     → the full serialized world snapshot, one per save.
// Splitting the heavy blobs from the index keeps listing cheap and lets a
// single over-quota blob fail without corrupting the catalog.
// ---------------------------------------------------------------------------

const INDEX_KEY = "aeons.saves.index";
const BLOB_PREFIX = "aeons.saves.blob.";

// how many autosaves to keep before the oldest rotates out
export const AUTOSAVE_KEEP = 6;
// default cadence, in sim-years, between autosaves (the caller drives timing)
export const AUTOSAVE_EVERY = 25;

/**
 * @typedef {Object} SaveMeta
 * @property {string} id     unique slot id
 * @property {"manual"|"auto"} kind
 * @property {string} name   display label
 * @property {number} seed
 * @property {number} year   sim-year at save time
 * @property {number} savedAt  wall-clock ms (Date.now)
 * @property {number} v      save format version
 */

// localStorage may be unavailable (private mode, headless, disabled). Every
// access goes through these guards so the app degrades to "saving off" rather
// than throwing on load.
function store() {
  try {
    if (typeof localStorage === "undefined") return null;
    // touch it — some browsers throw on access in private mode
    const k = "aeons.saves.__probe";
    localStorage.setItem(k, "1");
    localStorage.removeItem(k);
    return localStorage;
  } catch {
    return null;
  }
}

export function savesAvailable() {
  return store() !== null;
}

function readIndex() {
  const ls = store();
  if (!ls) return [];
  try {
    const raw = ls.getItem(INDEX_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function writeIndex(ls, index) {
  ls.setItem(INDEX_KEY, JSON.stringify(index));
}

// a small, collision-resistant id without needing crypto everywhere
function makeId() {
  return (
    Date.now().toString(36) + "-" + Math.floor(Math.random() * 0x1000000).toString(36)
  );
}

/**
 * All saves, newest first. Cheap — reads only the metadata index.
 * @returns {SaveMeta[]}
 */
export function listSaves() {
  return readIndex()
    .slice()
    .sort((a, b) => b.savedAt - a.savedAt);
}

export function listManual() {
  return listSaves().filter((m) => m.kind === "manual");
}

export function listAutosaves() {
  return listSaves().filter((m) => m.kind === "auto");
}

/**
 * Serialize `world` and persist it as a new save. For autosaves, the oldest
 * beyond AUTOSAVE_KEEP is rotated out. Returns the created SaveMeta.
 * Throws if storage is unavailable or the quota is exceeded (with autosaves the
 * caller is expected to swallow the error — see safeAutosave).
 * @param {object} world  a live world
 * @param {{kind?: "manual"|"auto", name?: string}} [opts]
 * @returns {SaveMeta}
 */
export function saveWorld(world, opts = {}) {
  const ls = store();
  if (!ls) throw new Error("Saving is unavailable in this browser.");

  const kind = opts.kind === "auto" ? "auto" : "manual";
  const snap = serializeWorld(world);
  const id = makeId();
  const meta = {
    id,
    kind,
    name: opts.name || defaultName(kind, snap.year),
    seed: snap.seed,
    year: snap.year,
    savedAt: Date.now(),
    v: snap.v,
  };

  // write the heavy blob first; if it overflows quota we haven't touched the index
  let index = readIndex();
  try {
    ls.setItem(BLOB_PREFIX + id, JSON.stringify(snap));
  } catch (e) {
    // one retry after evicting every autosave (the expendable bulk); persist
    // that eviction so the index never points at a blob we just removed
    index = pruneAutosaves(ls, index, 0);
    writeIndex(ls, index);
    ls.setItem(BLOB_PREFIX + id, JSON.stringify(snap));
    void e;
  }

  index.push(meta);
  if (kind === "auto") index = pruneAutosaves(ls, index, AUTOSAVE_KEEP);
  writeIndex(ls, index);
  return meta;
}

// keep only the `keep` most-recent autosaves; delete the blobs of the rest.
// Mutates nothing on disk beyond removing evicted blobs; returns the trimmed index.
function pruneAutosaves(ls, index, keep) {
  const autos = index
    .filter((m) => m.kind === "auto")
    .sort((a, b) => b.savedAt - a.savedAt);
  const evict = autos.slice(keep);
  if (!evict.length) return index;
  const evicted = new Set(evict.map((m) => m.id));
  for (const m of evict) {
    try { ls.removeItem(BLOB_PREFIX + m.id); } catch { /* ignore */ }
  }
  return index.filter((m) => !evicted.has(m.id));
}

/**
 * Convenience wrapper for the autosave loop: never throws — on any failure
 * (quota, storage off) it returns null so the sim keeps running.
 * @returns {SaveMeta|null}
 */
export function safeAutosave(world) {
  try {
    return saveWorld(world, { kind: "auto" });
  } catch {
    return null;
  }
}

/**
 * Load a save by id and return a live, runnable world (rng and adjacency
 * restored). Throws if the save is missing, corrupt, or from a newer format.
 * @param {string} id
 * @returns {object}  a live world
 */
export function loadWorld(id) {
  const ls = store();
  if (!ls) throw new Error("Saving is unavailable in this browser.");
  const raw = ls.getItem(BLOB_PREFIX + id);
  if (!raw) throw new Error("That save could not be found.");
  let snap;
  try {
    snap = JSON.parse(raw);
  } catch {
    throw new Error("That save is corrupt and cannot be read.");
  }
  return deserializeWorld(snap);
}

/** The raw stored JSON text of a save, for downloading it as a file. */
export function readBlob(id) {
  const ls = store();
  const raw = ls && ls.getItem(BLOB_PREFIX + id);
  if (!raw) throw new Error("That save could not be found.");
  return raw;
}

/** Delete one save (blob + index row). No-op if it doesn't exist. */
export function deleteSave(id) {
  const ls = store();
  if (!ls) return;
  try { ls.removeItem(BLOB_PREFIX + id); } catch { /* ignore */ }
  writeIndex(ls, readIndex().filter((m) => m.id !== id));
}

/** Rename a manual save. Returns the updated index. */
export function renameSave(id, name) {
  const ls = store();
  if (!ls) return;
  const index = readIndex();
  const m = index.find((x) => x.id === id);
  if (m) { m.name = name; writeIndex(ls, index); }
}

// ---- file export / import (survives a cleared localStorage / moves machines) ----

/**
 * The exact bytes of a save, for downloading to a .aeons file. Serializes the
 * live world fresh so the download always reflects the current moment.
 */
export function exportBlob(world) {
  return JSON.stringify(serializeWorld(world));
}

/** A stable filename for a downloaded save. */
export function exportFilename(world) {
  return `aeons-save-seed${world.seed}-y${world.year}.aeons`;
}

/**
 * Parse an uploaded save file's text into a live world, and (optionally) file
 * it into the store as a manual save. Throws on anything that isn't a loadable
 * save. Returns the live world.
 */
export function importSave(text, { keep = true } = {}) {
  let snap;
  try {
    snap = JSON.parse(text);
  } catch {
    throw new Error("That file isn't valid JSON.");
  }
  // deserializeWorld validates the magic/version and throws a clear message
  const world = deserializeWorld(snap);
  if (keep && store()) {
    try { saveWorld(world, { kind: "manual", name: `Imported · year ${world.year}` }); }
    catch { /* import still succeeds even if it can't be filed */ }
  }
  return world;
}

function defaultName(kind, year) {
  return kind === "auto" ? `Autosave · year ${year}` : `Save · year ${year}`;
}
