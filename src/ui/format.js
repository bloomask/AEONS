// population values are stored in millions
export function fmtPop(m) {
  if (m >= 10000) return (m / 1000).toFixed(1) + "B";
  if (m >= 1000) return (m / 1000).toFixed(2) + "B";
  if (m >= 100) return m.toFixed(0) + "M";
  if (m >= 1) return m.toFixed(1) + "M";
  return Math.max(1, Math.round(m * 1000)) + "k";
}

export function fmtMoney(x) {
  if (Math.abs(x) >= 10000) return (x / 1000).toFixed(1) + "k¤";
  if (Math.abs(x) >= 1000) return (x / 1000).toFixed(2) + "k¤";
  return x.toFixed(0) + "¤";
}

export function fmtCompact(x) {
  if (Math.abs(x) >= 10000) return (x / 1000).toFixed(1) + "k";
  if (Math.abs(x) >= 1000) return (x / 1000).toFixed(2) + "k";
  if (Math.abs(x) >= 100) return x.toFixed(0);
  if (Math.abs(x) >= 10) return x.toFixed(1);
  return x.toFixed(2);
}
