import { clamp } from "../sim/util.js";
import { logLedger } from "./corp.js";

// ---------------------------------------------------------------------------
// The capital & industry layer — where the player stops being a mere trader and
// starts moving the galaxy. Money lent, invested, or extracted actually mutates
// the world, so from here the corp is a PRICE-MAKER: its influence folds into
// the macro-sim through the GameClock's onAdvance hook, once a year, just before
// the yearly step. With nothing queued this is inert and the sim is unchanged.
// No rng — every credit is deterministic, preserving replay.
// ---------------------------------------------------------------------------

export const CAPITAL = {
  DEFAULT_AFTER: 3,     // consecutive missed payments before a loan defaults
  FORECLOSE_AFTER: 2,   // arrears at which a system loan may be foreclosed
  DIVIDEND_RATE: 0.03,  // yearly cut a company town yields (and is bled of)
  DIVIDEND_CAP: 60,     // ceiling on a single holding's yearly dividend
};

const borrowerOf = (w, loan) => (loan.kind === "sys" ? w.systems[loan.id] : w.factions[loan.id]);
const borrowerGone = (w, loan) => (loan.kind === "sys" ? w.systems[loan.id].pop <= 0.05 : w.factions[loan.id].dead);
const borrowerCash = (b, kind) => (kind === "sys" ? b.wealth : b.treasury);
const payFrom = (b, kind, amt) => { if (kind === "sys") b.wealth -= amt; else b.treasury -= amt; };

/**
 * Apply the corp's influence to the world for one year. Called by the clock
 * immediately before simulateYear. Mutates `w` (the price-maker path) and the
 * corp's books; deterministic.
 */
export function flushMacro(game, w) {
  const corp = game.corp;

  // 1. one-shot intents queued during the year (money reaching its target)
  for (const it of game.macroQueue) {
    if (it.t === "inject") { const s = w.systems[it.sys]; if (s.pop > 0.05) s.wealth += it.amount; }
    else if (it.t === "grant") { const f = w.factions[it.fac]; if (!f.dead) f.treasury += it.amount; }
    else if (it.t === "develop") {
      const s = w.systems[it.sys];
      if (s.pop > 0.05) { s.wealth += it.wealth; s.dev = clamp(s.dev + it.dev, 0.3, 3); }
    }
  }
  game.macroQueue = [];

  // 2. service the loan book: interest in, healthy debtors amortize, deadbeats default
  for (const loan of [...corp.loans]) {
    if (borrowerGone(w, loan)) { drop(corp, loan, "defaulted"); continue; }
    const b = borrowerOf(w, loan);
    const cash = borrowerCash(b, loan.kind);
    const interest = loan.principal * loan.rate;
    if (cash > interest) {
      payFrom(b, loan.kind, interest); corp.cash += interest; loan.missed = 0;
      if (cash > interest + 40) {
        const chunk = Math.min(loan.principal, loan.principal * 0.2 + 3);
        payFrom(b, loan.kind, chunk); corp.cash += chunk; loan.principal -= chunk;
        if (loan.principal < 2) drop(corp, loan, "repaid");
      }
    } else if (++loan.missed >= CAPITAL.DEFAULT_AFTER) {
      drop(corp, loan, "defaulted");
    }
  }

  // 3. company towns pay their dividend (and are bled of it)
  for (const sid of corp.holdings) {
    const s = w.systems[sid];
    if (!s || s.pop <= 0.05) continue;
    const div = clamp(Math.max(0, s.wealth) * CAPITAL.DIVIDEND_RATE, 0, CAPITAL.DIVIDEND_CAP);
    if (div > 0) { s.wealth -= div; corp.cash += div; }
  }
}

function drop(corp, loan, why) {
  const i = corp.loans.indexOf(loan);
  if (i >= 0) corp.loans.splice(i, 1);
  logLedger(corp, `loan ${why} (${loan.kind} ${loan.id})`, why === "defaulted" ? 0 : 0);
}
