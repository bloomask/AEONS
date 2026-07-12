import { BASE_PRICE } from "../sim/constants.js";
import { genGalaxy } from "../sim/galaxy.js";
import { simulateYear } from "../sim/simulate.js";
import { GameClock } from "./clock.js";
import { foundCorp, netWorth, logLedger, shipSpace, SHIP_CLASSES } from "./corp.js";
import { buy, sell, dispatch, maxBuy, DEPOT } from "./actions.js";
import { PIRACY, raidRng } from "./piracy.js";
import { flushMacro } from "./capital.js";

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
    this.factionId = null;   // set when the player charters a state (statecraft.js)
    // player influence on the galaxy is queued here and applied once a year, via
    // the clock's onAdvance hook, just before each macro step
    this.macroQueue = [];
    const home = opts.home != null ? opts.home : bestHub(w);
    this.corp = foundCorp(opts.corpName || "New Charter Company", { cash: opts.cash ?? 400, home });
    // the clock fires onAdvance during construction, so the corp must exist first
    this.clock = new GameClock(w, {
      daysPerYear: opts.daysPerYear,
      onAdvance: (world) => flushMacro(this, world),
    });
    this.corp.founded = this.clock.year;
  }

  /** The interpolated day-view of the galaxy. */
  view() { return this.clock.view(); }
  get year() { return this.clock.year; }
  get day() { return this.clock.day; }
  netWorth() { return netWorth(this.corp, this.view(), this.w); }

  /**
   * Advance the game by `n` days: step the two-clock (macro-sim at each year
   * boundary), move ships in transit, and charge daily upkeep.
   */
  stepDay(n = 1) {
    for (let i = 0; i < n; i++) {
      this.clock.tick(1);
      this.corp.day++;
      // move ships in transit; corsairs may skim those crossing raided waters
      for (const sh of this.corp.ships) {
        if (!sh.transit) continue;
        this._maybeRaid(sh);
        sh.transit.remaining -= SHIP_CLASSES[sh.class].speed;
        if (sh.transit.remaining <= 0) { sh.location = sh.transit.dest; sh.transit = null; }
      }
      this._charge();       // upkeep + insurance premium
      this._serviceRoutes(); // standing routes buy/sell and re-dispatch on arrival
    }
  }

  // a per-ship, per-day corsair roll on the lanes it is crossing
  _maybeRaid(sh) {
    const exp = sh.transit.exposure || 0;
    if (exp <= 0) return;
    const chance = PIRACY.BASE_DAILY * exp * (this.w.cfg.piracy ?? 1);
    if (raidRng(this.w, sh.id, this.corp.day).n() >= chance) return;
    let lost = 0;
    for (const g of Object.keys(sh.cargo)) {
      const take = sh.cargo[g] * PIRACY.LOSS;
      sh.cargo[g] -= take;
      if (sh.cargo[g] <= 1e-9) delete sh.cargo[g];
      lost += take * (BASE_PRICE[g] || 1);
    }
    let reimburse = 0;
    if (this.corp.insured && lost > 0) { reimburse = lost * PIRACY.REIMBURSE; this.corp.cash += reimburse; }
    this.corp.stats.raided++;
    logLedger(this.corp,
      `corsairs raided a convoy — ${lost.toFixed(0)}cr of cargo lost${this.corp.insured ? `, insurer paid ${reimburse.toFixed(0)}` : ""}`,
      reimburse);
  }

  _charge() {
    let annual = 0;
    for (const sh of this.corp.ships) {
      const spec = SHIP_CLASSES[sh.class];
      annual += spec.upkeep + (this.corp.insured ? spec.cost * PIRACY.PREMIUM_RATE : 0);
    }
    annual += Object.keys(this.corp.depots).length * DEPOT.UPKEEP;
    if (annual) this.corp.cash -= annual / this.clock.daysPerYear;
  }

  // a docked ship on a standing route executes its stop, then heads to the next
  _serviceRoutes() {
    for (const sh of this.corp.ships) {
      if (!sh.route || sh.location == null) continue;
      const stop = sh.route.stops[sh.route.leg];
      if (sh.location !== stop.sys) { dispatch(this, sh.id, stop.sys); continue; }
      for (const o of stop.buy || []) {
        const q = Math.min(o.qty, maxBuy(this, sh.id, o.good), shipSpace(sh));
        if (q > 0) buy(this, sh.id, o.good, q);
      }
      for (const g of stop.sell || []) {
        const held = sh.cargo[g] || 0;
        if (held > 0) sell(this, sh.id, g, held);
      }
      sh.route.leg = (sh.route.leg + 1) % sh.route.stops.length;
      const next = sh.route.stops[sh.route.leg].sys;
      if (next !== sh.location) dispatch(this, sh.id, next);
    }
  }
}

// a sensible default HQ: the most populous living world (a busy market)
function bestHub(w) {
  let best = 0, bp = -1;
  for (const s of w.systems) if (s.pop > bp) { bp = s.pop; best = s.id; }
  return best;
}

/**
 * Start a fresh game from a seed: build the galaxy, burn in its history, and
 * charter the player's corp. Records genesis params + an empty action log so the
 * game can be serialized and replayed exactly (save.js).
 */
export function newGame(seed, opts = {}) {
  const cfg = opts.cfg || undefined;
  const burnYears = opts.burnYears ?? 120;
  const w = genGalaxy(seed, cfg);
  for (let i = 0; i < burnYears; i++) simulateYear(w);
  const g = new Game(w, opts);
  g.genesis = {
    seed, cfg: cfg || null, burnYears,
    corpName: opts.corpName || null, cash: opts.cash ?? 400,
    home: g.corp.home, daysPerYear: opts.daysPerYear || null,
  };
  g.actionLog = [];
  return g;
}
