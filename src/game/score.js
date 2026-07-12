import { SHIP_CLASSES } from "./corp.js";

// ---------------------------------------------------------------------------
// The sandbox scorecard — no win state, just the measure of your empire. A pure
// read of the game: net worth, reach, and standing among the galaxy's commercial
// powers, plus the milestones your corporation has passed on the ladder.
// ---------------------------------------------------------------------------

const MILESTONE = { MEGACORP: 500, TITAN: 3000 };

/** A snapshot of how the player's corporation is doing. Pure. */
export function scorecard(game) {
  const { corp, w } = game;
  const nw = game.netWorth();

  // worlds under the player's control: company towns + anything under the flag
  const held = new Set(corp.holdings);
  if (game.factionId != null)
    for (const s of w.systems) if (s.fid === game.factionId && s.pop > 0.05) held.add(s.id);

  const tonnage = corp.ships.reduce((a, sh) => a + SHIP_CLASSES[sh.class].cargo, 0);

  // rank among the galaxy's commercial players (living merchant houses + you)
  const wealths = w.houses.filter((h) => !h.dead).map((h) => h.wealth).concat([nw]).sort((a, b) => b - a);
  const rank = wealths.indexOf(nw) + 1;
  const totalCommerce = wealths.reduce((a, b) => a + Math.max(0, b), 0);
  const share = totalCommerce > 0 ? nw / totalCommerce : 0;

  return {
    year: game.year, day: game.day,
    netWorth: Math.round(nw),
    cash: Math.round(corp.cash),
    fleet: corp.ships.length, tonnage,
    depots: Object.keys(corp.depots).length,
    loans: corp.loans.length,
    holdings: corp.holdings.length,
    systemsHeld: held.size,
    hasState: game.factionId != null,
    rank, ofPlayers: wealths.length,
    commerceShare: +(share * 100).toFixed(1),
    stats: { ...corp.stats },
    milestones: {
      megacorp: nw >= MILESTONE.MEGACORP,
      titan: nw >= MILESTONE.TITAN,
      financier: corp.stats.lent > 0,
      landlord: corp.holdings.length > 0,
      sovereign: game.factionId != null,
    },
  };
}
