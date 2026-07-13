import { useState, useRef, useCallback } from "react";
import { Section } from "../widgets.jsx";
import { downloadFile } from "../download.js";
import {
  listManual, listAutosaves, saveWorld, deleteSave, readBlob,
  exportBlob, exportFilename, importSave, savesAvailable, AUTOSAVE_KEEP,
} from "../saves.js";

// wall-clock formatting for the save list — how long ago, then the date
function ago(ms) {
  const s = Math.max(0, (Date.now() - ms) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return new Date(ms).toLocaleDateString();
}

function Row({ m, onLoad, onDelete, onExport }) {
  return (
    <div
      className="flex items-center gap-2 px-3 py-2 rounded-lg"
      style={{ background: "var(--surface)", border: "1px solid var(--line)" }}
    >
      <div className="min-w-0 flex-1">
        <div className="display truncate" style={{ fontWeight: 600, color: "var(--bright)" }}>
          {m.name}
        </div>
        <div className="faint" style={{ fontSize: 10 }}>
          seed {m.seed} · year {m.year} · {ago(m.savedAt)}
        </div>
      </div>
      <button className="btn" onClick={() => onLoad(m)} title="Load this save (replaces the current galaxy)">load</button>
      <button className="btn" onClick={() => onExport(m)} title="Download this save as a file">⬇</button>
      <button className="btn" onClick={() => onDelete(m)} title="Delete this save">✕</button>
    </div>
  );
}

// The save & load screen: name and store the current galaxy, browse manual
// slots and the rotating autosave ring, and move saves in/out as files.
// `world` is the live world; `onLoad(world)` swaps the running galaxy for a
// loaded one (GalaxySim owns that transition).
export default function SavesPanel({ world, onLoad }) {
  const [, setTick] = useState(0);
  const [name, setName] = useState("");
  const [msg, setMsg] = useState(null);
  const fileRef = useRef(null);
  const refresh = useCallback(() => setTick((t) => t + 1), []);

  const available = savesAvailable();
  const manual = available ? listManual() : [];
  const autos = available ? listAutosaves() : [];

  const notify = (text, tone = "ok") => setMsg({ text, tone });

  const doSave = () => {
    if (!world) return;
    try {
      const m = saveWorld(world, { kind: "manual", name: name.trim() || undefined });
      setName("");
      refresh();
      notify(`Saved “${m.name}”.`);
    } catch (e) {
      notify(e.message || "Could not save.", "err");
    }
  };

  const doLoad = (m) => {
    try {
      onLoad(m.id);
      notify(`Loaded “${m.name}”.`);
    } catch (e) {
      notify(e.message || "Could not load that save.", "err");
    }
  };

  const doDelete = (m) => { deleteSave(m.id); refresh(); };

  const doExport = (m) => {
    // export the exact stored blob for an existing save, or the live world
    try {
      if (m) {
        const blob = readBlob(m.id);
        downloadFile(`aeons-save-${m.name.replace(/[^\w-]+/g, "_")}.aeons`, blob, "application/json");
      }
    } catch (e) {
      notify(e.message || "Could not export.", "err");
    }
  };

  const doExportCurrent = () => {
    if (!world) return;
    downloadFile(exportFilename(world), exportBlob(world), "application/json");
  };

  const onFile = (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = ""; // allow re-picking the same file
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const w = importSave(String(reader.result), { keep: true });
        refresh();
        onLoad(null, w); // hand the freshly parsed world straight to the app
        notify(`Loaded save from “${file.name}”.`);
      } catch (err) {
        notify(err.message || "That file is not a valid save.", "err");
      }
    };
    reader.onerror = () => notify("Could not read that file.", "err");
    reader.readAsText(file);
  };

  return (
    <div className="space-y-5">
      {!available && (
        <div
          className="px-3 py-2 rounded-lg"
          style={{ background: "rgba(242,169,59,0.12)", color: "var(--amber)", border: "1px solid rgba(242,169,59,0.4)" }}
        >
          This browser has storage disabled, so saves can’t be kept between sessions.
          You can still export the current galaxy to a file below and re-import it later.
        </div>
      )}

      {msg && (
        <div
          className="px-3 py-2 rounded-lg"
          style={
            msg.tone === "err"
              ? { background: "rgba(228,87,46,0.12)", color: "var(--red)", border: "1px solid rgba(228,87,46,0.4)" }
              : { background: "rgba(111,191,115,0.12)", color: "var(--green)", border: "1px solid rgba(111,191,115,0.4)" }
          }
        >
          {msg.text}
        </div>
      )}

      <Section title="save this galaxy" right={world ? <span className="faint">year {world.year}</span> : null}>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") doSave(); }}
            placeholder={world ? `Save · year ${world.year}` : "name this save"}
            className="flex-1 px-2 py-1.5 rounded-md text-xs"
            style={{ background: "var(--surface)", border: "1px solid var(--line)", color: "var(--text)", fontFamily: "var(--font-ui)" }}
            disabled={!available || !world}
          />
          <button
            className="btn on"
            onClick={doSave}
            disabled={!available || !world}
            title="Store the current galaxy as a named save"
          >
            ⬒ save
          </button>
        </div>
        <div className="flex items-center gap-2 mt-2">
          <button className="btn" onClick={doExportCurrent} disabled={!world} title="Download the current galaxy as a .aeons file">⬇ export file</button>
          <button className="btn" onClick={() => fileRef.current?.click()} title="Load a galaxy from a .aeons file">⬆ import file</button>
          <input ref={fileRef} type="file" accept=".aeons,.json,application/json" onChange={onFile} style={{ display: "none" }} />
        </div>
      </Section>

      <Section title="saves" right={<span className="faint">{manual.length}</span>}>
        {manual.length === 0
          ? <div className="faint italic">No saves yet — name the current galaxy above and store it.</div>
          : <div className="space-y-2">
              {manual.map((m) => (
                <Row key={m.id} m={m} onLoad={doLoad} onDelete={doDelete} onExport={doExport} />
              ))}
            </div>}
      </Section>

      <Section title="autosaves" right={<span className="faint">{autos.length}/{AUTOSAVE_KEEP}</span>}>
        {autos.length === 0
          ? <div className="faint italic">The galaxy autosaves as it runs; the {AUTOSAVE_KEEP} most recent are kept here.</div>
          : <div className="space-y-2">
              {autos.map((m) => (
                <Row key={m.id} m={m} onLoad={doLoad} onDelete={doDelete} onExport={doExport} />
              ))}
            </div>}
      </Section>
    </div>
  );
}
