import { GOODS } from "./constants.js";
import { allowsSlaves } from "./constants.js";

// ---------------------------------------------------------------------------
// World invariants — the properties that must hold at EVERY step, not only at
// the end of a run. `checkInvariants(w)` reads the world and returns a list of
// violation strings (empty === healthy). It never mutates `w`, so it is safe to
// call after any phase (see simulateYear's `onPhase` hook) or in dev builds.
//
// These are the load-bearing truths the engine's mechanics assume of each
// other. A phase that leaves one broken has a bug the summary stats would hide
// for centuries — catching it against the phase that caused it is the point.
// ---------------------------------------------------------------------------

const ALIVE = 0.05; // "alive" means pop > 0.05 — the one threshold, everywhere

// finite AND within [lo, hi] (inclusive). NaN/Infinity fail the first test.
const inRange = (v, lo, hi) => Number.isFinite(v) && v >= lo && v <= hi;

/**
 * @param {import("./types.js").World} w
 * @param {{ label?: string, settled?: boolean }} [opts]
 *   label   — prefixed to every violation (e.g. the phase just run).
 *   settled — enforce invariants that the pipeline reconciles *within* a year
 *             rather than after every phase. The one such invariant is slavery
 *             legality: a republic born by secession mid-`politics`, or a free
 *             world conquered by an abolitionist, still holds slaves until the
 *             `contraband` phase strikes the chains. So abolition is guaranteed
 *             from `contraband` onward and at year boundaries, NOT after the
 *             earlier phases. Defaults to true (a settled, end-of-step world).
 * @returns {string[]} violation messages; empty means all invariants hold.
 */
