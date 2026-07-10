import { genHouseName } from "./names.js";
import { log } from "./events.js";

export function foundHouse(w, rng, home, ships, wealth) {
  const h = {
    id: w.houses.length, name: genHouseName(rng, home),
    home: home.id, wealth, ships, dead: false,
    foundedYear: w.year, diedYear: null, peakWealth: wealth,
  };
  w.houses.push(h);
  if (w.year > 0) {
    w.stats.c.houseFounded++;
    log(w, "house", `${h.name} is chartered at ${home.name}, ${ships.toFixed(0)} hulls under its banner.`, home.id);
  }
  return h;
}
