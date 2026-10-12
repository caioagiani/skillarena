import { listUsers } from "./users.js";

/** Count users per email domain, sorted by count desc then domain asc. */
export function usersByDomain(cb) {
  listUsers((err, users) => {
    if (err) return cb(err);
    const counts = new Map();
    for (const u of users) {
      const domain = u.email.split("@")[1].toLowerCase();
      counts.set(domain, (counts.get(domain) ?? 0) + 1);
    }
    const rows = [...counts].map(([domain, count]) => ({ domain, count }));
    rows.sort((a, b) => b.count - a.count || a.domain.localeCompare(b.domain));
    cb(null, rows);
  });
}
