import { useState } from "react";
import { newGame } from "../../game/game.js";
import { apply } from "../../game/commands.js";
import { classifySystem } from "../../sim/classify.js";
import { fmtPop } from "../format.js";
import BoardroomPanel from "./BoardroomPanel.jsx";

// The playable tycoon: found a company, then run it. Left is a system list you
// click to inspect and trade; right is the boardroom. Time advances from the
// boardroom's clock controls. Self-contained — no canvas, so it renders anywhere.
export default function TycoonGame() {
  const [game, setGame] = useState(null);
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 1e6));
  const [corpName, setCorpName] = useState("New Charter Company");
  const [sel, setSel] = useState(null);
  const [, setV] = useState(0);
  const act = (cmd) => { const r = apply(game, cmd); setV((n) => n + 1); return r; };

  if (!game) {
    return (
      <div style={{ maxWidth: 460, margin: "12vh auto", padding: 24 }} className="space-y-5">
        <div className="display text-2xl" style={{ fontWeight: 800, color: "var(--bright)" }}>
          AEONS · Megacorp
        </div>
        <div className="muted">Found a merchant house in a living galaxy and build it into an empire — trade, lend, colonise, and rule.</div>
        <label className="block muted">
          galaxy seed
          <input value={seed} onChange={(e) => setSeed(e.target.value.replace(/\D/g, ""))}
            className="block w-full mt-1 px-2 py-1" style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 6, color: "var(--text)" }} />
        </label>
        <label className="block muted">
          company name
          <input value={corpName} onChange={(e) => setCorpName(e.target.value)}
            className="block w-full mt-1 px-2 py-1" style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 6, color: "var(--text)" }} />
        </label>
        <button className="chip on" style={{ padding: "8px 16px" }}
          onClick={() => {
            const g = newGame(Number(seed) || 1, { corpName: corpName || "New Charter Company", cash: 1000 });
            setSel(g.corp.home);
            setGame(g);
          }}>
          ▸ Found your company
        </button>
        <div className="faint">The galaxy is simulated 120 years before you arrive. It keeps running with or without you.</div>
      </div>
    );
  }

  const live = game.w.systems.filter((s) => s.pop > 0.05).sort((a, b) => b.pop - a.pop);
  const home = game.corp.home;

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden" }}>
      <div style={{ width: 270, borderRight: "1px solid var(--line)", overflowY: "auto" }} className="p-2">
        <div className="faint px-1 pb-1" style={{ fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase" }}>
          systems · {live.length}
        </div>
        {live.map((s) => {
          const arch = classifySystem(game.w, s);
          const owner = s.fid != null ? game.w.factions[s.fid] : null;
          const mine = s.fid != null && s.fid === game.factionId;
          return (
            <button key={s.id} onClick={() => setSel(s.id)}
              className="block w-full text-left px-2 py-1 rounded"
              style={{
                background: sel === s.id ? "var(--surface)" : "transparent",
                border: `1px solid ${sel === s.id ? "var(--line)" : "transparent"}`,
                color: "var(--text)", cursor: "pointer",
              }}>
              <div className="flex items-baseline gap-1.5">
                <span style={{ color: arch.tint }}>{arch.icon}</span>
                <span style={{ fontWeight: s.id === home ? 700 : 400 }}>{s.name}</span>
                {s.id === home && <span className="faint">· HQ</span>}
                {mine && <span style={{ color: "var(--gold)" }}>· ★</span>}
                <span className="ml-auto faint">{fmtPop(s.pop)}</span>
              </div>
              <div className="faint" style={{ fontSize: 10 }}>
                {arch.label}{owner ? ` · ${owner.name}` : " · free"}
              </div>
            </button>
          );
        })}
      </div>
      <div style={{ flex: 1, overflowY: "auto" }} className="p-4">
        <BoardroomPanel game={game} sel={sel} act={act} />
      </div>
    </div>
  );
}
