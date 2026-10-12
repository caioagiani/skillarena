const UNITS = { d: 86_400_000, h: 3_600_000, m: 60_000, s: 1_000, ms: 1 };

export function parseDuration(input) {
  if (typeof input !== "string") throw new TypeError("duration must be a string");
  const s = input.trim();
  if (!s) throw new TypeError("empty duration");
  const re = /(\d+(?:\.\d+)?)(ms|d|h|m|s)\s*/iy;
  const seen = new Set();
  let total = 0;
  let i = 0;
  while (i < s.length) {
    re.lastIndex = i;
    const m = re.exec(s);
    if (!m) throw new TypeError(`invalid duration: ${input}`);
    const unit = m[2].toLowerCase();
    if (seen.has(unit)) throw new TypeError(`duplicate unit: ${unit}`);
    seen.add(unit);
    total += Number(m[1]) * UNITS[unit];
    i = re.lastIndex;
  }
  return Math.round(total);
}
