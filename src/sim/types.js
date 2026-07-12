// ---------------------------------------------------------------------------
// The shape of the world object — the single mutable state of the simulation.
// This file is documentation-as-code: pure JSDoc typedefs, no runtime exports.
// `genGalaxy` (galaxy.js) builds a World; every phase mutates it in place.
// KEEP THIS CURRENT when adding or renaming fields — it is the reference the
// rest of the codebase (and every future contributor) reads first.
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} System  A star system — the atomic unit of the sim.
 * @property {number} id       Index into `w.systems` (never reordered).
 * @property {string} name
 * @property {number} x        World-space position (map units).
 * @property {number} y
 * @property {number[]} cult   3-vector culture position, each 0..1; drifts with trade/isolation.
 * @property {string} cultName Founding culture's name (flavor only).
 * @property {number} fert     Fertility 0..1 — grain yield.
 * @property {number} min      Mining skill/quality 0..1.
 * @property {number} minRes   Remaining ore (depletes); `minRes0` = original.
 * @property {number} minRes0
 * @property {number} rare     Rare-earth richness 0..1 (heavily skewed low).
 * @property {number} en       Energy quality 0..1.
 * @property {number} enRes    Remaining fuel reserves; `enRes0` = original.
 * @property {number} enRes0
 * @property {number} hab      Habitability 0..1 — drives carrying capacity (config.js carryCap).
 * @property {number} pop      Population in millions. ALIVE means `pop > 0.05` — everywhere.
 * @property {number} dev      Development/industrialization level (starts 0.6).
 * @property {number} wealth   Accumulated credits; can go negative.
 * @property {Object<string,number>} stock   Stockpile per good (units), keys = GOODS.
 * @property {Object<string,number>} price   Local price per good, keys = GOODS.
 * @property {Object<string,number>} shares  Labor allocation per good (sums ~1).
 * @property {Object<string,number>} mfgEff  Manufacturing efficiency per recipe good.
 * @property {Object<string,number>} classes Population share per class, keys = CLASSES.
 * @property {Object<string,number>} classWb Wellbeing per class 0..1.
 * @property {number} wbEma   Smoothed (~4yr) worker wellbeing; drives next year's
 *   labor allocation (`hunger` in economy.js) so farming responds to the trend,
 *   not one harvest — this is what keeps grain out of an annual glut/famine cobweb.
 * @property {number} unrest   Class anger 0..1; feeds riots, secession, faction stability.
 * @property {number} riotCd   Cooldown years until the next riot can fire.
 * @property {number} wb       Overall wellbeing 0..1 (0.7 at founding).
 * @property {?number} fid     Owning faction id, or null = free system.
 * @property {boolean} ruined  Dead forever (rendered as ruins).
 * @property {?number} diedYear
 * @property {number} famineCd
 * @property {number} tradeIn  Import volume this year (set by the trade phase).
 * @property {number} tradeOut Export volume this year.
 * @property {{y:number,t:string,s:string}[]} history  Last 12 events touching this system.
 * @property {?number} settledYear
 * @property {number} peakPop
 * @property {number} lastFamine  Year of last famine (-99 = never).
 * @property {number} lastPlague
 * @property {number} lastWar
 * @property {?{by:number, since:number, pair:string}} siege  Blockade: besieging fid, start year, relKey of the war.
 * @property {Object<string,number>} flow   Net import flow per good this year.
 * @property {{p:number,f:number,g:number}[]} trace  Yearly pop/grain-price/consumer-price trace (last 120).
 * @property {{gran:number,gate:number,mine:number}} infra  Infrastructure levels.
 * @property {number} faith    Faith id (index into `w.faiths`).
 * @property {Object<string,boolean>} mega  Completed megaprojects by type (nexus, arcology, terraformed…).
 * @property {number[]} depots House depot markers (house ids with a depot here).
 * @property {?number} sponsor House id that sponsored this colony, or null.
 * @property {boolean} freePort  Neutral port: no fid may claim it (corps can buy it out).
 * @property {boolean} outlaw  Frontier world tolerant of contraband when free/unowned
 *   (decides drug/slave legality for a free system; ignored once a flag flies here).
 * @property {number} slaves   Bonded population held here, in millions — NOT part of `pop`
 *   or `classes`. Supplies labor (T.SLAVE_LABOR), inflames the free poor, can revolt.
 *   Freed into the worker class wherever slavery is unlawful (contraband.js / conquest).
 * @property {number} drugs    Narcotics stockpiled here (contraband, not a GOODS member).
 * @property {number} drugLoad Addicted-underclass level 0..1; decays yearly, feeds unrest.
 *   Note: `stock.weapons`/`price.weapons` exist because weapons IS a normal GOODS member;
 *   `price.drugs`/`price.slaves` are set by contraband.js for the black markets.
 */

