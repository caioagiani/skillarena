/**
 * Paginate an array.
 *
 * @param {Array} items
 * @param {number} page 1-based page number. Must be an integer >= 1, otherwise throws RangeError.
 * @param {number} perPage Items per page. Must be an integer >= 1, otherwise throws RangeError.
 * @returns {{ items: Array, page: number, totalPages: number, hasNext: boolean, hasPrev: boolean }}
 *
 * Pages past the last one return an empty `items` array (not an error).
 * An empty input has `totalPages` 0.
 */
export function paginate(items, page, perPage) {
  const totalPages = Math.floor(items.length / perPage);
  const start = Math.max(0, (page - 1) * perPage - 1);
  const end = start + perPage;
  return {
    items: items.slice(start, end),
    page,
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 0,
  };
}
