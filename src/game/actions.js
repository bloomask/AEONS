import { GOODS } from "../sim/constants.js";
import { clamp } from "../sim/util.js";
import { SHIP_CLASSES, makeShip, shipSpace, logLedger } from "./corp.js";
import { shortestPath } from "./pathfind.js";

// ---------------------------------------------------------------------------
// Player intents — the trade & logistics action surface. Each validates, then
// mutates the corp (never the macro world), reading prices off the current
// interpolated day-view. Every action returns { ok, ... } or { ok:false, error }
// so the UI and tests can react. No rng: outcomes are a pure function of the
// day, the day-view, and the order.
// ---------------------------------------------------------------------------

const err = (error) => ({ ok: false, error });
const getShip = (game, id) => game.corp.ships.find((s) => s.id === id);

// buying scarce goods, or dumping a lot at once, moves the fill price against
// you — slippage rises with order size relative to what's on the local market
const slippage = (qty, stock) => clamp(qty / (Math.max(0, stock) + qty), 0, 0.5);

/** The most of `good` this ship could buy here, limited by hold and cash. */
export function maxBuy(game, shipId, good) {
  const ship = getShip(game, shipId);
  if (!ship || ship.location == null || !GOODS.includes(good)) return 0;
  const sv = game.view().sys[ship.location];
  const space = shipSpace(ship);
  let q = 0;
  // walk up until the next unit is unaffordable or the hold is full
  while (q < space) {
    const unit = sv.price[good] * (1 + slippage(q + 1, sv.stock[good]));
    if ((q + 1) * unit > game.corp.cash + 1e-9) break;
    q++;
  }
  return q;
}

/** Commission a new hull of `classKey` at HQ. */
export function commission(game, classKey) {
  const spec = SHIP_CLASSES[classKey];
  if (!spec) return err("unknown ship class");
  if (game.corp.cash < spec.cost) return err("insufficient cash");
  game.corp.cash -= spec.cost;
  const ship = makeShip(game.corp._nextShipId++, classKey, game.corp.home);
  game.corp.ships.push(ship);
  logLedger(game.corp, `commissioned a ${spec.label}`, -spec.cost);
  return { ok: true, ship };
}

/** Buy `qty` of `good` into the ship's hold at its current system. */
export function buy(game, shipId, good, qty) {
  const ship = getShip(game, shipId);
  if (!ship) return err("no such ship");
  if (ship.location == null) return err("ship is in transit");
  if (!GOODS.includes(good)) return err("not a tradable good");
  if (!(qty > 0)) return err("quantity must be positive");
  if (qty > shipSpace(ship)) return err("not enough cargo space");
  const sv = game.view().sys[ship.location];
  const unit = sv.price[good] * (1 + slippage(qty, sv.stock[good]));
  const cost = unit * qty;
  if (cost > game.corp.cash) return err("insufficient cash");
  game.corp.cash -= cost;
  ship.cargo[good] = (ship.cargo[good] || 0) + qty;
  logLedger(game.corp, `bought ${qty} ${good} @ ${unit.toFixed(2)}`, -cost);
  return { ok: true, qty, unit, cost };
}

/** Sell `qty` of `good` from the ship's hold at its current system. */
export function sell(game, shipId, good, qty) {
  const ship = getShip(game, shipId);
  if (!ship) return err("no such ship");
  if (ship.location == null) return err("ship is in transit");
  if (!(qty > 0)) return err("quantity must be positive");
  const held = ship.cargo[good] || 0;
  if (qty > held) return err("not enough cargo aboard");
  const sv = game.view().sys[ship.location];
  const unit = sv.price[good] * (1 - slippage(qty, sv.stock[good]));
  const take = unit * qty;
  game.corp.cash += take;
  ship.cargo[good] = held - qty;
  if (ship.cargo[good] <= 1e-9) delete ship.cargo[good];
  logLedger(game.corp, `sold ${qty} ${good} @ ${unit.toFixed(2)}`, take);
  return { ok: true, qty, unit, revenue: take };
}

/** Send a docked ship to `dest` along the gate network. */
export function dispatch(game, shipId, dest) {
  const ship = getShip(game, shipId);
  if (!ship) return err("no such ship");
  if (ship.location == null) return err("ship is already in transit");
  if (ship.location === dest) return err("ship is already there");
  const route = shortestPath(game.w, ship.location, dest);
  if (!route) return err("no route to destination");
  ship.transit = { dest, from: ship.location, dist: route.dist, remaining: route.dist, path: route.path };
  ship.location = null;
  return { ok: true, eta: Math.max(1, Math.ceil(route.dist / SHIP_CLASSES[ship.class].speed)), dist: +route.dist.toFixed(1) };
}
