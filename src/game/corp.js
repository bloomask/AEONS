import { BASE_PRICE } from "../sim/constants.js";
import { clamp } from "../sim/util.js";

// ---------------------------------------------------------------------------
// The player's corporation and its fleet — the heart of the tycoon layer.
// Plain data + pure helpers; all state changes go through actions.js, all time
// advance through game.js. No rng: the corp economy is fully deterministic in
// the sequence of (day, action) events, which is what makes saves and replays
// exact.
// ---------------------------------------------------------------------------

// Freighter classes: the trade-off is cargo vs speed vs running cost. `speed`
// is lane-units crossed per day; `upkeep` and `cost` are in credits (upkeep is
// an annual figure, charged daily).
export const SHIP_CLASSES = {
  clipper:   { label: "clipper",     cargo: 20,  speed: 95, upkeep: 0.5, cost: 30 },
  freighter: { label: "freighter",   cargo: 60,  speed: 58, upkeep: 1.0, cost: 60 },
  bulk:      { label: "bulk hauler",  cargo: 150, speed: 36, upkeep: 1.8, cost: 120 },
};

export function foundCorp(name, { cash = 400, home = 0 } = {}) {
  return {
    name, cash, home,          // home = HQ system id
    ships: [], _nextShipId: 0,
    ledger: [],                // recent transactions (for UI + audit)
    day: 0,                    // absolute days elapsed since founding
    founded: null,             // set to the world year at newGame()
    insured: false,            // fleet insurance against corsair losses
    depots: {},                // systemId -> { sys, stock: {good: qty} } warehousing
    loans: [],                 // { kind:"sys"|"fac", id, principal, rate, missed, since }
    holdings: [],              // system ids the corp owns as company towns
    rep: {},                   // factionId -> standing with that power (-100..100)
    stats: { trades: 0, raided: 0, lent: 0, foreclosed: 0 },
  };
}

export function makeShip(id, classKey, location) {
  return {
    id, class: classKey,
    location,                  // system id when docked, null when in transit
    cargo: {},                 // good -> qty aboard
    transit: null,             // { dest, from, dist, remaining, path, exposure } when moving
    route: null,               // standing route: { stops:[{sys,buy,sell}], leg } (game.js services it)
  };
}

export const shipCargoQty = (ship) => Object.values(ship.cargo).reduce((a, b) => a + b, 0);
export const shipSpace = (ship) => SHIP_CLASSES[ship.class].cargo - shipCargoQty(ship);
// resale value of a hull — you don't get the full commission back
export const shipResale = (ship) => SHIP_CLASSES[ship.class].cost * 0.6;

// value of a ship's cargo at the going price where it sits (or heads)
function cargoValue(ship, view) {
  const sid = ship.location != null ? ship.location : ship.transit?.dest;
  const sv = sid != null ? view.sys[sid] : null;
  let v = 0;
  for (const [g, q] of Object.entries(ship.cargo)) v += q * (sv ? sv.price[g] : BASE_PRICE[g]);
  return v;
}

// goods warehoused in a depot, valued at that system's going price
function depotValue(corp, view) {
  let v = 0;
  for (const d of Object.values(corp.depots)) {
    const sv = view.sys[d.sys];
    for (const [g, q] of Object.entries(d.stock)) v += q * (sv ? sv.price[g] : BASE_PRICE[g]);
  }
  return v;
}

/**
 * Total net worth: cash + hull resale + cargo + warehoused goods + loans
 * outstanding + company towns, all valued at market. `view` is the current
 * interpolated day-view (game.view()); `world` lets holdings be valued live.
 */
export function netWorth(corp, view, world) {
  let w = corp.cash;
  for (const sh of corp.ships) w += shipResale(sh) + cargoValue(sh, view);
  w += depotValue(corp, view);
  for (const l of corp.loans) w += l.principal;
  if (world) for (const sid of corp.holdings) w += clamp(Math.max(0, world.systems[sid].wealth) * 0.5, 0, 200);
  return w;
}

export function logLedger(corp, text, delta) {
  corp.ledger.push({ day: corp.day, text, delta: +delta.toFixed(2), balance: +corp.cash.toFixed(2) });
  if (corp.ledger.length > 200) corp.ledger.shift();
}
