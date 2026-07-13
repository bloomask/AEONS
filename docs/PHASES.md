# Phase contracts

The simulation advances one year as an **ordered pipeline** of phases
(`src/sim/simulate.js`, exposed as `PHASES`). Order is a contract: each phase
mutates the shared world object `w` in place, and later phases read what earlier
ones wrote. This file records, per phase, what it **reads**, **mutates**,
**creates**, and **expects** from the phases before it. Keep it current when you
add or reorder a phase — and slot new mechanics into the order deliberately
(changing the *order* of `w.rng` calls changes history).

Two cross-cutting rules hold for every phase:

- **`alive` is snapshotted once**, at the top of the year, before `economy`
  runs (`w.systems.filter(s => s.pop > 0.05)`). Every phase receives that same
  array. A phase that starves a world to nothing must guard `s.pop <= 0.05`
  itself — the snapshot does not update mid-year.
- **Randomness goes through `w.rng` only.** Reordering rng calls within a phase
  rewrites history even though the tests still pass (they catch nondeterminism,
  not reordering).

Invariants that must hold after **every** phase (finiteness, non-negative
stocks, ownership pointing at a living faction, ruin state, ranges) are checked
by `checkInvariants` (`src/sim/invariants.js`); see the tables' **Invariant
notes**. One invariant — slavery legality — is reconciled *within* the year by
the `contraband` phase, so it is only guaranteed from `contraband` onward (pass
`{settled:false}` before it).

---

## Pipeline order

| # | phase | signature | one-line role |
|---|-------|-----------|---------------|
| 1 | `economy` | `(w, rng, alive)` | production, consumption, prices, demography, unrest |
| 2 | `trade` | `(w, rng)` | arbitrage across gates; merchant-house economics |
| 3 | `finance` | `(w, rng)` | the credit market: loans, defaults, panics |
| 4 | `settlement` | `(w, rng, alive)` | migration, colonization, infrastructure, system death |
| 5 | `politics` | `(w, rng, alive)` | internal rule → diplomacy/war → new powers |
| 6 | `pirates` | `(w, rng, alive)` | corsair havens, raids, suppression |
| 7 | `contraband` | `(w, rng, alive)` | narcotics + the slave trade; **abolition reconciled here** |
| 8 | `projects` | `(w, rng)` | megaprojects funded from treasuries |
| 9 | `shocks` | `(w, rng, alive)` | plague, flare, ore strikes, gate flux, culture drift |
| 10 | `faith` | `(w, rng, alive)` | conversion along lanes, schism in isolation |
| 11 | `tech` | `(w, rng, alive)` | galaxy-wide research toward the next era |
| 12 | `figures` | `(w)` | the ruling cast: seats leaders, handles succession |
| 13 | `chronicle` | `(w, rng)` | yearly stats snapshot, traces, era detection |

---

## 1. economy — `phases/economy.js`

- **Reads:** `s.pop, fert, min, en, minRes/minRes0, enRes/enRes0, dev, rare,
  infra, shares, price, stock, classes, classWb, wbEma, slaves`; `w.relations`
  (who is at war → arms demand); `w.cfg.{fertility,growth,unrest}`;
  `w.cartelMul`; `w.tech` (via `techFx`).
- **Mutates:** `s.stock` (production, consumption, spoilage), `s.price` (from
  scarcity), `s.shares` (labor reallocation), `s.minRes/enRes` (depletion),
  `s.classWb, wb, wbEma, classes` (via `socialMobility`), `s.unrest`, `s.pop`
  (growth + famine), `s.peakPop, dev, wealth`, `s.lastFamine, famineCd`,
  `s.riotCd`, and **resets** `s.tradeIn/tradeOut/flow` to 0 for the trade phase.
- **Creates:** famine/riot events + `stats.c.{famine,riot}`; `records.worstFamine`.
- **Expects:** the yearly `alive` snapshot. First real phase of the year — reads
  last year's ending state.
- **Invariant notes:** the source of most numeric health — leaves `stock ≥ 0`,
  `price > 0`, `classes` summing to 1, `wb/unrest/classWb` in band.

## 2. trade — `phases/trade.js`

- **Reads:** `s.price, stock, wealth, pop, siege, fid, infra, mega`; `e.d, vol`;
  `w.relations` (war/embargo/allied/tariff sever or zero-duty a lane);
  `w.cfg.freight`; `w.credit.crunch`; `w.houses`; `w.tech` (freight discount).
- **Mutates:** `s.stock, wealth, tradeIn, tradeOut, flow`; `e.vol, net`;
  `f.treasury` (border duties); `h.{wealth,ships,depots,sponsored,corp,name,
  income,inc*,peakWealth,trace,dead,home,stateId}`; `s.infra.gate, s.depots`
  (corp depots); `records.richestHouse`.
