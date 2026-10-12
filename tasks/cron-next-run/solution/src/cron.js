const FIELDS = [
  { min: 0, max: 59 },
  { min: 0, max: 23 },
  { min: 1, max: 31 },
  { min: 1, max: 12, names: ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"], base: 1 },
  { min: 0, max: 7, names: ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"], base: 0 },
];
const MACROS = {
  "@yearly": "0 0 1 1 *", "@annually": "0 0 1 1 *", "@monthly": "0 0 1 * *", "@weekly": "0 0 * * 0",
  "@daily": "0 0 * * *", "@midnight": "0 0 * * *", "@hourly": "0 * * * *",
};

function value(token, f) {
  if (/^\d+$/.test(token)) return Number(token);
  const i = f.names?.indexOf(token.toUpperCase()) ?? -1;
  if (i === -1) throw new SyntaxError(`invalid value: ${token}`);
  return i + f.base;
}

function parseField(text, f) {
  const set = new Set();
  for (const item of text.split(",")) {
    const m = /^([^/]+)(?:\/(\d+))?$/.exec(item);
    if (!m) throw new SyntaxError(`invalid item: ${item}`);
    const [, base, stepText] = m;
    const step = stepText === undefined ? 1 : Number(stepText);
    if (step === 0) throw new SyntaxError("step must be > 0");
    let lo, hi;
    if (base === "*") [lo, hi] = [f.min, f.max];
    else if (base.includes("-")) {
      const parts = base.split("-");
      if (parts.length !== 2) throw new SyntaxError(`invalid range: ${base}`);
      [lo, hi] = parts.map((p) => value(p, f));
      if (lo > hi) throw new SyntaxError(`invalid range: ${base}`);
    } else {
      lo = value(base, f);
      hi = stepText === undefined ? lo : f.max;
    }
    if (lo < f.min || hi > f.max) throw new SyntaxError(`out of range: ${item}`);
    for (let v = lo; v <= hi; v += step) set.add(v);
  }
  return set;
}

function parse(expression) {
  if (typeof expression !== "string") throw new SyntaxError("expression must be a string");
  let expr = expression.trim();
  if (expr.startsWith("@")) {
    if (!(expr in MACROS)) throw new SyntaxError(`unknown macro: ${expr}`);
    expr = MACROS[expr];
  }
  const parts = expr.split(/\s+/);
  if (parts.length !== 5 || parts[0] === "") throw new SyntaxError("expected 5 fields");
  const [minute, hour, dom, month, dow] = parts.map((p, i) => parseField(p, FIELDS[i]));
  if (dow.has(7)) dow.add(0);
  return { minute, hour, dom, month, dow, domStar: parts[2] === "*", dowStar: parts[4] === "*" };
}

function dayMatches(c, d) {
  const domOk = c.dom.has(d.getUTCDate());
  const dowOk = c.dow.has(d.getUTCDay());
  if (c.domStar && c.dowStar) return true;
  if (c.domStar) return dowOk;
  if (c.dowStar) return domOk;
  return domOk || dowOk;
}

export function nextRun(expression, from) {
  if (!(from instanceof Date) || Number.isNaN(from.getTime())) throw new TypeError("from must be a valid Date");
  const c = parse(expression);
  const start = new Date(Math.floor(from.getTime() / 60000) * 60000 + 60000);
  const limit = new Date(from.getTime());
  limit.setUTCFullYear(limit.getUTCFullYear() + 5);
  const hours = [...c.hour].sort((a, b) => a - b);
  const minutes = [...c.minute].sort((a, b) => a - b);

  let day = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
  let first = true;
  while (day <= limit) {
    if (c.month.has(day.getUTCMonth() + 1) && dayMatches(c, day)) {
      for (const h of hours) {
        for (const m of minutes) {
          const t = new Date(day.getTime() + h * 3600000 + m * 60000);
          if (first && t < start) continue;
          if (t > limit) throw new RangeError("no match within 5 years");
          return t;
        }
      }
    }
    first = false;
    day = new Date(day.getTime() + 86400000);
  }
  throw new RangeError("no match within 5 years");
}
