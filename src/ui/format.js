// population values are stored in millions
export function fmtPop(m) {
  if (m >= 10000) return (m / 1000).toFixed(1) + "B";
  if (m >= 1000) return (m / 1000).toFixed(2) + "B";
  if (m >= 100) return m.toFixed(0) + "M";
  if (m >= 1) return m.toFixed(1) + "M";
  return Math.max(1, Math.round(m * 1000)) + "k";
}

// the credit (cr) — the galaxy's universal unit of account. Every price,
// wealth figure, treasury, and freight margin is denominated in credits.
export const CREDIT = "cr";

export function fmtCredits(x) {
  if (Math.abs(x) >= 10000) return (x / 1000).toFixed(1) + "k cr";
  if (Math.abs(x) >= 1000) return (x / 1000).toFixed(2) + "k cr";
  return x.toFixed(0) + " cr";
}

export function fmtCompact(x) {
  if (Math.abs(x) >= 10000) return (x / 1000).toFixed(1) + "k";
  if (Math.abs(x) >= 1000) return (x / 1000).toFixed(2) + "k";
  if (Math.abs(x) >= 100) return x.toFixed(0);
  if (Math.abs(x) >= 10) return x.toFixed(1);
  return x.toFixed(2);
}