/**
 * @typedef {Object} Faction  A political power (empire, republic, corporate state, pirate haven).
 * @property {number} id       Unique, from `w.nextFid` (never reused; dead factions stay in the array).
 * @property {string} name
 * @property {string} color    Hex color for map/UI.
 * @property {"empire"|"republic"|"corporate"|"pirate"} gov  Key into GOVS (constants.js).
 * @property {number} capital  System id of the seat.
 * @property {number} aggr     Aggression 0..1 (war/embargo appetite).
 * @property {number} expans   Expansionism 0..1 (annexation appetite).
 * @property {number} treasury Credits; deep negative = collapse risk.
 * @property {number} stability 0..1; low = revolts, secession, collapse.
 * @property {number} tariff   Border duty rate (capped 0.5).
 * @property {boolean} dead
 * @property {number} foundedYear
 * @property {?number} diedYear
 * @property {number} peakSystems
 * @property {number} peakPop
 * @property {{p:number,s:number,t:number,st:number}[]} trace  Yearly pop/systems/treasury/stability (last 240).
 * @property {number} [corpId]  Corporate states: id of the founding house.
 * @property {number} [lootY]   Pirate havens: loot taken this year.
 * @property {Object<string,number>} [grievance]  Pirate havens: decaying ledger of raid
 *   losses per victim faction id — what motivates punitive expeditions.
 */

/**
 * @typedef {Object} House  A merchant house / megacorp.
 * @property {number} id       Index into `w.houses`.
 * @property {string} name
 * @property {number} home     System id of headquarters.
 * @property {number} wealth   Credits.
 * @property {number} ships    Freighter hulls (fractional).
 * @property {boolean} dead
 * @property {number} foundedYear
 * @property {?number} diedYear
 * @property {number} peakWealth
 * @property {boolean} corp    Grew into a chartered megacorp.
 * @property {?number} corpYear
 * @property {?number} stateId Faction id of its corporate state, if it founded one.
 * @property {number[]} depots System ids where it built depots.
 * @property {number[]} sponsored  System ids of colonies it sponsored.
 * @property {?number} feud    Rival house id (mutual), or null.
 * @property {?number} absorbedBy  House id that swallowed it, if taken over.
 * @property {number} income   Last year's income (and the inc* breakdown).
 * @property {number} incFreight
 * @property {number} incDepots
 * @property {number} incColonies
 * @property {Object[]} trace  Yearly trace for the detail view.
 */

/**
 * @typedef {Object} Faith
 * @property {number} id
 * @property {string} name
 * @property {string} color
 * @property {number} founded  Year (0 for the four founding creeds).
 */

/**
 * @typedef {Object} Edge  A jumpgate lane between two systems.
 * @property {number} a    System id.
 * @property {number} b    System id.
 * @property {number} d    Euclidean length (world units).
 * @property {number} vol  Trade volume this year (set by the trade phase).
 * @property {number} net  Signed net flow direction along a→b.
 */

/**
 * @typedef {Object} Relation  Pairwise faction relation, keyed by `relKey(a,b)` ("lo|hi").
 * Access via `getRel(w, a, b)` (events.js) — it lazily creates the record.
 * @property {number} rivalry  0..100; war becomes possible above 60.
 * @property {?{since:number, score:number, rec:number}} war  Active war: start year, battle score (+ favors lower id), index into `w.stats.wars`.
 * @property {boolean} allied  Open-lanes accord (zero tariffs, shared patrols).
 * @property {boolean} [embargo]
 */

