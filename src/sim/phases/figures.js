import { makeRng } from "../rng.js";
import { CULTURES } from "../constants.js";
import { log, facRef } from "../events.js";

// --- the cast of history: who actually rules each power ---
// A persistent named leader for every faction, with a title fitting its
// government, a reign that begins at accession, and a natural succession when
// the reign runs its course or the regime changes. Purely descriptive — like
// system composition, it is drawn from a per-figure sub-rng seeded off the
// world seed, NOT `w.rng`, and increments no stats counter, so the simulation's
// numbers are byte-for-byte unchanged. It only adds names, faces, and the odd
// line in the chronicle when a long reign ends.

export const TITLES = {
  empire: ["Emperor", "Empress", "Autarch", "Sovereign", "Overlord", "High Regent"],
  republic: ["First Consul", "Premier", "Chancellor", "President", "Prime Speaker"],
  corporate: ["Director", "Chief Executive", "Chairman", "Executive Regent", "Board-Master"],
  pirate: ["Corsair King", "Reaver-Captain", "Black Admiral", "Sea Lord", "Pirate Prince"],
};

const EPITHETS = [
  "the Bold", "the Grey", "the Wise", "the Cruel", "the Younger", "the Elder",
  "the Iron", "the Pale", "the Undying", "the Lawgiver", "the Navigator",
  "the Grim", "the Radiant", "the Silent", "the Wanderer", "the Great",
];

function cultOf(w, f) {
  const cap = w.systems[f.capital];
  return CULTURES.find((c) => c.name === (cap ? cap.cultName : "")) || CULTURES[0];
}

function personName(sub, cult) {
  const s = cult.syll;
  let n = sub.pick(s) + sub.pick(s);
  if (sub.chance(0.4)) n += sub.pick(s);
  return n[0].toUpperCase() + n.slice(1);
}

// a leader for faction `f` acceding in `since`. Deterministic in
// (seed, faction id, accession year); never draws from w.rng.
function seatRuler(w, f, since) {
  const sub = makeRng((((w.seed >>> 0) * 2246822519) ^ ((f.id + 1) * 3266489917) ^ ((since + 1) * 668265263)) >>> 0);
  const cult = cultOf(w, f);
  const titles = TITLES[f.gov] || TITLES.republic;
  let name = personName(sub, cult);
  if (sub.chance(0.4)) name += " " + sub.pick(EPITHETS);
  return { name, title: sub.pick(titles), since, gov: f.gov, tenure: sub.int(16, 46) };
}

export function runFigures(w) {
  for (const f of w.factions) {
    if (f.dead) {
      // a fallen power's last leader is remembered, but rules no more
      if (f.ruler && f.ruler.ended == null) f.ruler.ended = w.year;
      continue;
    }
    // seat a leader the first time we see a power (founders date from their
    // founding year; new powers from now) — silently: the founding is already
    // in the chronicle
    if (!f.ruler || f.ruler.ended != null) { f.ruler = seatRuler(w, f, f.foundedYear); continue; }

    const r = f.ruler;
    // regime change: the old dynasty falls with the old flag. revolt.js has
    // already narrated the upheaval, so swap in the new government's leader quietly.
    if (r.gov !== f.gov) { f.ruler = seatRuler(w, f, w.year); continue; }

    // natural succession at the end of a reign
    const reign = w.year - r.since;
    if (reign >= r.tenure) {
      const heir = seatRuler(w, f, w.year);
      // only a long, memorable reign ending earns a line in the chronicle —
      // otherwise the record would drown in accessions
      if (reign >= 25) {
        log(w, "reign",
          `After ${reign} years, ${r.title} ${r.name} of the ${f.name} passes; ${heir.title} ${heir.name} accedes.`,
          f.capital, {
            actors: [facRef(f)], cause: "reign.succession",
            why: `${r.title} ${r.name}'s long reign ran its natural course`,
            effects: [{ k: "reign-years", v: reign, u: "yr" }],
          });
      }
      f.ruler = heir;
    }
  }
}
