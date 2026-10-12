import { listUsers } from "./users.js";

export async function usersByDomain() {
  const users = await listUsers();
  const counts = new Map();
  for (const u of users) {
    const domain = u.email.split("@")[1].toLowerCase();
    counts.set(domain, (counts.get(domain) ?? 0) + 1);
  }
  const rows = [...counts].map(([domain, count]) => ({ domain, count }));
  rows.sort((a, b) => b.count - a.count || a.domain.localeCompare(b.domain));
  return rows;
}
