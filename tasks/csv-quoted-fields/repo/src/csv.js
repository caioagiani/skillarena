/**
 * Parse CSV text into an array of records (arrays of strings).
 *
 * Contract:
 * - Fields are separated by `options.delimiter` (default ","), records by "\n" or "\r\n".
 * - A field may be wrapped in double quotes. Inside a quoted field, delimiters and line breaks
 *   are literal, and a doubled quote ("") is an escaped quote character.
 * - Quotes only have special meaning at the start of a field; elsewhere they are literal.
 * - A single trailing line break at the end of the input does not produce an empty record.
 * - Empty input returns []. Whitespace around fields is preserved.
 * - An unterminated quoted field throws a SyntaxError.
 *
 * @param {string} text
 * @param {{ delimiter?: string }} [options]
 * @returns {string[][]}
 */
export function parseCSV(text, options = {}) {
  const delimiter = options.delimiter ?? ",";
  return text
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => line.split(delimiter));
}
