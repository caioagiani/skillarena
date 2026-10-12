// Finance reference rates: USD per unit of currency, one table per UTC day, 2026-01-01 .. 2026-06-30.
const BASE = { EUR: 1.085, GBP: 1.27, BRL: 0.182 };

export const RATES = {};
const start = Date.UTC(2026, 0, 1);
for (let i = 0; i < 181; i++) {
  const day = new Date(start + i * 86_400_000).toISOString().slice(0, 10);
  RATES[day] = {};
  for (const [cur, base] of Object.entries(BASE)) {
    RATES[day][cur] = Math.round(base * (1 + 0.04 * Math.sin(i / 6) + 0.0005 * i) * 10_000) / 10_000;
  }
}
const LAST = Object.keys(RATES).at(-1);

/** Reference rate for a currency on a UTC day ("YYYY-MM-DD"). */
export function rateOn(currency, day) {
  const rate = RATES[day]?.[currency];
  if (rate === undefined) throw new RangeError(`no ${currency} rate for ${day}`);
  return rate;
}

/** Most recent published rate. */
export function latestRate(currency) {
  return RATES[LAST][currency];
}
