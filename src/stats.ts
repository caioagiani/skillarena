/** Wilson score interval for a binomial proportion (95% by default). */
export function wilson(successes: number, n: number, z = 1.96): [number, number] {
  if (n === 0) return [0, 0];
  const p = successes / n;
  const denom = 1 + (z * z) / n;
  const center = (p + (z * z) / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denom;
  return [Math.max(0, center - half), Math.min(1, center + half)];
}

export function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN;
}

export function median(xs: number[]): number {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Deterministic PRNG so reports are reproducible. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Paired cluster bootstrap of the pass-rate difference (skill − baseline).
 * Tasks are the resampling unit, so easy/hard tasks don't fake significance.
 * `perTask` maps task id -> [skillPassRate, baselinePassRate].
 */
export function bootstrapDelta(perTask: Map<string, [number, number]>, iterations = 4000): { delta: number; lo: number; hi: number } {
  const pairs = [...perTask.values()];
  if (!pairs.length) return { delta: NaN, lo: NaN, hi: NaN };
  const diff = (ps: [number, number][]) => mean(ps.map(([a, b]) => a - b));
  const rand = mulberry32(42);
  const samples: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const s: [number, number][] = [];
    for (let j = 0; j < pairs.length; j++) s.push(pairs[Math.floor(rand() * pairs.length)]);
    samples.push(diff(s));
  }
  samples.sort((a, b) => a - b);
  return { delta: diff(pairs), lo: samples[Math.floor(iterations * 0.025)], hi: samples[Math.floor(iterations * 0.975)] };
}
