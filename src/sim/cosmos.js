import { makeRng } from "./rng.js";
import { clamp } from "./util.js";

// ---------------------------------------------------------------------------
// The physical make-up of a star system — its sun and its worlds.
//
// This is descriptive worldbuilding layered on top of the engine's abstract
// endowments (fert/min/rare/en/hab): a system's star class and its planets are
// generated to be CONSISTENT with those numbers — a fertile, habitable world
// gets a warm star and a green homeworld; a mineral-rich one gets asteroid
// belts and slag worlds; an energy-rich one gets gas giants. So what the player
// reads matches what the simulation runs on.
//
// Crucially it draws from a per-system sub-RNG derived from the seed, NOT the
// world's main `w.rng`. Generation is deterministic yet touches nothing the
// simulation consumes — the year-to-year history is byte-for-byte unchanged.
// (Making composition DRIVE the endowments, rather than describe them, is the
// natural next step; the endowments keep their meaning either way.)
// ---------------------------------------------------------------------------

// Spectral classes and stellar remnants, each with the quality of its
// habitable zone (`hab`, how kind it is to life) and a flare-proneness. Colors
// are for the UI. Weights bias selection, but the pick is nudged toward the
// world's actual habitability so the star and its worlds agree.
export const STAR_TYPES = [
  { key: "M", label: "red dwarf", color: "#E0664A", hab: 0.5, flare: 0.9, w: 34 },
  { key: "K", label: "orange dwarf", color: "#E8A24B", hab: 0.92, flare: 0.4, w: 20 },
  { key: "G", label: "yellow star", color: "#F2E7A8", hab: 1.0, flare: 0.3, w: 13 },
  { key: "F", label: "yellow-white star", color: "#F6F2D8", hab: 0.82, flare: 0.35, w: 8 },
  { key: "A", label: "white star", color: "#DCE6F7", hab: 0.5, flare: 0.55, w: 6 },
  { key: "B", label: "blue giant", color: "#AEC6F7", hab: 0.3, flare: 0.75, w: 3 },
  { key: "binary", label: "binary pair", color: "#F2C87B", hab: 0.62, flare: 0.5, w: 8 },
  { key: "redgiant", label: "red giant", color: "#E0553A", hab: 0.28, flare: 0.6, w: 4 },
  { key: "whitedwarf", label: "white dwarf", color: "#DCE9F2", hab: 0.2, flare: 0.85, w: 3 },
  { key: "pulsar", label: "neutron star", color: "#BFE6FF", hab: 0.05, flare: 1.0, w: 1 },
];
export const STAR_BY_KEY = Object.fromEntries(STAR_TYPES.map((s) => [s.key, s]));

// World and body types. `orbit` orders them sunward→outward for display;
// `settle` marks bodies that can carry a population (the homeworld is the most
// hospitable settleable body). `color` is the UI tint.
export const BODY_TYPES = {
  terran:   { label: "terran world",   color: "#6FBF73", orbit: 2, settle: true },
  ocean:    { label: "ocean world",    color: "#4BA3E8", orbit: 2, settle: true },
  savanna:  { label: "savanna world",  color: "#B8C94A", orbit: 2, settle: true },
  desert:   { label: "desert world",   color: "#D9A24B", orbit: 1, settle: true },
  tundra:   { label: "tundra world",   color: "#9FD0D9", orbit: 4, settle: true },
  ice:      { label: "ice world",      color: "#BFE0E8", orbit: 5, settle: true },
  volcanic: { label: "volcanic world", color: "#C0392B", orbit: 0, settle: true },
  barren:   { label: "barren rock",    color: "#9AA5B5", orbit: 1, settle: true },
  toxic:    { label: "toxic world",    color: "#8E7CC0", orbit: 1, settle: false },
  gasgiant: { label: "gas giant",      color: "#D9A05B", orbit: 6, settle: false },
  icegiant: { label: "ice giant",      color: "#6FC7D9", orbit: 7, settle: false },
  belt:     { label: "asteroid belt",  color: "#B0A18A", orbit: 3, settle: false },
};

// weighted pick from [{...,w}] using a sub-rng
function wpick(sub, items, weight) {
  let tot = 0;
  for (const it of items) tot += weight(it);
  let r = sub.n() * tot;
  for (const it of items) { r -= weight(it); if (r <= 0) return it; }
  return items[items.length - 1];
}

