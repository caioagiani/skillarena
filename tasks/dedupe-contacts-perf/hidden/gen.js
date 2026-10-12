// Deterministic contact generator full of the edge cases a rewrite tends to break.
export function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generate(n, seed, opts = {}) {
  const r = rng(seed);
  const pick = (xs) => xs[Math.floor(r() * xs.length)];
  const people = Math.max(1, Math.floor(n * (opts.uniqueRatio ?? 0.6)));
  const domains = ["acme.io", "gmail.com", "googlemail.com", "Example.COM", "mail.co"];
  const baseEmail = (p) => ({ local: `user.${p}`, domain: pick(domains) });
  const emailVariant = ({ local, domain }) => {
    let l = local, d = domain;
    if (/gmail/i.test(d)) {
      if (r() < 0.3) l = l.replace(".", "");
      if (r() < 0.3) l = `${l}+tag${Math.floor(r() * 5)}`;
      if (r() < 0.3) d = d === "gmail.com" ? "googlemail.com" : "gmail.com";
    }
    let e = `${l}@${d}`;
    if (r() < 0.3) e = e.toUpperCase();
    if (r() < 0.2) e = `  ${e} `;
    return e;
  };
  const basePhone = (p) => String(2000000000 + ((p * 7919) % 7999999999));
  const phoneVariant = (digits) => {
    const roll = r();
    if (roll < 0.15) return Number(digits);
    if (roll < 0.3) return Number(`1${digits}`);
    if (roll < 0.5) return `+1 (${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
    if (roll < 0.65) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
    return digits;
  };
  const junk = ["", "   ", "n/a", "@nope.com", "nobody@", "+tag@gmail.com", "...@gmail.com", "12-34", "555", null, 0];
  const names = ["Ana", " Bia ", "", "   ", "Caio", "Dani", "Edu ", "Fê"];
  const ids = new Set();
  const out = [];
  for (let i = 0; i < n; i++) {
    const p = Math.floor(r() * people);
    let id;
    do id = `c${Math.floor(r() * n * 20).toString(r() < 0.5 ? 10 : 36)}`;
    while (ids.has(id));
    ids.add(id);
    const emails = [];
    const phones = [];
    if (r() < 0.8) emails.push(emailVariant(baseEmail(p)));
    if (r() < 0.15) emails.push(emailVariant(baseEmail(Math.floor(r() * people))));
    if (r() < 0.1) emails.push(emails[0] ?? "dup@acme.io");
    if (r() < 0.1) emails.push(pick(junk));
    if (r() < 0.6) phones.push(phoneVariant(basePhone(p)));
    if (r() < 0.1) phones.push(pick(junk));
    if (opts.switchboard && r() < opts.switchboard) phones.push(pick(["(555) 010-0000", "15550100000", 5550100000]));
    const c = { id, createdAt: Math.floor(r() * (opts.timeBuckets ?? 50)) };
    if (r() < 0.95) c.name = pick(names);
    if (emails.length || r() < 0.5) c.emails = emails.filter((e) => typeof e === "string");
    if (phones.length || r() < 0.5) c.phones = phones.filter((x) => typeof x === "string" || typeof x === "number");
    out.push(c);
  }
  return out;
}
