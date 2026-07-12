import * as A from "./actions.js";
import * as S from "./statecraft.js";
import * as I from "./influence.js";

// ---------------------------------------------------------------------------
// The command layer — one dispatch point for every player action, and the
// recorder that makes saves possible. A game driven entirely through `apply`
// accumulates an ordered action log; re-running that log on a fresh galaxy of
// the same seed reproduces the game exactly (save.js). `step` (advance days) is
// itself a command, so time and orders interleave deterministically.
// ---------------------------------------------------------------------------

const HANDLERS = {
  commission: (g, c) => A.commission(g, c.cls),
  buy:        (g, c) => A.buy(g, c.ship, c.good, c.qty),
  sell:       (g, c) => A.sell(g, c.ship, c.good, c.qty),
  dispatch:   (g, c) => A.dispatch(g, c.ship, c.dest),
  setRoute:   (g, c) => A.setRoute(g, c.ship, c.stops),
  clearRoute: (g, c) => A.clearRoute(g, c.ship),
  insurance:  (g, c) => A.setInsurance(g, c.on),
  buildDepot: (g, c) => A.buildDepot(g, c.sys),
  store:      (g, c) => A.store(g, c.ship, c.good, c.qty),
  load:       (g, c) => A.load(g, c.ship, c.good, c.qty),
  lend:       (g, c) => A.lend(g, c.kind, c.id, c.principal, c.rate),
  invest:     (g, c) => A.invest(g, c.sys, c.amount),
  foreclose:  (g, c) => A.foreclose(g, c.loan),
  foundState: (g, c) => S.foundState(g, c.seat, c.name),
  annex:      (g, c) => S.annex(g, c.sys),
  colonize:   (g, c) => S.colonize(g, c.sys, c.funding),
  tariff:     (g, c) => S.setTariff(g, c.rate),
  transfer:   (g, c) => S.stateTransfer(g, c.amount),
  bribe:      (g, c) => I.bribe(g, c.fid, c.amount),
  stoke:      (g, c) => I.stokeRivalry(g, c.a, c.b, c.amount),
  sabotage:   (g, c) => I.sabotage(g, c.sys, c.amount),
  step:       (g, c) => ({ ok: true, rolled: g.stepDay(c.n || 1) }),
};

export const COMMANDS = Object.keys(HANDLERS);

/**
 * Execute a command against the game. When `record` (default true), the command
 * is appended to the game's action log for later save/replay.
 * @returns the action's result ({ ok, ... }).
 */
export function apply(game, cmd, record = true) {
  const h = HANDLERS[cmd.t];
  if (!h) return { ok: false, error: `unknown command "${cmd.t}"` };
  const result = h(game, cmd);
  // record only actions that took effect (a rejected order changed nothing)
  if (record && game.actionLog && result && result.ok) game.actionLog.push(cmd);
  return result;
}
