import { newGame } from "./game.js";
import { apply } from "./commands.js";

// ---------------------------------------------------------------------------
// Save & load by replay. Because the simulation is deterministic and the player
// acts only through recorded commands, a whole game is captured by its genesis
// (seed, config, burn-in, corp setup) plus its ordered action log. Loading
// rebuilds the galaxy from the seed and re-applies the log — reproducing the
// exact game, byte for byte. Small saves, perfect fidelity, shareable as text.
// ---------------------------------------------------------------------------

export const SAVE_VERSION = 1;

/** Serialize a game to a compact, shareable JSON string. */
export function serialize(game) {
  if (!game.genesis) throw new Error("only games started via newGame() can be saved");
  return JSON.stringify({ v: SAVE_VERSION, genesis: game.genesis, log: game.actionLog });
}

/** Rebuild a game from a save string by replaying its action log. */
export function load(str) {
  const save = typeof str === "string" ? JSON.parse(str) : str;
  if (save.v !== SAVE_VERSION) throw new Error(`unsupported save version ${save.v}`);
  const gen = save.genesis;
  const game = newGame(gen.seed, {
    cfg: gen.cfg || undefined, burnYears: gen.burnYears,
    corpName: gen.corpName || undefined, cash: gen.cash,
    home: gen.home, daysPerYear: gen.daysPerYear || undefined,
  });
  for (const cmd of save.log) apply(game, cmd, false); // replay without re-recording
  return game;
}
