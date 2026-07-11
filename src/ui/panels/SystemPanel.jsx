import { Fragment } from "react";
import { GOODS, GOOD_CATS, GOOD_LABEL, BASE_PRICE, CLASSES, CLASS_DEF } from "../../sim/constants.js";
import { Bar, Spark } from "../widgets.jsx";
import { fmtPop, fmtCredits } from "../format.js";

const Tile = ({ label, value }) => (
  <div className="px-2 py-1.5 rounded" style={{ background: "rgba(230,225,211,0.05)", border: "1px solid rgba(230,225,211,0.08)" }}>
    <div style={{ fontFamily: "'Chakra Petch', sans-serif", fontWeight: 700 }} className="text-base leading-tight">{value}</div>
    <div style={{ color: "#7C8798", fontSize: 10 }} className="uppercase tracking-wider">{label}</div>
  </div>
);

export default function SystemPanel({ w, sel }) {
  if (!sel) {
    return (
      <div style={{ color: "#7C8798" }}>
        Tap a system on the map to inspect it. Dots are sized by population and colored by allegiance. Everything you see emerged from the simulation — nothing is scripted.
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <div>
        <div style={{ fontFamily: "'Chakra Petch', sans-serif", fontWeight: 700 }} className="text-lg">
          {sel.name}
        </div>
        <div style={{ color: "#7C8798" }}>
          {sel.ruined
            ? `RUINS — went dark in year ${sel.diedYear}`
            : sel.pop <= 0.05
              ? "Uncolonized"
              : sel.fid !== null
                ? <span><span style={{ color: w.factions[sel.fid].color }}>■</span> {w.factions[sel.fid].name}{w.factions[sel.fid].capital === sel.id ? " · CAPITAL" : ""}</span>
                : "Free System — no authority, no duties"}
          {" · "}{sel.cultName} culture
          {w.faiths[sel.faith] && (
            <> · <span style={{ color: w.faiths[sel.faith].color }}>{w.faiths[sel.faith].name}</span></>
          )}
        </div>
        {(sel.mega.nexus || sel.mega.arcology || sel.mega.terraformed) && (
          <div className="mt-0.5" style={{ color: "#4FD0A5" }}>
            {sel.mega.nexus && <span title="Freight moves almost for free through its grand gates">◈ Gate Nexus </span>}
            {sel.mega.arcology && <span title="Ring habitats carry millions beyond the world's natural limit">◍ Orbital Arcology </span>}
            {sel.mega.terraformed && <span title="Terraformed — the rains came, and the rock turned green">❋ Terraformed</span>}
          </div>
        )}
      </div>

      {sel.pop > 0.05 && (
        <>
          {sel.siege && (
            <div className="px-2 py-1 rounded" style={{ background: "rgba(228,87,46,0.15)", color: "#E4572E", border: "1px solid rgba(228,87,46,0.4)" }}>
              UNDER SIEGE by the {w.factions[sel.siege.by].name} since {sel.siege.since} — all trade severed
            </div>
          )}
          <div className="grid grid-cols-3 gap-1.5">
            <Tile label="population" value={fmtPop(sel.pop)} />
            <Tile label="wealth" value={fmtCredits(sel.wealth)} />
            <Tile label="industry" value={`×${sel.dev.toFixed(2)}`} />
          </div>
          <div>
            <div className="flex justify-between"><span style={{ color: "#7C8798" }}>wellbeing</span><span>{(sel.wb * 100).toFixed(0)}%</span></div>
            <Bar v={sel.wb} color={sel.wb < 0.5 ? "#E4572E" : sel.wb < 0.65 ? "#F2A93B" : "#6FBF73"} />
          </div>
          <div>
            <div className="flex justify-between mb-1">
              <span style={{ color: "#7C8798" }}>society</span>
              <span style={{ color: sel.unrest > 0.6 ? "#E4572E" : sel.unrest > 0.35 ? "#F2A93B" : "#7C8798" }}>
                unrest {(sel.unrest * 100).toFixed(0)}%
              </span>
            </div>
            <div className="flex h-2 rounded overflow-hidden" style={{ background: "rgba(230,225,211,0.08)" }}
              title={CLASSES.map((c) => `${CLASS_DEF[c].label} ${(sel.classes[c] * 100).toFixed(0)}%`).join(" · ")}>
              {CLASSES.map((c) => (
                <div key={c} style={{ width: `${sel.classes[c] * 100}%`, background: CLASS_DEF[c].color }} />
              ))}
            </div>
            <div className="mt-1 space-y-0.5">
              {CLASSES.map((c) => {
                const wb = sel.classWb[c];
                const wc = wb < 0.5 ? "#E4572E" : wb < 0.65 ? "#F2A93B" : "#6FBF73";
                return (
                  <div key={c} className="flex items-baseline gap-2">
                    <span style={{ color: CLASS_DEF[c].color }}>■</span>
                    <span>{CLASS_DEF[c].label.toLowerCase()}</span>
                    <span style={{ color: "#7C8798" }}>{(sel.classes[c] * 100).toFixed(0)}%</span>
                    <span className="ml-auto" style={{ color: wc }} title="how well this class lives">
                      {(wb * 100).toFixed(0)}% content
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
          {(() => {
            const i = sel.infra;
            const seat = w.houses.filter((h) => !h.dead && h.home === sel.id);
            const depotOwners = sel.depots
              .map((hid) => w.houses[hid])
              .filter((h) => h && !h.dead);
            const backer = sel.sponsor !== null ? w.houses[sel.sponsor] : null;
            if (!i.gran && !i.gate && !i.mine && !seat.length && !depotOwners.length && !backer) return null;
            const pips = (n, max) => "●".repeat(n) + "○".repeat(max - n);
            return (
              <div style={{ color: "#7C8798" }} className="space-y-0.5">
                {(i.gran > 0 || i.gate > 0 || i.mine > 0) && (
                  <div>
                    {i.gran > 0 && <span>granaries <b style={{ color: "#6FBF73" }}>{pips(i.gran, 3)}</b>  </span>}
                    {i.gate > 0 && <span>gate docks <b style={{ color: "#5CC8DA" }}>{pips(i.gate, 3)}</b>  </span>}
                    {i.mine > 0 && <span>deep mines <b style={{ color: "#E8B04B" }}>{pips(i.mine, 2)}</b></span>}
                  </div>
                )}
                {seat.map((h) => (
                  <div key={h.id}>seat of <b style={{ color: "#E8B04B" }}>{h.name}</b> ({h.ships.toFixed(0)} hulls)</div>
                ))}
                {depotOwners.map((h) => (
                  <div key={`d${h.id}`}>▪ freight depot of <b style={{ color: "#E8B04B" }}>{h.name}</b></div>
                ))}
                {backer && !backer.dead && (
                  <div>colony charter held by <b style={{ color: "#E8B04B" }}>{backer.name}</b></div>
                )}
              </div>
            );
          })()}
          {(() => {
            const imp = GOODS.filter((g) => sel.flow[g] > 0.3).map((g) => GOOD_LABEL[g]);
            const exp = GOODS.filter((g) => sel.flow[g] < -0.3).map((g) => GOOD_LABEL[g]);
            if (!imp.length && !exp.length) return null;
            return (
              <div style={{ color: "#7C8798" }}>
                {exp.length > 0 && <span>exports <b style={{ color: "#6FBF73" }}>{exp.join(", ")}</b></span>}
                {exp.length > 0 && imp.length > 0 && " · "}
                {imp.length > 0 && <span>imports <b style={{ color: "#5CC8DA" }}>{imp.join(", ")}</b></span>}
              </div>
            );
          })()}
          {sel.trace.length > 5 && (
            <div className="space-y-1">
              <div style={{ color: "#7C8798" }}>last {sel.trace.length} years</div>
              <Spark data={sel.trace.map((t) => t.p)} color="#E6E1D3" label="pop" fmt={fmtPop} />
              <Spark data={sel.trace.map((t) => t.f)} color="#6FBF73" label="grain cr" fmt={(v) => v.toFixed(2)} />
              <Spark data={sel.trace.map((t) => t.g)} color="#C05DD6" label="goods cr" fmt={(v) => v.toFixed(2)} />
            </div>
          )}
        </>
      )}

      <div className="space-y-1.5">
        <div style={{ color: "#7C8798" }}>endowments</div>
        <div className="flex items-center gap-2"><span className="w-14">fertile</span><div className="flex-1"><Bar v={sel.fert} color="#6FBF73" /></div></div>
        <div className="flex items-center gap-2"><span className="w-14">minerals</span><div className="flex-1"><Bar v={sel.min * Math.sqrt(Math.max(0, sel.minRes / sel.minRes0))} color="#E8B04B" /></div><span style={{ color: "#7C8798" }}>{((sel.minRes / sel.minRes0) * 100).toFixed(0)}% left</span></div>
        <div className="flex items-center gap-2"><span className="w-14">rare earths</span><div className="flex-1"><Bar v={sel.rare * Math.sqrt(Math.max(0, sel.minRes / sel.minRes0))} color="#DA5CB0" /></div></div>
        <div className="flex items-center gap-2"><span className="w-14">energy</span><div className="flex-1"><Bar v={sel.en * Math.sqrt(Math.max(0, sel.enRes / sel.enRes0))} color="#5CC8DA" /></div></div>
        <div className="flex items-center gap-2"><span className="w-14">habitable</span><div className="flex-1"><Bar v={sel.hab} color="#C05DD6" /></div></div>
      </div>

      {sel.pop > 0.05 && (
        <div>
          <div style={{ color: "#7C8798" }} className="mb-1">market (stock · price in cr vs galactic norm)</div>
          <table className="w-full">
            <tbody>
              {GOOD_CATS.map((cat) => (
                <Fragment key={cat.key}>
                  <tr>
                    <td colSpan={4} className="uppercase tracking-widest pt-1" style={{ color: "#5A6472", fontSize: 10 }}>
                      {cat.label}
                    </td>
                  </tr>
                  {cat.goods.map((g) => {
                    const ratio = sel.price[g] / BASE_PRICE[g];
                    const c = ratio > 1.8 ? "#E4572E" : ratio < 0.6 ? "#6FBF73" : "#E6E1D3";
                    const arrow = ratio > 1.8 ? "▲" : ratio > 1.25 ? "△" : ratio < 0.6 ? "▼" : ratio < 0.8 ? "▽" : "·";
                    return (
                      <tr key={g}>
                        <td className="pl-2">{GOOD_LABEL[g]}</td>
                        <td className="text-right" style={{ color: "#7C8798" }}>{sel.stock[g].toFixed(1)}</td>
                        <td className="text-right" style={{ color: c }}>{sel.price[g].toFixed(2)}</td>
                        <td className="text-right" style={{ color: c, width: 52 }} title={`${(ratio * 100).toFixed(0)}% of base price`}>
                          {arrow} ×{ratio.toFixed(1)}
                        </td>
                      </tr>
                    );
                  })}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {sel.history.length > 0 && (
        <div>
          <div style={{ color: "#7C8798" }} className="mb-1">local record</div>
          {[...sel.history].reverse().map((h, i) => (
            <div key={i} className="mb-1">
              <span style={{ color: "#F2A93B" }}>{h.y}</span> {h.s}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