export function checkInvariants(w, opts = {}) {
  const out = [];
  const at = opts.label ? `[${opts.label}] ` : "";
  const bad = (msg) => out.push(at + msg);
  const settled = opts.settled !== false;
  const yr = w.year;

  // ---- systems: population, money, inventory, dead-system state ----
  for (const s of w.systems) {
    const who = `sys ${s.id} (${s.name})`;

    // population: always finite and non-negative, whatever else is wrong
    if (!Number.isFinite(s.pop) || s.pop < 0)
      bad(`${who} pop non-finite/negative: ${s.pop}`);

    // dead-system state: a ruin is empty, flies no flag, holds no siege, and
    // carries no bonded population — resettlement starts from a clean slate
    if (s.ruined) {
      if (s.pop > ALIVE) bad(`${who} is ruined yet holds ${s.pop}M`);
      if (s.fid !== null) bad(`${who} is ruined yet flagged by faction ${s.fid}`);
      if (s.siege) bad(`${who} is ruined yet under siege`);
      if (s.slaves > 0.01) bad(`${who} is ruined yet holds ${s.slaves}M slaves`);
    }

    // free ports never fly a flag; a flagged system is not a free port
    if (s.freePort && s.fid !== null)
      bad(`${who} is a free port yet flagged by faction ${s.fid}`);

    // money: wealth is always a real number (it may legitimately go negative)
    if (!Number.isFinite(s.wealth)) bad(`${who} wealth non-finite: ${s.wealth}`);

    // wellbeing / social pyramid stay in their defined bands
    if (!inRange(s.wb, 0, 5)) bad(`${who} wb out of range: ${s.wb}`);
    if (!inRange(s.unrest, 0, 1)) bad(`${who} unrest out of range: ${s.unrest}`);
    if (!inRange(s.drugLoad, 0, 1)) bad(`${who} drugLoad out of range: ${s.drugLoad}`);
    let classSum = 0;
    for (const c of Object.keys(s.classes)) {
      if (!inRange(s.classes[c], -1e-6, 1.0001)) bad(`${who} class ${c} share out of range: ${s.classes[c]}`);
      if (!inRange(s.classWb[c], 0, 5)) bad(`${who} class ${c} wb out of range: ${s.classWb[c]}`);
      classSum += s.classes[c];
    }
    // class shares are a distribution — they sum to 1 for any living world
    if (s.pop > ALIVE && !inRange(classSum, 0.999, 1.001))
      bad(`${who} class shares sum to ${classSum.toFixed(4)}, not 1`);

    // inventory: every good's stock and price are finite and non-negative
    for (const g of GOODS) {
      if (!Number.isFinite(s.stock[g]) || s.stock[g] < -1e-6)
        bad(`${who} stock.${g} non-finite/negative: ${s.stock[g]}`);
      if (!Number.isFinite(s.price[g]) || s.price[g] < 0)
        bad(`${who} price.${g} non-finite/negative: ${s.price[g]}`);
    }

    // contraband fields: their own dedicated storage, same finiteness rules
    if (!Number.isFinite(s.slaves) || s.slaves < -1e-6)
      bad(`${who} slaves non-finite/negative: ${s.slaves}`);
    if (!Number.isFinite(s.drugs) || s.drugs < -1e-6)
      bad(`${who} drugs non-finite/negative: ${s.drugs}`);

    // reserves never dip below zero (economy clamps them, but assert it)
    if (s.minRes < -1e-6) bad(`${who} minRes negative: ${s.minRes}`);
    if (s.enRes < -1e-6) bad(`${who} enRes negative: ${s.enRes}`);

    // ---- faction ownership: a flag must point at a living owner ----
    if (s.fid !== null) {
      const f = w.factions[s.fid];
      if (!f) bad(`${who} flagged by unknown faction ${s.fid}`);
      else if (f.dead) bad(`${who} flagged by dead faction ${f.name} (${s.fid})`);
    }

    // ---- slavery legality: the load-bearing abolition invariant ----
    // no republic or corporate world ever holds slaves; a free world holds
    // them only when its own outlaw streak tolerates the trade. Reconciled by
    // the contraband phase, so only enforced on a settled world (see `settled`).
    if (settled && s.slaves > 0.01) {
      const gov = s.fid !== null ? w.factions[s.fid]?.gov : null;
      if (!allowsSlaves(gov ?? null, s.outlaw))
        bad(`${who} holds ${s.slaves.toFixed(2)}M slaves under ${gov ?? "free/" + (s.outlaw ? "outlaw" : "lawful")} — abolition invariant broken`);
    }
  }

  // ---- factions: living owners have a real capital; money is finite ----
  for (const f of w.factions) {
    if (!Number.isFinite(f.treasury)) bad(`faction ${f.name} (${f.id}) treasury non-finite: ${f.treasury}`);
    if (!inRange(f.stability, 0, 1)) bad(`faction ${f.name} (${f.id}) stability out of range: ${f.stability}`);
    if (f.dead) {
      // a dead power flies no flags anywhere — settlement/war reassign on death
      const held = w.systems.some((s) => s.fid === f.id);
      if (held) bad(`dead faction ${f.name} (${f.id}) still owns a system`);
      continue;
    }
    const cap = w.systems[f.capital];
    if (!cap) bad(`faction ${f.name} (${f.id}) has no capital system ${f.capital}`);
  }

  // ---- houses & loans: finite ledgers, borrowers exist ----
  for (const h of w.houses) {
    if (!Number.isFinite(h.wealth)) bad(`house ${h.name} (${h.id}) wealth non-finite: ${h.wealth}`);
    if (!Number.isFinite(h.ships) || h.ships < -1e-6) bad(`house ${h.name} (${h.id}) ships non-finite/negative: ${h.ships}`);
  }
  for (const l of w.loans) {
    if (!Number.isFinite(l.principal) || l.principal < 0)
      bad(`loan (${l.kind} ${l.bid}) principal non-finite/negative: ${l.principal}`);
    if (!w.houses[l.lender]) bad(`loan (${l.kind} ${l.bid}) has unknown lender ${l.lender}`);
  }

  // ---- relations: reference known factions; war can't predate its year ----
  for (const [k, r] of Object.entries(w.relations)) {
    const [a, b] = k.split("|").map(Number);
    if (!w.factions[a] || !w.factions[b]) bad(`relation ${k} references unknown faction`);
    if (r.war && r.war.since > yr) bad(`relation ${k} war.since ${r.war.since} > year ${yr}`);
  }

  return out;
}

// A convenience for dev builds / assertions: throw on the first breach with a
// readable list. Kept out of the hot path — call it only where you want a hard
// stop (tests, a debug-mode `simulateYear` wrapper), never inside a phase loop.
export function assertInvariants(w, label) {
  const v = checkInvariants(w, { label });
  if (v.length) throw new Error(`world invariants broken:\n  ${v.join("\n  ")}`);
}
