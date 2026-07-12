import { simulateYear } from "../sim/simulate.js";
import { snapshot } from "./snapshot.js";
import { lerpSnapshot } from "./interpolate.js";

// ---------------------------------------------------------------------------
// The two-clock game clock.
//
// The authoritative simulation advances a year at a time and stays deterministic
// — this clock never changes that. It runs the world ONE YEAR AHEAD of what the
// player sees, keeping two keyframes: `base` (the year being lived) and
// `forecast` (the next computed year). The player experiences ~360 day-ticks per
// year, seeing `lerp(base, forecast, day/360)`; when the days roll over, the
// forecast becomes the new base and the world steps forward once more.
//
// So the macro-sim is untouched (K years of ticking == K calls to simulateYear,
// byte-identical), while the player gets a smooth daily galaxy on top.
// ---------------------------------------------------------------------------

export const DAYS_PER_YEAR = 360;

export class GameClock {
  /**
   * @param {import("../sim/types.js").World} w  a world at the year the game begins
   * @param {{ daysPerYear?: number }} [opts]
   */
  constructor(w, opts = {}) {
    this.w = w;
    this.daysPerYear = opts.daysPerYear || DAYS_PER_YEAR;
    this.day = 0;
    this.base = snapshot(w);   // the year the player starts in
    simulateYear(w);           // realize the next year to interpolate toward
    this.forecast = snapshot(w);
  }

  /** The year the player is currently living through. */
  get year() { return this.base.year; }

  /** Fraction through the lived year, 0..1. */
  get t() { return this.day / this.daysPerYear; }

  /** The interpolated day-view of the galaxy the UI should render. */
  view() { return lerpSnapshot(this.base, this.forecast, this.t); }

  /**
   * Advance the day clock by `n` days, stepping the macro-sim at each year
   * boundary. Returns the number of year rollovers that occurred.
   */
  tick(n = 1) {
    let rolled = 0;
    for (let i = 0; i < n; i++) {
      this.day++;
      if (this.day >= this.daysPerYear) {
        this.day = 0;
        this.base = this.forecast;   // yesterday's forecast is today's truth
        simulateYear(this.w);        // compute the next year to lerp toward
        this.forecast = snapshot(this.w);
        rolled++;
      }
    }
    return rolled;
  }
}
