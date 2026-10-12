/**
 * Token-bucket rate limiter.
 *
 * createLimiter({ capacity, refillPerSec, now })
 * - `capacity`: maximum number of tokens (a finite number > 0). The bucket starts full.
 * - `refillPerSec`: tokens added per second (a finite number > 0). Refill is continuous,
 *   so fractional tokens accumulate (0.5s at 2/s adds 1 token). The bucket never exceeds `capacity`.
 * - `now`: optional clock returning milliseconds, defaults to `Date.now`.
 *   If the clock goes backwards, no tokens are added (and none are removed).
 * Invalid `capacity` / `refillPerSec` throw RangeError.
 *
 * Returned object:
 * - `tryRemove(n = 1)`: if at least `n` tokens are available, removes them and returns true;
 *   otherwise returns false and removes nothing. `n` must be a finite number > 0, else RangeError.
 *   Asking for more than `capacity` always returns false.
 * - `available()`: current number of tokens (may be fractional).
 *
 * @param {{ capacity: number, refillPerSec: number, now?: () => number }} options
 */
export function createLimiter(options) {
  throw new Error("not implemented");
}
