import { normalizeEmail, normalizePhone } from "./normalize.js";

/**
 * Group contacts that belong to the same person and merge each group into one record.
 *
 * Two contacts belong to the same person when they share a normalized email or a normalized
 * phone, directly or through other contacts (transitively).
 *
 * @param {{ id: string, name?: string, emails?: string[], phones?: (string|number)[], createdAt: number }[]} contacts
 * @returns {{ id: string, name: string, emails: string[], phones: string[], memberIds: string[], createdAt: number }[]}
 */
export function dedupeContacts(contacts) {
  // Start with one group per contact.
  let groups = contacts.map((c) => ({
    members: [c],
    emails: new Set((c.emails ?? []).map(normalizeEmail).filter(Boolean)),
    phones: new Set((c.phones ?? []).map(normalizePhone).filter(Boolean)),
  }));

  // Keep merging any two groups that share an email or a phone until nothing changes.
  let changed = true;
  while (changed) {
    changed = false;
    outer: for (let i = 0; i < groups.length; i++) {
      for (let j = i + 1; j < groups.length; j++) {
        const a = groups[i];
        const b = groups[j];
        const overlap = [...b.emails].some((e) => a.emails.has(e)) || [...b.phones].some((p) => a.phones.has(p));
        if (overlap) {
          a.members.push(...b.members);
          for (const e of b.emails) a.emails.add(e);
          for (const p of b.phones) a.phones.add(p);
          groups.splice(j, 1);
          changed = true;
          break outer;
        }
      }
    }
  }

  return groups
    .map((g) => {
      const members = [...g.members].sort((x, y) => x.createdAt - y.createdAt || (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
      const primary = members[0];
      const name = members.map((m) => (m.name ?? "").trim()).find((n) => n.length > 0) ?? "";
      const emails = [];
      const phones = [];
      for (const m of members) {
        for (const e of m.emails ?? []) {
          const n = normalizeEmail(e);
          if (n && !emails.includes(n)) emails.push(n);
        }
        for (const p of m.phones ?? []) {
          const n = normalizePhone(p);
          if (n && !phones.includes(n)) phones.push(n);
        }
      }
      return { id: primary.id, name, emails, phones, memberIds: members.map((m) => m.id), createdAt: primary.createdAt };
    })
    .sort((x, y) => x.createdAt - y.createdAt || (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
}
