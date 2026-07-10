import { Bar } from "../widgets.jsx";

export default function PowersPanel({ w, liveFactions, wars }) {
  return (
    <div className="space-y-3">
      {liveFactions
        .map((f) => ({ f, members: w.systems.filter((s) => s.fid === f.id && s.pop > 0.05) }))
        .sort((a, b) => b.members.reduce((x, s) => x + s.pop, 0) - a.members.reduce((x, s) => x + s.pop, 0))
        .map(({ f, members }) => {
          const fp = members.reduce((a, s) => a + s.pop, 0);
          const myWars = wars.filter(({ k }) => k.split("|").map(Number).includes(f.id));
          return (
            <div key={f.id} className="pb-2" style={{ borderBottom: "1px solid rgba(230,225,211,0.08)" }}>
              <div className="flex items-center gap-2">
                <span style={{ color: f.color }}>■</span>
                <b>{f.name}</b>
                <span className="ml-auto" style={{ color: "#7C8798" }}>est. {f.foundedYear}</span>
              </div>
              <div style={{ color: "#7C8798" }}>
                {members.length} systems · {fp.toFixed(0)}M · treasury {f.treasury.toFixed(0)} · capital {w.systems[f.capital].name}
              </div>
              <div className="flex items-center gap-2 mt-1">
                <span style={{ color: "#7C8798" }}>stability</span>
                <div className="flex-1"><Bar v={f.stability} color={f.stability < 0.35 ? "#E4572E" : "#6FBF73"} /></div>
              </div>
              {myWars.length > 0 && (
                <div style={{ color: "#E4572E" }} className="mt-1">
                  at war with {myWars.map(({ k }) => {
                    const other = k.split("|").map(Number).find((x) => x !== f.id);
                    return w.factions[other].name;
                  }).join(", ")}
                </div>
              )}
            </div>
          );
        })}
      {w.factions.filter((f) => f.dead).length > 0 && (
        <div>
          <div style={{ color: "#7C8798" }} className="mb-1 uppercase tracking-widest">fallen powers</div>
          {w.factions.filter((f) => f.dead).map((f) => (
            <div key={f.id} style={{ color: "#7C8798" }}>
              <span style={{ color: f.color, opacity: 0.5 }}>■</span> {f.name} ({f.foundedYear}–{f.diedYear})
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
