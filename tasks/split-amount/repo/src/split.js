/**
 * Split an amount in cents proportionally to `weights`.
 *
 * Contract:
 * - Returns an array of integers (cents), one per weight, that sums EXACTLY to `totalCents`.
 * - Allocation uses the largest remainder method: each part first gets floor(total * w / sum),
 *   then the leftover cents go one each to the parts with the largest fractional remainders.
 *   Ties are broken by the lower index.
 * - A part with weight 0 always gets 0.
 * - `totalCents` must be a non-negative safe integer, otherwise RangeError.
 * - `weights` must be a non-empty array of finite numbers >= 0 with a positive sum, otherwise RangeError.
 *
 * @param {number} totalCents
 * @param {number[]} weights
 * @returns {number[]}
 */
export function splitAmount(totalCents, weights) {
  const sum = weights.reduce((a, b) => a + b, 0);
  return weights.map((w) => Math.round((totalCents * w) / sum));
}
