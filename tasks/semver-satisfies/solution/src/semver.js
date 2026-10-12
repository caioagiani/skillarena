const NUM = "0|[1-9]\\d*";
const PRE_ID = `(?:${NUM}|\\d*[a-zA-Z-][a-zA-Z0-9-]*)`;
const VERSION = new RegExp(
  `^v?(${NUM})\\.(${NUM})\\.(${NUM})(?:-(${PRE_ID}(?:\\.${PRE_ID})*))?(?:\\+[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?$`,
);
const XR = `(?:${NUM}|[xX*])`;
const PARTIAL = new RegExp(
  `^v?(${XR})(?:\\.(${XR})(?:\\.(${XR})(?:-(${PRE_ID}(?:\\.${PRE_ID})*))?(?:\\+[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?)?)?$`,
);

function parseVersion(s) {
  const m = VERSION.exec(s.trim().replace(/^=\s*/, ""));
  if (!m) return null;
  return { major: +m[1], minor: +m[2], patch: +m[3], pre: m[4] ? m[4].split(".").map((p) => (/^\d+$/.test(p) ? +p : p)) : [] };
}

function cmpPre(a, b) {
  if (!a.length && !b.length) return 0;
  if (!a.length) return 1;
  if (!b.length) return -1;
  for (let i = 0; ; i++) {
    if (i >= a.length && i >= b.length) return 0;
    if (i >= a.length) return -1;
    if (i >= b.length) return 1;
    const x = a[i], y = b[i];
    if (x === y) continue;
    const xn = typeof x === "number", yn = typeof y === "number";
    if (xn && yn) return x < y ? -1 : 1;
    if (xn) return -1;
    if (yn) return 1;
    return x < y ? -1 : 1;
  }
}

function compare(a, b) {
  return a.major - b.major || a.minor - b.minor || a.patch - b.patch || cmpPre(a.pre, b.pre);
}

const isX = (p) => p === undefined || /^[xX*]$/.test(p);
const v = (major, minor, patch, pre = []) => ({ major, minor, patch, pre });
// Exclusive upper bound that also keeps prereleases of that version out (npm's "-0").
const below = (major, minor, patch) => ({ op: "<", ver: v(major, minor, patch, [0]) });

function parsePartial(s) {
  const m = PARTIAL.exec(s);
  if (!m) return null;
  const [, M, m2, p, pre] = m;
  return { M, m: m2, p, pre: pre ? pre.split(".").map((x) => (/^\d+$/.test(x) ? +x : x)) : [] };
}

/** Desugar one range token (with its operator) into primitive comparators. */
function desugar(op, text) {
  const x = parsePartial(text);
  if (!x) return null;
  const xM = isX(x.M), xm = xM || isX(x.m), xp = xm || isX(x.p);
  const M = xM ? 0 : +x.M, mi = xm ? 0 : +x.m, pa = xp ? 0 : +x.p;

  if (op === "~") {
    if (xM) return [];
    if (xm) return [{ op: ">=", ver: v(M, 0, 0) }, below(M + 1, 0, 0)];
    return [{ op: ">=", ver: v(M, mi, pa, x.pre) }, below(M, mi + 1, 0)];
  }
  if (op === "^") {
    if (xM) return [];
    if (xm) return [{ op: ">=", ver: v(M, 0, 0) }, below(M + 1, 0, 0)];
    if (xp) return [{ op: ">=", ver: v(M, mi, 0) }, M ? below(M + 1, 0, 0) : below(0, mi + 1, 0)];
    const lo = { op: ">=", ver: v(M, mi, pa, x.pre) };
    if (M) return [lo, below(M + 1, 0, 0)];
    if (mi) return [lo, below(0, mi + 1, 0)];
    return [lo, below(0, 0, pa + 1)];
  }
  if (!xp) return [{ op: op || "=", ver: v(M, mi, pa, x.pre) }];
  // X-ranges
  if (xM) return op === "<" || op === ">" ? [{ op: "<", ver: v(0, 0, 0, [0]) }] : [];
  const next = xm ? v(M + 1, 0, 0) : v(M, mi + 1, 0);
  switch (op) {
    case ">": return [{ op: ">=", ver: next }];
    case ">=": return [{ op: ">=", ver: v(M, mi, 0) }];
    case "<": return [below(M, mi, 0)];
    case "<=": return [below(next.major, next.minor, next.patch)];
    default: return [{ op: ">=", ver: v(M, mi, 0) }, below(next.major, next.minor, next.patch)];
  }
}

function hyphen(a, b) {
  const x = parsePartial(a), y = parsePartial(b);
  if (!x || !y) return null;
  const lo = isX(x.M) ? [] : [{ op: ">=", ver: v(+x.M, isX(x.m) ? 0 : +x.m, isX(x.m) || isX(x.p) ? 0 : +x.p, x.pre) }];
  if (isX(y.M)) return lo;
  if (isX(y.m)) return [...lo, below(+y.M + 1, 0, 0)];
  if (isX(y.p)) return [...lo, below(+y.M, +y.m + 1, 0)];
  return [...lo, { op: "<=", ver: v(+y.M, +y.m, +y.p, y.pre) }];
}

function parseAlternative(alt) {
  const s = alt.trim();
  const h = /^(\S+)\s+-\s+(\S+)$/.exec(s);
  if (h) return hyphen(h[1], h[2]);
  const tokens = s.replace(/(<=|>=|[<>=~^])\s+/g, "$1").split(/\s+/).filter(Boolean);
  const out = [];
  for (const t of tokens) {
    const m = /^(<=|>=|<|>|=|~|\^)?(.+)$/.exec(t);
    if (!m) return null;
    const parts = desugar(m[1] ?? "", m[2]);
    if (!parts) return null;
    out.push(...parts);
  }
  return out;
}

function test(ver, c) {
  const d = compare(ver, c.ver);
  switch (c.op) {
    case "<": return d < 0;
    case "<=": return d <= 0;
    case ">": return d > 0;
    case ">=": return d >= 0;
    default: return d === 0;
  }
}

export function satisfies(version, range) {
  if (typeof version !== "string" || typeof range !== "string") return false;
  const ver = parseVersion(version);
  if (!ver) return false;
  const alts = range.split("||").map(parseAlternative);
  if (alts.some((a) => a === null)) return false;
  return alts.some((set) => {
    if (!set.every((c) => test(ver, c))) return false;
    if (!ver.pre.length) return true;
    return set.some(
      (c) => c.ver.pre.length && !(c.ver.pre.length === 1 && c.ver.pre[0] === 0 && c.op === "<") &&
        c.ver.major === ver.major && c.ver.minor === ver.minor && c.ver.patch === ver.patch,
    );
  });
}