- **Creates:** new houses, corporate states (`foundCorporateState`), depots,
  cartels/feuds/takeovers (`runHouseIntrigues`); many `stats.c` commerce counters.
- **Expects:** `economy` has set fresh `s.price` and zeroed `tradeIn/out/flow`
  this year; `finance` has NOT run yet (crunch state is from last year).
- **Invariant notes:** the only phase filling `tradeIn/out` — `finance`,
  `settlement`, `politics`, and `pirates` all read it.

## 3. finance — `phases/finance.js`

- **Reads:** `w.loans`, `w.houses` (corp lenders), `s.{pop,wealth,dev,tradeIn,
  siege,lastFamine}`, `f.{treasury,dead,gov}`, `w.relations` (war → war bonds),
  `w.credit`.
- **Mutates:** `s.wealth, dev`; `f.treasury`; `h.wealth`; `w.loans` (add/remove,
  `l.principal, missed`); `w.credit.{crunch,defaults,panics,lastPanic}`.
- **Creates:** loans, defaults, panics + `stats.c.{loanMade,loanDefault,panic}`.
- **Expects:** `trade` has updated `s.tradeIn` and house wealth (lender pool and
  borrower eligibility both key off them).

## 4. settlement — `phases/settlement.js`

- **Reads:** `s.{wb,pop,siege,fid,hab,fert,min,rare,ruined,diedYear,wealth,
  tradeIn,infra,minRes/minRes0}`, `w.adj`, `w.houses` (corp backers),
  `w.credit.crunch`, `w.cfg.migration`.
- **Mutates:** `s.pop, classes` (`movePop`); founds colonies (sets a dead/empty
  neighbor's `pop, fid, dev, stock, shares, faith, unrest, settledYear`, resets
  its underworld); `s.infra` (building); **system death** — sets `ruined, pop=0,
  fid=null, siege=null, freePort=false, slaves/drugs/drugLoad=0`, records the
  death, relocates a lost capital.
- **Creates:** colony/resettle/build events; `stats.deaths`; `stats.c.{colony,
  resettle,build,colonySponsored}`.
- **Expects:** `economy` set this year's `wb` (drives migration & colonization);
  runs **before** `politics` so newly dead worlds don't get taxed or fought over.
- **Invariant notes:** the phase that must leave a **clean ruin** (dead-system
  state invariant) — it zeroes the contraband fields as well as pop/fid/siege.

## 5. politics — `phases/politics.js` → `internal` → `diplomacy` → `newPowers`

- **Reads:** `f.*`, member systems, `w.relations`, `w.adj`, `s.{wealth,tradeIn,
  cult,unrest,wb,stock,freePort,slaves}`, `w.cfg.{upheaval,expansion,aggression,
  diplomacy}`, faith majorities.
- **Mutates:** `f.{treasury,stability,peakSystems,peakPop,gov,dead,...}`;
  `s.fid` (annex/secede/free-port/conquest), `s.freePort`; `w.relations`
  (`rivalry, allied, embargo, war`); war runs battles/sieges (`runWarYear`):
  `s.pop, stock.weapons, siege, lastWar, infra, slaves`, `stats.wars[*]`.
- **Creates:** wars, embargoes, accords, revolutions, secessions, annexations,
  new pirate havens, corporate→republic/empire flips; many `stats.c` counters.
- **Expects:** `trade` set `tradeIn` (tax base, annex targets) and `settlement`
  removed dead worlds. War frees/binds slaves on conquest — but a **secession or
  revolt here can leave a republic holding slaves until `contraband`**.

## 6. pirates — `phases/pirates.js`

- **Reads:** `e.vol` (raidable traffic), `w.adj`/`jumpHops` (raid & suppression
  reach), `f.{gov,treasury,grievance,stability,capital}`, member systems,
  `w.relations`, `w.cfg.piracy`, `stats.wars` (demobilization spike).
- **Mutates:** `s.wealth` (raided), `f.{treasury,lootY,grievance,stability,
  capital}`, `s.fid/freePort` (recruits, burned-out havens, scattering fleets),
  `s.lastWar`.
- **Creates:** pirate havens (`foundPirateHaven`), raids/suppressions/scatters
  + `stats.c.{raids,suppressions,pirateScatters}`; kills havens (`killFaction`).
- **Expects:** `trade` set `e.vol` (there is nothing to raid before it); runs
  after `politics` so this year's conquests and demob crews are settled.

## 7. contraband — `phases/contraband.js`

- **Reads:** `s.{pop,dev,stock.grain,outlaw,fid,wealth,wb,slaves,drugs,drugLoad,
  unrest}`, `f.gov` (legality via `GOV_CONTRABAND`), `w.adj`/`w.edges`,
  `w.cfg.contraband`.
