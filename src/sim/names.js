import { CULTURES } from "./constants.js";

export function genName(rng, cult) {
  const s = cult.syll;
  let n = rng.pick(s) + rng.pick(s);
  if (rng.chance(0.4)) n += rng.pick(s);
  n = n[0].toUpperCase() + n.slice(1);
  if (rng.chance(0.12)) n += " " + rng.pick(["Prime", "II", "Reach", "Gate", "Deep"]);
  return n;
}

export function genHouseName(rng, sys) {
  const cult = CULTURES.find((c) => c.name === sys.cultName) || CULTURES[0];
  const base = genName(rng, cult).split(" ")[0];
  return rng.pick([
    `House ${base}`, `${base} & Sons`, `The ${base} Combine`,
    `${base} Freightways`, `${base} Starlift`,
  ]);
}