/**
 * @typedef {Object} Project  A megaproject under construction (or finished).
 * @property {string} type    Key into PROJECT_TYPES (constants.js).
 * @property {string} name
 * @property {number} sysId
 * @property {number} fid     Building faction.
 * @property {number} started Year.
 * @property {?number} endedYear
 * @property {number} progress  Credits sunk so far.
 * @property {number} cost      Credits needed.
 * @property {boolean} done
 * @property {boolean} abandoned
 */

/**
 * @typedef {Object} Loan  Credit-market loan (finance phase).
 * @property {"sys"|"fac"} kind  Borrower type: system or faction.
 * @property {number} bid    Borrower id (system id or faction id per `kind`).
 * @property {number} lender House id.
 * @property {number} principal
 * @property {number} rate   Annual interest.
 * @property {number} since  Year issued.
 * @property {number} missed Consecutive missed payments.
 */

/**
 * @typedef {Object} Cartel
 * @property {number} id
 * @property {string} name
 * @property {string} good   The cornered good.
 * @property {number[]} members  House ids.
 * @property {number} since
 * @property {?number} ended
 */

/**
 * @typedef {Object} WorldEvent  One chronicle entry (see events.js `log`).
 * @property {number} y   Year.
 * @property {string} t   Type key (styled via EV_STYLE in ui/theme.js).
 * @property {string} s   Prose text — written as in-world history.
 * @property {?number} sysId
 * @property {number} i   Monotonic sequence number (survives log trimming).
 */

/**
 * @typedef {Object} World  The entire simulation state. Created by `genGalaxy`,
 * advanced one year at a time by `simulateYear`, mutated in place throughout.
 * @property {number} seed
 * @property {Object<string,number>} cfg  Player config knobs (config.js), mostly multipliers.
 * @property {number} year
 * @property {{n:()=>number, range:Function, int:Function, pick:Function, chance:Function, gauss:Function}} rng
 *   Seeded RNG — the ONLY source of randomness allowed inside src/sim/.
 * @property {System[]} systems   Index == system id; never reordered or filtered.
 * @property {Edge[]} edges       `w.adj` is derived from this — call `rebuildAdj(w)` after changing edges.
 * @property {{to:number, e:number}[][]} adj  Adjacency per system: neighbor id + edge index.
 * @property {Faction[]} factions Append-only; index == `f.id`. Dead factions remain, flagged `dead`.
 * @property {number} nextFid
 * @property {House[]} houses
 * @property {Faith[]} faiths
 * @property {Object<string,Relation>} relations  Keyed by `relKey(a,b)`.
 * @property {WorldEvent[]} events  Capped at 800; use `log()`, never push directly.
 * @property {number} eventSeq
 * @property {Object[]} fx        Short-lived map effect queue (capped 120); use `fx()`.
 * @property {number} fxSeq
 * @property {Project[]} projects
 * @property {Loan[]} loans
 * @property {{crunch:number, defaults:number[], panics:number, lastPanic:number}} credit  Credit-cycle state.
 * @property {Cartel[]} cartels
 * @property {Object<string,number>} cartelMul  Price multiplier per cartelized good (rebuilt yearly).
 * @property {{level:number, progress:number, history:Object[]}} tech  Era progression (TECH_ERAS).
 * @property {{name:string, since:number}} era  Current named age.
 * @property {{name:string, since:number}[]} eras
 * @property {number} warCount
 * @property {number} peaceYears
 * @property {number} popPeak100
 * @property {{longestWar:number, largestRealm:number, worstFamine:number, richestHouse:number}} records
 * @property {Object} stats  Aggregates for export/GalaxyPanel: `seeded`, `series[]` (yearly rows,
 *   chronicle phase), `deaths[]`, `factionDeaths[]`, `wars[]`, and `c` — the big named-event
 *   counter object (see galaxy.js for the full key list; bump the right counter when logging).
 */

// No runtime exports — this file exists for editors, JSDoc tooling, and humans.
export {};
