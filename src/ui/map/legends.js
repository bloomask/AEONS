// static legend entries per overlay; the faith overlay builds its
// entries live from the world's surviving creeds
export const LEGENDS = {
  realm: [
    ["#C4ECF6", "moving sparks = freight convoys"],
    ["#E4572E", "red dashed lane = war front · flash = battle · dashed ring = siege"],
    ["#F2A93B", "amber ring = population in misery"],
    ["#E6E1D3", "square = faction capital"],
    ["#4FD0A5", "diamond = gate nexus · dashed diamond = under construction"],
    ["#E8B04B", "gold diamond = megacorp headquarters"],
    ["#A34A3A", "dark red realms = corsair havens preying on nearby lanes"],
    ["#B0453A", "✕ = dead system (ruins)"],
  ],
  wealth: [["#2E3A52", "poor"], ["#F2A93B", "rich (wealth per capita)"]],
  life: [["#E4572E", "starving"], ["#F2A93B", "strained"], ["#6FBF73", "thriving"]],
  trade: [
    ["#5CC8DA", "lane brightness = flow volume · dot = throughput"],
    ["#E8B04B", "gold diamond = corp HQ · gold tick = corp depot"],
  ],
  culture: [["#E6E1D3", "dot color = culture vector; trade blurs borders, isolation sharpens them"]],
};

export function legendEntries(w, overlay) {
  if (overlay === "faith" && w) {
    return w.faiths
      .filter((f) => w.systems.some((s) => s.faith === f.id && s.pop > 0.05))
      .map((f) => [f.color, f.name]);
  }
  return LEGENDS[overlay] || [];
}
