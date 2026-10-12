# lru

```js
import { LRUCache } from "./src/lru.js";
const cache = new LRUCache({ max: 100, ttlMs: 60_000 });
```

## Options

- `max` (required): maximum number of live entries. Must be an integer >= 1, otherwise the constructor throws `RangeError`.
- `ttlMs` (optional, **new**): entries expire `ttlMs` milliseconds after they were last **set**.
  Omitted means entries never expire. When given it must be a number > 0, otherwise `RangeError`.
- `now` (optional, **new**): clock function returning milliseconds, defaults to `Date.now`. Used for TTL.

## API

- `set(key, value)`: insert or update. Makes the key the most recently used and (re)starts its TTL.
  If this makes the cache exceed `max`, expired entries are dropped first; if it is still over,
  the least recently used entry is evicted. Returns the cache (chainable).
- `get(key)`: returns the value, or `undefined` if missing/expired. A hit makes the key the most
  recently used (it does **not** extend the TTL). Expired entries are removed.
- `has(key)`: `true` if present and not expired. Does **not** change recency.
- `delete(key)`: removes the key, returns `true` if a live entry was removed.
- `size`: number of live (non-expired) entries.
- `keys()`: array of live keys ordered from least to most recently used.