- **Mutates:** `s.drugs, drugLoad, price.drugs/slaves, unrest, wealth`;
  `s.slaves` (refine/ship/bind/free/revolt), `s.pop, classes` (`addWorkers`
  on manumission/uprising); `f.treasury` (busts, vice cut). **Frees slaves on
  every abolitionist world — this is where the abolition invariant is made true.**
- **Creates:** drug/slave trade + bust/revolt/enslave events; `stats.c.{drugTrade,
  drugBust,slaveTrade,enslaved,slavesFreed,slaveRevolt}`.
- **Expects:** runs after `politics`/`pirates` so this year's regime changes and
  conquests are settled before legality is reconciled.
- **Invariant notes:** **after this phase**, no republic/corporate world holds
  slaves and every slave holding sits on a lawful slaving world (`{settled:true}`).

## 8. projects — `phases/projects.js`

- **Reads:** `w.projects`, `f.{treasury,gov,dead}`, member systems (`tradeIn,
  pop,hab,fert,mega`).
- **Mutates:** `p.{progress,done,abandoned,endedYear}`, `f.treasury`; on
  completion `s.mega.{nexus,arcology,terraformed}`, and for terraform `s.fert,
  hab`.
- **Creates:** projects; `stats.c.{megaStarted,megaBuilt,megaAbandoned}`.
- **Expects:** treasuries set by `politics`/`finance` this year.

## 9. shocks — `phases/shocks.js`

- **Reads:** `s.{pop,stock,minRes0,cult}`, `e.vol` (culture drift), `w.edges`,
  `w.systems`, `w.cfg.{plague,flare,oreStrikes,gateFlux}`, `w.tech` (plague med).
- **Mutates:** `s.pop, classes` (`skewDeaths`), `s.stock` (flare/plague spend),
  `s.minRes` (strike), `s.lastPlague`, `s.cult`; `w.edges` (gate open/close →
  `rebuildAdj`).
- **Creates:** plague/flare/strike/gate events; `stats.c.{plague,flare,strike,
  gateOpen,gateClose}`.
- **Expects:** `alive` snapshot; guards `s.pop <= 0.05` (an earlier famine may
  have emptied a listed world).

## 10. faith — `phases/faith.js`

- **Reads:** `e.vol`, `s.{pop,faith,tradeIn,cultName}`, `w.faiths`.
- **Mutates:** `s.faith`; `w.faiths` (schism appends a creed).
- **Creates:** conversion/schism events; `stats.c.{conversion,schism}`.
- **Expects:** `trade` set `e.vol`/`tradeIn` (conversion rides busy lanes;
  schism needs isolation, `tradeIn <= 2`).

## 11. tech — `phases/tech.js`

- **Reads:** `s.{dev,pop,classes,price.electronics}` of `alive`, `w.tech`,
  `w.cfg.research`.
- **Mutates:** `w.tech.{progress,level,history}`.
- **Creates:** breakthrough events; `stats.c.breakthrough`. (Effects apply
  galaxy-wide next year via `techFx`.)
- **Expects:** `economy` set this year's `dev`/`price.electronics`.

## 12. figures — `phases/figures.js`

- **Reads:** `f.{gov,capital,foundedYear,dead,ruler}`, the capital's `cultName`.
- **Mutates:** `f.ruler` only — seats a leader for any power lacking one, and on
  regime change or a reign's natural end installs a successor.
- **Creates:** occasional `reign` chronicle events (a long reign ending). Adds no
  `stats.c` counter and draws from a per-faction sub-rng, NOT `w.rng` — so, like
  `cosmos.js`, it is descriptive and leaves the simulation's numbers byte-identical.
- **Expects:** runs after every faction death / regime change is settled
  (`politics`, `pirates`, `war`), so the cast reflects the year's final map.

## 13. chronicle — `phases/chronicle.js`

- **Reads:** the whole settled world (pop, price, wb, unrest, classes, fid,
  faction/house liveness, `e.vol`, `w.loans`, `w.credit`, `w.tech`).
- **Mutates:** appends `stats.series[year]`; per-system `s.trace`; per-faction
  `f.trace`; `w.{peaceYears,popPeak100,era,eras}`. Once a decade it also runs
  `compactChronicle` (events.js): minor (sev 1) events past their keep window
  are folded out of `w.events` into the per-decade digests in `w.eventAgg` —
  major/notable events are never touched.
- **Creates:** the yearly stats row (what `buildStats` and the balance lab read)
  and era-name events.
- **Expects:** runs **last** — every other phase has finished mutating, so the
  snapshot is the year's settled truth. `buildStats`/`balance.js` consume it.
