const GMAIL = new Set(["gmail.com", "googlemail.com"]);

/** Canonical form of an email, or null when it isn't a usable address. */
export function normalizeEmail(raw) {
  if (typeof raw !== "string") return null;
  const email = raw.trim().toLowerCase();
  const at = email.lastIndexOf("@");
  if (at <= 0 || at === email.length - 1) return null;
  let local = email.slice(0, at);
  let domain = email.slice(at + 1);
  if (GMAIL.has(domain)) {
    domain = "gmail.com";
    local = local.split("+")[0].replace(/\./g, "");
    if (!local) return null;
  }
  return `${local}@${domain}`;
}

/** Digits-only phone number; US numbers lose their leading country code. Too short => null. */
export function normalizePhone(raw) {
  if (typeof raw !== "string" && typeof raw !== "number") return null;
  let digits = String(raw).replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) digits = digits.slice(1);
  return digits.length >= 7 ? digits : null;
}
