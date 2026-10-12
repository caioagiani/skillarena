export class LRUCache {
  constructor({ max, ttlMs, now = Date.now } = {}) {
    if (!Number.isInteger(max) || max < 1) throw new RangeError("max must be an integer >= 1");
    if (ttlMs !== undefined && !(typeof ttlMs === "number" && ttlMs > 0)) throw new RangeError("ttlMs must be > 0");
    this.max = max;
    this.ttlMs = ttlMs;
    this.now = now;
    this.map = new Map(); // key -> { value, expires }
  }

  #expired(entry) {
    return entry.expires !== Infinity && this.now() >= entry.expires;
  }

  #purge() {
    for (const [k, e] of this.map) if (this.#expired(e)) this.map.delete(k);
  }

  set(key, value) {
    this.map.delete(key);
    this.map.set(key, { value, expires: this.ttlMs ? this.now() + this.ttlMs : Infinity });
    if (this.map.size > this.max) this.#purge();
    while (this.map.size > this.max) this.map.delete(this.map.keys().next().value);
    return this;
  }

  get(key) {
    const e = this.map.get(key);
    if (!e) return undefined;
    this.map.delete(key);
    if (this.#expired(e)) return undefined;
    this.map.set(key, e);
    return e.value;
  }

  has(key) {
    const e = this.map.get(key);
    return Boolean(e) && !this.#expired(e);
  }

  delete(key) {
    const e = this.map.get(key);
    if (!e) return false;
    this.map.delete(key);
    return !this.#expired(e);
  }

  get size() {
    this.#purge();
    return this.map.size;
  }

  keys() {
    this.#purge();
    return [...this.map.keys()];
  }
}
