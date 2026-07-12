import { clamp } from "../sim/util.js";
import { factionColor } from "../sim/constants.js";
import { logLedger } from "./corp.js";

// ---------------------------------------------------------------------------
// Territory & statecraft — the top of the ladder, where the corp stops buying
// influence and starts wearing a flag. Founding a state creates a real, player-
// controlled faction on the map (flagged `player`, so the sim runs its economy
// but leaves its fate to you). From there you annex, colonise, tax, and rule.
// Structural changes (a flag, a new colony) are applied immediately to the
// world; the display catches up at the next year boundary.
// ---------------------------------------------------------------------------

export const STATE = { CHARTER_COST: 200, COLONY_MIN: 30 };

const err = (error) => ({ ok: false, error });
const isSystem = (game, id) => id >= 0 && id < game.w.systems.length;

/** Charter a corporate state: a real power on the map, seated at a living world. */
export function foundState(game, seat, name) {
  if (game.factionId != null) return err("your charter already flies");
  if (!isSystem(game, seat)) return err("not a real system");
  const w = game.w, s = w.systems[seat];
  if (s.pop <= 0.05) return err("the seat must be a living world");
  if (s.fid !== null && !game.corp.holdings.includes(seat)) return err("the seat is already claimed by another power");
  if (game.corp.cash < STATE.CHARTER_COST) return err("insufficient cash to charter a state");
  game.corp.cash -= STATE.CHARTER_COST;
  const f = {
    id: w.nextFid++, capital: seat, gov: "corporate",
    name: name || `${game.corp.name} Charter`,
    color: factionColor(w.nextFid - 1),
    aggr: 0.15, expans: 0.4, treasury: 60, stability: 0.85, tariff: 0.05,
    dead: false, foundedYear: w.year, peakSystems: 1, peakPop: s.pop, trace: [],
    player: true, corpId: null,
  };
  w.factions.push(f);
  game.factionId = f.id;
  s.fid = f.id; s.freePort = false;
  for (const sid of game.corp.holdings) { const h = w.systems[sid]; if (h.pop > 0.05) { h.fid = f.id; h.freePort = false; } }
  logLedger(game.corp, `chartered the ${f.name}`, -STATE.CHARTER_COST);
  return { ok: true, factionId: f.id };
}

/** Bring a free system (or one of your company towns) under your flag. */
export function annex(game, sys) {
  if (game.factionId == null) return err("charter a state first");
  if (!isSystem(game, sys)) return err("not a real system");
  const s = game.w.systems[sys];
  if (s.pop <= 0.05) return err("nothing to annex");
  if (s.fid !== null && s.fid !== game.factionId && !game.corp.holdings.includes(sys))
    return err("that world already flies another flag");
  s.fid = game.factionId; s.freePort = false;
  if (!game.corp.holdings.includes(sys)) game.corp.holdings.push(sys);
  logLedger(game.corp, `annexed ${s.name}`, 0);
  return { ok: true };
}

/** Found a company colony on an empty, habitable world. */
export function colonize(game, target, funding = STATE.COLONY_MIN) {
  if (!isSystem(game, target)) return err("not a real system");
  const t = game.w.systems[target];
  if (t.pop > 0.05) return err("already inhabited");
  if (t.hab < 0.25) return err("too hostile to settle");
  if (funding < STATE.COLONY_MIN) return err(`a colony needs at least ${STATE.COLONY_MIN}cr`);
  if (game.corp.cash < funding) return err("insufficient cash");
  game.corp.cash -= funding;
  const m = clamp(funding * 0.03, 0.3, 3);
  Object.assign(t, {
    pop: m, dev: 0.7, settledYear: game.w.year, peakPop: m,
    ruined: false, diedYear: null, unrest: 0, riotCd: 0,
    lastFamine: -99, lastPlague: -99, lastWar: -99, slaves: 0, drugs: 0, drugLoad: 0,
  });
  t.stock.grain = m * 4; t.stock.consumer = m;
  t.fid = game.factionId != null ? game.factionId : null;
  if (game.factionId != null) t.freePort = false;
  if (!game.corp.holdings.includes(target)) game.corp.holdings.push(target);
  logLedger(game.corp, `founded a company colony at ${t.name}`, -funding);
  return { ok: true };
}

/** Set the border duty your state charges (0..0.5). */
export function setTariff(game, rate) {
  if (game.factionId == null) return err("no state to govern");
  game.w.factions[game.factionId].tariff = clamp(rate, 0, 0.5);
  return { ok: true, tariff: game.w.factions[game.factionId].tariff };
}

/** Move credits between your corp and your state treasury (±). */
export function stateTransfer(game, amount) {
  if (game.factionId == null) return err("no state treasury");
  const f = game.w.factions[game.factionId];
  if (amount > 0) {
    if (game.corp.cash < amount) return err("insufficient cash");
    game.corp.cash -= amount; f.treasury += amount;
    logLedger(game.corp, `funded the state treasury`, -amount);
  } else {
    const take = Math.min(-amount, Math.max(0, f.treasury));
    f.treasury -= take; game.corp.cash += take;
    logLedger(game.corp, `drew a dividend from the state`, take);
  }
  return { ok: true };
}
