export class LRUCache {
  constructor({ max } = {}) {
    if (!Number.isInteger(max) || max < 1) throw new RangeError("max must be an integer >= 1");
    this.max = max;
    this.map = new Map();
  }

  set(key, value) {
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, value);
    if (this.map.size > this.max) {
      const oldest = this.map.keys().next().value;
      this.map.delete(oldest);
    }
    return this;
  }

  get(key) {
    return this.map.get(key);
  }

  has(key) {
    return this.map.has(key);
  }

  delete(key) {
    return this.map.delete(key);
  }

  get size() {
    return this.map.size;
  }

  keys() {
    return [...this.map.keys()];
  }
}
