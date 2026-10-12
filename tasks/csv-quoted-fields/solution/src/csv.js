export function parseCSV(text, options = {}) {
  const d = options.delimiter ?? ",";
  const rows = [];
  let row = [];
  let field = "";
  let i = 0;
  let atFieldStart = true;
  if (text === "") return [];
  while (i < text.length) {
    const ch = text[i];
    if (atFieldStart && ch === '"') {
      i++;
      for (;;) {
        if (i >= text.length) throw new SyntaxError("unterminated quoted field");
        if (text[i] === '"') {
          if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
          i++;
          break;
        }
        field += text[i++];
      }
      atFieldStart = false;
      continue;
    }
    if (ch === d) { row.push(field); field = ""; atFieldStart = true; i++; continue; }
    if (ch === "\n" || (ch === "\r" && text[i + 1] === "\n")) {
      row.push(field); rows.push(row); row = []; field = ""; atFieldStart = true;
      i += ch === "\r" ? 2 : 1;
      continue;
    }
    field += ch; atFieldStart = false; i++;
  }
  if (!atFieldStart || field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows;
}
