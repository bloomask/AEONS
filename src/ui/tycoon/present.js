import { GOODS, GOOD_LABEL } from "../../sim/constants.js";
import { SHIP_CLASSES, shipSpace, shipCargoQty } from "../../game/corp.js";
import { maxBuy } from "../../game/actions.js";
import { scorecard } from "../../game/score.js";

// ---------------------------------------------------------------------------
// Boardroom presenter — pure view-models for the tycoon UI. All the display
// logic lives here (testable, DOM-free); the React panel is a thin render of
// these objects plus buttons that dispatch commands. Nothing here mutates the
// game.
// ---------------------------------------------------------------------------

/** Headline dashboard: identity, clock, and the scorecard. */
export function overview(game) {
  const sc = scorecard(game);
  return { name: game.corp.name, ...sc };
}

/** One row per hull: what it is, where it is, and what it's carrying. */
export function fleetRows(game) {
  return game.corp.ships.map((sh) => {
    const spec = SHIP_CLASSES[sh.class];
    const cargo = Object.entries(sh.cargo).map(([g, q]) => `${Math.round(q)} ${GOOD_LABEL[g]}`).join(", ");
    const where = sh.location != null
      ? `docked · ${game.w.systems[sh.location].name}`
      : `in transit → ${game.w.systems[sh.transit.dest].name}`;
    return {
      id: sh.id, cls: sh.class, label: spec.label,
      docked: sh.location != null, at: sh.location,
      where, cargo: cargo || "empty",
      used: shipCargoQty(sh), cap: spec.cargo, space: shipSpace(sh),
      onRoute: !!sh.route,
    };
  });
}

/** Ids of the player's ships currently docked at a system (buy/sell targets). */
export function shipsAt(game, sysId) {
  return game.corp.ships.filter((sh) => sh.location === sysId).map((sh) => sh.id);
}

/**
 * The market at a system as the player sees it (interpolated prices), with the
 * max a given docked ship could buy of each good.
 */
export function marketRows(game, sysId, shipId = null) {
  if (sysId == null) return [];
  const sv = game.view().sys[sysId];
  return GOODS.map((g) => ({
    good: g, label: GOOD_LABEL[g],
    price: +sv.price[g].toFixed(2),
    stock: +sv.stock[g].toFixed(1),
    maxBuy: shipId != null ? maxBuy(game, shipId, g) : 0,
  }));
}

/** Ship classes available to commission, with cost and whether it's affordable. */
export function shipyard(game) {
  return Object.entries(SHIP_CLASSES).map(([key, s]) => ({
    key, label: s.label, cargo: s.cargo, speed: s.speed, upkeep: s.upkeep,
    cost: s.cost, affordable: game.corp.cash >= s.cost,
  }));
}

/** The most recent ledger entries, newest first. */
export function ledgerRows(game, n = 14) {
  return game.corp.ledger.slice(-n).reverse();
}

/** Milestones the corp has passed, as a labelled, ordered checklist. */
export function milestones(game) {
  const m = scorecard(game).milestones;
  return [
    { key: "megacorp", label: "Megacorp (500cr net worth)", done: m.megacorp },
    { key: "financier", label: "Financier (first loan)", done: m.financier },
    { key: "landlord", label: "Landlord (first company town)", done: m.landlord },
    { key: "sovereign", label: "Sovereign (chartered a state)", done: m.sovereign },
    { key: "titan", label: "Titan (3000cr net worth)", done: m.titan },
  ];
}
