export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const dist2 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export const cultDist = (a, b) =>
  Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) / 1.73;

export function avgCult(members) {
  const v = [0, 0, 0];
  for (const s of members) for (let k = 0; k < 3; k++) v[k] += s.cult[k];
  return v.map((x) => x / members.length);
}
