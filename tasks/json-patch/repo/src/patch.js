export class PatchError extends Error {
  constructor(message, index) {
    super(message);
    this.name = "PatchError";
    this.index = index;
  }
}

/**
 * Apply an RFC 6902 JSON Patch. See README.md.
 * @param {unknown} document
 * @param {Array<object>} patch
 * @returns {unknown} the patched document
 */
export function applyPatch(document, patch) {
  throw new Error("not implemented");
}
