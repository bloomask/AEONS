import { GameClock } from "./clock.js";
import { foundCorp, netWorth, SHIP_CLASSES } from "./corp.js";

// ---------------------------------------------------------------------------
// The Game: the player's corporation living on the two-clock galaxy. It owns the
// GameClock (which keeps the macro-sim advancing deterministically) and the
// corp, and advances both a day at a time — the clock interpolates the galaxy,
// while the corp's ships cross the void and its books accrue upkeep.
//
// The macro-sim is never mutated here; the corp is a price-taker for now (P0),
// so the galaxy is unchanged (`npm run sim` stays byte-identical). Player
// influence on the macro-economy arrives in a later phase.
// ---------------------------------------------------------------------------

export class Game {
  /**
   * @param {import("../sim/types.js").World} w  a world at the year play begins
   * @param {{ corpName?: string, home?: number, cash?: number, daysPerYear?: number }} [opts]
   */
  constructor(w, opts = {}) {
    this.w = w;
    this.clock = new GameClock(w, { daysPerYear: opts.daysPerYear });
    const home = opts.home != null ? opts.home : bestHub(w);
    this.corp = foundCorp(opts.corpName || "New Charter Company", { cash: opts.cash ?? 400, home });
    this.corp.founded = this.clock.year;
  }

  /** The interpolated day-view of the galaxy. */
  view() { return this.clock.view(); }
  get year() { return this.clock.year; }
  get day() { return this.clock.day; }
  netWorth() { return netWorth(this.corp, this.view()); }

  /**
   * Advance the game by `n` days: step the two-clock (macro-sim at each year
   * boundary), move ships in transit, and charge daily upkeep.
   */
  stepDay(n = 1) {
    for (let i = 0; i < n; i++) {
      this.clock.tick(1);
      this.corp.day++;
      for (const sh of this.corp.ships) {
        if (!sh.transit) continue;
        sh.transit.remaining -= SHIP_CLASSES[sh.class].speed;
        if (sh.transit.remaining <= 0) { sh.location = sh.transit.dest; sh.transit = null; }
      }
      // annual upkeep, charged per day
      const daily = this.corp.ships.reduce((a, sh) => a + SHIP_CLASSES[sh.class].upkeep, 0) / this.clock.daysPerYear;
      if (daily) this.corp.cash -= daily;
    }
  }
}

// a sensible default HQ: the most populous living world (a busy market)
function bestHub(w) {
  let best = 0, bp = -1;
  for (const s of w.systems) if (s.pop > bp) { bp = s.pop; best = s.id; }
  return best;
}
