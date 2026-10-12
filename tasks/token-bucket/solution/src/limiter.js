const positive = (x) => typeof x === "number" && Number.isFinite(x) && x > 0;

export function createLimiter({ capacity, refillPerSec, now = Date.now } = {}) {
  if (!positive(capacity)) throw new RangeError("capacity must be a finite number > 0");
  if (!positive(refillPerSec)) throw new RangeError("refillPerSec must be a finite number > 0");
  let tokens = capacity;
  let last = now();

  function refill() {
    const t = now();
    if (t > last) tokens = Math.min(capacity, tokens + ((t - last) / 1000) * refillPerSec);
    last = Math.max(last, t);
  }

  return {
    tryRemove(n = 1) {
      if (!positive(n)) throw new RangeError("n must be a finite number > 0");
      refill();
      if (n > tokens) return false;
      tokens -= n;
      return true;
    },
    available() {
      refill();
      return tokens;
    },
  };
}
