import { normalizeEmail, normalizePhone } from "./normalize.js";

const byCreatedThenId = (x, y) => x.createdAt - y.createdAt || (x.id < y.id ? -1 : x.id > y.id ? 1 : 0);

export function dedupeContacts(contacts) {
  const n = contacts.length;
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (i) => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  const union = (a, b) => {
    const ra = find(a), rb = find(b);
    if (ra !== rb) parent[rb] = ra;
  };

  const normalized = contacts.map((c) => ({
    emails: (c.emails ?? []).map(normalizeEmail),
    phones: (c.phones ?? []).map(normalizePhone),
  }));
  const owner = new Map();
  normalized.forEach(({ emails, phones }, i) => {
    for (const e of emails) if (e) owner.has(`e:${e}`) ? union(owner.get(`e:${e}`), i) : owner.set(`e:${e}`, i);
    for (const p of phones) if (p) owner.has(`p:${p}`) ? union(owner.get(`p:${p}`), i) : owner.set(`p:${p}`, i);
  });

  const groups = new Map();
  for (let i = 0; i < n; i++) {
    const r = find(i);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r).push(i);
  }

  const out = [];
  for (const idxs of groups.values()) {
    const members = idxs.sort((a, b) => byCreatedThenId(contacts[a], contacts[b]));
    const primary = contacts[members[0]];
    let name = "";
    for (const i of members) {
      const t = (contacts[i].name ?? "").trim();
      if (t) {
        name = t;
        break;
      }
    }
    const emails = new Set();
    const phones = new Set();
    for (const i of members) {
      for (const e of normalized[i].emails) if (e) emails.add(e);
      for (const p of normalized[i].phones) if (p) phones.add(p);
    }
    out.push({ id: primary.id, name, emails: [...emails], phones: [...phones], memberIds: members.map((i) => contacts[i].id), createdAt: primary.createdAt });
  }
  return out.sort(byCreatedThenId);
}
