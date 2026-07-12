import { useState } from "react";
import { createRoot } from "react-dom/client";
import GalaxySim from "./GalaxySim.jsx";
import TycoonGame from "./ui/tycoon/TycoonGame.jsx";
import "./index.css";

// Two ways in: watch the galaxy run itself, or play it as a megacorp.
function Root() {
  const [mode, setMode] = useState("watch");
  return (
    <>
      <div style={{ position: "fixed", top: 8, left: "50%", transform: "translateX(-50%)", zIndex: 2000 }}
        className="glass glass-seg">
        <button className={mode === "watch" ? "on" : ""} onClick={() => setMode("watch")}>watch</button>
        <button className={mode === "play" ? "on" : ""} onClick={() => setMode("play")}>play</button>
      </div>
      {mode === "watch" ? <GalaxySim /> : <TycoonGame />}
    </>
  );
}

createRoot(document.getElementById("root")).render(<Root />);
