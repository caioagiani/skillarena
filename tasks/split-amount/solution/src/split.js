export function splitAmount(totalCents, weights) {
  if (!Number.isSafeInteger(totalCents) || totalCents < 0) throw new RangeError("totalCents must be a non-negative safe integer");
  if (!Array.isArray(weights) || !weights.length || !weights.every((w) => typeof w === "number" && Number.isFinite(w) && w >= 0))
    throw new RangeError("weights must be finite numbers >= 0");
  const sum = weights.reduce((a, b) => a + b, 0);
  if (!(sum > 0)) throw new RangeError("weights must have a positive sum");

  // Exact arithmetic: scale weights to integers, then use BigInt.
  const scale = 10 ** Math.max(0, ...weights.map((w) => (String(w).split(".")[1] ?? "").length));
  const W = weights.map((w) => BigInt(Math.round(w * scale)));
  const S = W.reduce((a, b) => a + b, 0n);
  const T = BigInt(totalCents);
  const base = W.map((w) => (T * w) / S);
  const rem = W.map((w, i) => ({ i, r: (T * w) % S, w }));
  let left = T - base.reduce((a, b) => a + b, 0n);
  rem.sort((a, b) => (a.r === b.r ? a.i - b.i : a.r > b.r ? -1 : 1));
  for (const { i, w } of rem) {
    if (left === 0n) break;
    if (w === 0n) continue;
    base[i] += 1n;
    left -= 1n;
  }
  return base.map(Number);
}
