/** Round a cent amount half away from zero. Tolerates float noise such as 100.49999999999999. */
export function roundCents(x) {
  return Math.sign(x) * Math.round(Math.abs(x) + 1e-7);
}

/** Format integer cents as "1234.56" / "-0.05". */
export function formatUsd(cents) {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}
