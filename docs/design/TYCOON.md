# AEONS — Megacorp Tycoon (design)

A tycoon game layered on the AEONS simulation: the player runs a mega-corporation
in a galaxy that lives and dies on its own. This is the north star; it is built in
shippable, tested slices (see the roadmap).

## The one idea that makes this deep

Most tycoon games run on a static or scripted board. **Here the board is a full
simulation** — prices emerge from supply and demand across a trade network, wars
ignite for reasons, worlds are born, terraformed, depleted, and die, governments
rise and fall, rulers reign, faiths spread, and credit panics cascade, all without
the player. The depth is not in menus; it is in **reading and bending a living
system**, and living with the second-order consequences.

The legibility layer already built is the player's instrument panel:

| Engine module | The player uses it as |
|---|---|
| `cosmos.js` (stars & worlds) | **prospecting** — survey a system's bodies before investing |
| `classify.js` (archetypes) | **recon** — what kind of place is this |
| `explain.js` (cause & effect) | **intelligence** — why prices move and wars start |
| `diagnose.js` (crises) | **deal-finding** — worlds to buy low / sell relief |
| `figures.js` (rulers) | **the human layer** — you deal with named people |
| balance lab + determinism | a **tunable, replayable, shareable** game |

## Design decisions (locked)

- **Time = two clocks.** The simulation stays **yearly and deterministic** (the
  authoritative keyframes). The player lives at **day resolution**, interpolating
  ("lerping") the galaxy from the last realized year toward the next computed
  year. Big yearly events are scheduled onto days so news breaks day by day. See
  *Two-clock architecture* below.
- **First slice = trade & logistics.** The player is a House they steer by hand:
  buy, sell, run routes, build depots. The sim already implements this loop for AI
  houses, so we are exposing and deepening something real.
- **Endgame = pure open sandbox.** No win state. Score is net worth, systems held,
  fleet, and **market concentration** (HHI, already computed). Play to build the
  greatest corporate empire history has seen.

## Two-clock architecture

```
 realized year N ──simulateYear──▶ realized year N+1 ──▶ N+2 ...
        │  (authoritative, deterministic, byte-identical)
        │
   [ base keyframe ]                 [ forecast keyframe ]
        └────────── day 0 … day 360 lerp ──────────┘
                  ↑ the player lives here
```

- The **macro clock** is `sim/simulate.js` unchanged: `simulateYear(w)` advances
  the whole galaxy one year. It is the source of truth and stays deterministic.
- The **micro clock** (`src/game/`) runs ~360 day-ticks per year. It holds two
  lean **snapshots** — the last realized year (`base`) and the next computed year
  (`forecast`) — and shows a **`lerp(base, forecast, day/360)`** view: prices,
  populations, treasuries, trade volumes drift smoothly; discrete changes
  (ownership, a siege, a death) snap at their scheduled day.
- The authoritative world runs **one year ahead** of what the player sees (we must
  know the forecast to lerp toward it). The player's *own* corporation — cash,
  ships in transit, cargo, contracts — is simulated at **true daily resolution**
  by the game layer, deterministically.
- **Price-taker now, price-maker later.** In the first slices the player trades
  against the (pre-computed) galaxy without perturbing it — clean and safe. When
  the player grows large enough to move markets, their accumulated yearly activity
  feeds the *next* macro step as intents: a natural ~1-year propagation lag into
  the galactic economy, while their own books stay daily-exact.
- **Determinism & saves.** `seed + ordered player action-log = the entire game`.
  This gives save/load, shareable runs, deterministic tests of the player layer,
  and an **AI player** we can run across the balance lab to tune the economy.

## The seven ladders of power

The player ascends: **trader → megacorp → chartered state → shaper of history.**
Each rung is a play surface backed by existing simulation state.

1. **Trade** — arbitrage across gates; standing routes with buy/sell rules;
   speculation on the price series; cornering a commodity (form/join cartels);
   warehousing to manufacture scarcity; riding shocks. A high-risk **contraband**
   arm (drugs/slaves) gated by legality and reputation.
2. **Logistics** — ship classes (bulk / clipper / armored / tanker); hub-and-spoke
   via depots and gate nexuses; fuel and upkeep; **piracy risk and insurance**;
   owning the **chokepoints** rivals must route through.
3. **Capital** — be the bank: underwrite reconstruction loans and war bonds →
   leverage over systems and states → **foreclose to seize worlds**; buy equity in
   rivals; **hostile takeovers**; survive — or trigger — a panic.
4. **Industry** — vertical integration; build infrastructure and **megaprojects**
   (nexus / arcology / terraforming); refine raw → manufactured; push **R&D**.
5. **Territory** — prospect with composition; **terraform** dead rock into
   farmland; run company towns; ride sponsor → charter → annex to *own* systems.
6. **Statecraft** — buy a charter, **found a corporate state**, then govern: set
   tariffs, taxes, and laws; manage stability and unrest; wage or hire war; sign
   accords. Govern well or strip-mine and move on — the sim judges either way.
7. **Influence** — bribe and back **rulers**; fund wars and revolts; incite or
   suppress piracy; run **espionage**; court or oppose **faiths**; all mediated by
   **reputation** with every faction, house, and creed.

Depth comes from interactions: dumping cheap grain to break a rival can cause a
famine once you leave; underwriting a war spikes weapons demand (profit) while
your own lanes empty (pain); foreclosing on a world inherits its unrest and the
pirates it breeds. The `explain.js` layer tells the player which of these is
happening and why.

## Interaction model

A yearly **boardroom**: set policies and issue orders, then let the days run —
watch prices drift, ships arrive, and news break, with the chronicle + cause-and-
effect as your advisor feed. Big moments (a takeover bid, a war offer, a
foreclosure) pause the day-clock as interrupts. Speed controls over the day rate.

## Scoring (sandbox)

No victory. A running scorecard: **net worth** (cash + fleet + holdings + equity −
debt), **systems controlled**, **fleet tonnage**, **commodity market share**, and
peak **HHI concentration** — plus milestones (first megacorp, first charter, first
system ruled) as history, not win conditions.

## Balancing the game

Extend the balance lab: add player-economy targets — time-to-megacorp, AI-player
bankruptcy odds, market-share ceilings, price-manipulation limits — and run an AI
player across the seed matrix so the tycoon economy is **tuned, not guessed**.

## Boundaries (respect the engine)

- `src/game/` may read `src/sim/` and issue intents; **`src/sim/` never imports
  `src/game/`** and stays DOM-free and deterministic.
- The macro-sim is not modified by the game layer in the early slices — the
  `npm run sim` output stays byte-identical. Player influence on the galaxy is
  added later, explicitly, through the intent → next-macro-step path.

## Roadmap

- **P0 — the clock & the loop.** Two-clock engine (snapshot, interpolate, day
  clock) + a player corporation with a hand-steered trade/logistics loop (dispatch
  ships, buy/sell against interpolated prices, depots). Headless-testable core
  first, then the boardroom/map UI. *(building now)*
- **P1 — boardroom UI & advisor feed.** Fleet/route control on the map, the day
  clock, an orders queue, the chronicle + cause-and-effect as intelligence.
- **P2 — capital & industry.** Lending, leverage, foreclosure; infrastructure and
  megaprojects; R&D.
- **P3 — territory & statecraft.** Prospect, terraform, charter, and rule —
  tariffs, law, war, diplomacy — with player influence folding into the macro-sim.
- **P4 — influence & espionage.** Rulers, faiths, sabotage, reputation.
- **P5 — scoring, saves, sharing, and AI-player balancing.**