// the star, chosen by its base rarity but pulled toward a habitable-zone that
// fits the world's habitability — warm stars over green worlds, remnants over dead ones
function pickStar(sub, s) {
  const want = s.hab;
  // base rarity, sharply weighted toward stars whose habitable zone matches the
  // world — a green world gets a warm sun, a dead one a dim star or a remnant
  return wpick(sub, STAR_TYPES, (t) => t.w * Math.pow(Math.max(0.05, 1.1 - Math.abs(t.hab - want)), 4)).key;
}

// the homeworld type, read off the world's own fertility and habitability.
// `life` is the same hab-and-fert blend genGalaxy ranks settlement by, so the
// homeworld the player sees matches the world the engine chose to settle;
// fertility gets extra pull on greenness so a lush world reads as green.
function primaryType(sub, s) {
  const { hab, fert } = s;
  const life = hab * 0.6 + fert * 0.4;
  if (life > 0.6 && fert > 0.5) return sub.chance(0.45) ? "ocean" : "terran";
  if (life > 0.48 && fert > 0.35) return sub.chance(0.5) ? "terran" : "savanna";
  if (life > 0.45) return sub.chance(0.5) ? "savanna" : "desert";
  if (life > 0.33) return sub.chance(0.5) ? "desert" : "tundra";
  if (life > 0.2) return sub.chance(0.5) ? "tundra" : "ice";
  if (fert < 0.12 && hab < 0.2) return sub.chance(0.5) ? "volcanic" : "barren";
  return "barren";
}

/**
 * A star and a set of worlds consistent with a system's endowments.
 * Deterministic in (seed, s.id); does not touch the world's main rng.
 * @returns {{ star: string, bodies: {t:string,size:number,primary?:boolean,moons?:number}[] }}
 */
export function genComposition(seed, s) {
  const sub = makeRng((((seed >>> 0) * 2654435761) ^ ((s.id + 1) * 40503)) >>> 0);
  const star = pickStar(sub, s);
  const bodies = [];
  const add = (t) => bodies.push({ t, size: +(sub.range(0.4, 1.8)).toFixed(2) });

  // the homeworld, marked primary
  const home = primaryType(sub, s);
  bodies.push({ t: home, size: +(sub.range(0.7, 1.6)).toFixed(2), primary: true });

  // resource bodies that justify the endowments the engine will use
  const mineQ = s.min; // mining quality at founding (reserves are full)
  if (mineQ > 0.55) add(sub.chance(0.5) ? "belt" : "volcanic");
  if (mineQ > 0.75) add("belt");
  if (s.rare > 0.5) add("volcanic");                 // rare-earth veins run through hard rock
  if (s.en > 0.5) add("gasgiant");                   // fuel from the gas giants
  if (s.en > 0.75) add(sub.chance(0.5) ? "gasgiant" : "icegiant");

  // a couple of lifeless siblings for texture, capped at a sane orbit count
  const filler = ["barren", "ice", "toxic", "gasgiant", "belt", "tundra"];
  const target = 2 + sub.int(0, 3);
  let guard = 0;
  while (bodies.length < target && guard++ < 8) add(sub.pick(filler));

  // moons for the giants (flavor only)
  for (const b of bodies)
    if (b.t === "gasgiant" || b.t === "icegiant") b.moons = sub.int(1, 12);

  // order them sunward → outward, homeworld keeping its slot
  bodies.sort((a, b) => (BODY_TYPES[a.t].orbit - BODY_TYPES[b.t].orbit) || (b.primary ? 1 : 0) - (a.primary ? 1 : 0));
  return { star, bodies };
}

// the settled/primary world of a composed system
export function primaryBody(s) {
  return s.bodies ? s.bodies.find((b) => b.primary) || s.bodies[0] : null;
}

// a compact one-line description: "a yellow star with 5 worlds, chief among
// them a terran homeworld" — used by the gazetteer and tooltips
export function describeComposition(s) {
  if (!s.bodies || !s.bodies.length) return "";
  const star = STAR_BY_KEY[s.star];
  const home = primaryBody(s);
  const n = s.bodies.length;
  const worlds = n === 1 ? "a single world" : `${numberWord(n)} worlds`;
  const chief = home ? `, chief among them ${article(BODY_TYPES[home.t].label)}` : "";
  return `${article(star ? star.label : "star")} lighting ${worlds}${chief}`;
}

function article(str) { return (/^[aeiou]/i.test(str) ? "an " : "a ") + str; }
function numberWord(n) {
  return ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"][n] || String(n);
}
