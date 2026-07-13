import { log, facRef, houseRef, sysRef } from "../events.js";

// --- the galactic credit market: loans, defaults, and panics ---
// Megacorps lend to struggling worlds and desperate governments. Interest
// flows back up; defaults burn the lender. Too many defaults too fast — or
// a big creditor going under — freezes credit galaxy-wide for years: no new
// loans, thinner cargo financing, colony charters shelved. Depressions
// propagate down the lanes the same way the money did.
export function runFinance(w, rng) {
  const C = w.credit;
  if (C.crunch > 0) C.crunch--;
  C.defaults = C.defaults.filter((y) => w.year - y <= 10);

  const lenders = () => w.houses.filter((h) => !h.dead && h.corp && h.wealth > 180);
  const lentBy = (hid) => w.loans.reduce((a, l) => a + (l.lender === hid ? l.principal : 0), 0);

  // --- service the book ---
  for (const l of [...w.loans]) {
    const lender = w.houses[l.lender];
    // a dead creditor's ledgers burn with it — the debt simply evaporates
    if (lender.dead) {
      w.loans.splice(w.loans.indexOf(l), 1);
      continue;
    }
    const isSys = l.kind === "sys";
    const b = isSys ? w.systems[l.bid] : w.factions[l.bid];
    const gone = isSys ? b.pop <= 0.05 : b.dead;
    const cash = isSys ? b.wealth : b.treasury;
    const interest = l.principal * l.rate;

    if (gone) { defaultOn(w, l, lender, isSys ? b.name : `the ${b.name}`); continue; }

    if (cash > interest) {
      if (isSys) b.wealth -= interest; else b.treasury -= interest;
      lender.wealth += interest;
      l.missed = 0;
      // the healthy amortize; the ledger shrinks
      const healthy = isSys ? b.wealth > 60 : b.treasury > 80;
      if (healthy) {
        const chunk = Math.min(l.principal, l.principal * 0.25 + 4);
        if (isSys) b.wealth -= chunk; else b.treasury -= chunk;
        lender.wealth += chunk;
        l.principal -= chunk;
        if (l.principal < 2) {
          w.loans.splice(w.loans.indexOf(l), 1);
          log(w, "credit", `${isSys ? b.name : "The " + b.name} retires its debt to ${lender.name}. The collection gunboats stand down.`, isSys ? b.id : null, {
            actors: [isSys ? sysRef(b) : facRef(b)], targets: [houseRef(lender)],
            cause: "credit.repaid", why: "a healthy borrower amortized the book down",
          });
        }
      }
    } else if (++l.missed >= 4) {
      defaultOn(w, l, lender, isSys ? b.name : `the ${b.name}`);
      if (isSys) { b.wealth -= 10; b.dev = Math.max(0.3, b.dev - 0.05); } // credit ruined, projects halt
    }
  }

  // --- new lending, unless the market is frozen ---
  if (C.crunch <= 0) {
    const pool = lenders();
    if (pool.length) {
      // reconstruction loans to promising but broke worlds
      const borrowers = w.systems.filter((s) =>
        s.pop > 3 && s.wealth < 10 && !s.siege && (s.dev > 0.75 || s.tradeIn > 6) &&
        w.year - s.lastFamine > 8 &&
        !w.loans.some((l) => l.kind === "sys" && l.bid === s.id));
      for (const s of borrowers) {
        if (!rng.chance(0.1)) continue;
        const lender = pool.filter((h) => lentBy(h.id) < h.wealth * 1.2)
          .sort((a, b) => b.wealth - a.wealth)[0];
        if (!lender) break;
        const P = rng.range(40, 70);
        lender.wealth -= P; s.wealth += P;
        s.dev = Math.min(3, s.dev + 0.04); // the money builds docks and refineries
        w.loans.push({ kind: "sys", bid: s.id, lender: lender.id, principal: P, rate: rng.range(0.07, 0.1), since: w.year, missed: 0 });
        w.stats.c.loanMade++;
        log(w, "credit", `${lender.name} floats a reconstruction loan to ${s.name} — ${P.toFixed(0)}cr against future dock fees.`, s.id, {
          actors: [houseRef(lender)], targets: [sysRef(s)], cause: "credit.loan",
          why: "a promising world too broke to rebuild on its own",
          effects: [{ k: "credits", d: P, u: "cr" }],
        });
      }
      // war bonds and bailouts for desperate treasuries
      for (const f of w.factions) {
        if (f.dead || f.gov === "pirate") continue;
        const atWar = Object.entries(w.relations).some(([k, r]) => r.war && k.split("|").map(Number).includes(f.id));
        const desperate = f.treasury < -20 || (atWar && f.treasury < 30);
        if (!desperate || !rng.chance(0.2)) continue;
        if (w.loans.filter((l) => l.kind === "fac" && l.bid === f.id).length >= 2) continue;
        const lender = pool.filter((h) => lentBy(h.id) < h.wealth * 1.2)
          .sort((a, b) => b.wealth - a.wealth)[0];
        if (!lender) break;
        const P = rng.range(60, 120);
        lender.wealth -= P; f.treasury += P;
        w.loans.push({ kind: "fac", bid: f.id, lender: lender.id, principal: P, rate: rng.range(0.08, 0.12), since: w.year, missed: 0 });
        w.stats.c.loanMade++;
        log(w, "credit", atWar
          ? `${lender.name} underwrites the ${f.name}'s war bonds — ${P.toFixed(0)}cr for the fleet yards, at a hard rate.`
          : `${lender.name} bails out the treasury of the ${f.name} with ${P.toFixed(0)}cr. The customs houses now answer to two masters.`, f.capital, {
          actors: [houseRef(lender)], targets: [facRef(f)],
          cause: atWar ? "credit.war-bonds" : "credit.bailout",
          why: atWar ? "a treasury bleeding for its fleets" : "a treasury sinking below its obligations",
          effects: [{ k: "credits", d: P, u: "cr" }],
        });
      }
    }
  }

  // --- panic: the market seizes ---
  const bigLenderDied = w.houses.some((h) =>
    h.dead && h.diedYear === w.year && w.loans.filter((l) => l.lender === h.id).length >= 2);
  if (C.crunch <= 0 && (C.defaults.length >= 4 || bigLenderDied)) {
    C.crunch = rng.int(4, 8);
    C.panics++;
    C.lastPanic = w.year;
    w.stats.c.panic++;
    log(w, "credit", `THE PANIC OF ${w.year}: counting houses across the galaxy slam their shutters. Credit is dead; cargo waits on the docks for financing that never comes.`, null, {
      sev: 3, cause: "credit.panic",
      why: bigLenderDied
        ? "a great creditor went under with its book still open"
        : `${C.defaults.length} defaults inside a decade broke the market's nerve`,
      effects: [{ k: "credit-frozen", v: C.crunch, u: "yr" }],
    });
  }
}

function defaultOn(w, l, lender, borrowerName) {
  w.loans.splice(w.loans.indexOf(l), 1);
  w.credit.defaults.push(w.year);
  w.stats.c.loanDefault++;
  log(w, "credit", `${borrowerName[0].toUpperCase() + borrowerName.slice(1)} defaults on ${l.principal.toFixed(0)}cr owed to ${lender.name}. The paper is worthless.`, l.kind === "sys" ? l.bid : null, {
    actors: [l.kind === "sys" ? sysRef(l.bid) : facRef(l.bid)], targets: [houseRef(lender)],
    cause: "credit.default", why: "the borrower could no longer service the paper",
    effects: [{ k: "credits", d: -l.principal, u: "cr" }],
  });
}
