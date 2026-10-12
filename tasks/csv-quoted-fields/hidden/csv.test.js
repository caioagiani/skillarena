import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCSV } from "../src/csv.js";

test("simple rows", () => {
  assert.deepEqual(parseCSV("a,b\n1,2\n"), [["a", "b"], ["1", "2"]]);
  assert.deepEqual(parseCSV("a,b\n1,2"), [["a", "b"], ["1", "2"]]);
});
test("empty input", () => {
  assert.deepEqual(parseCSV(""), []);
});
test("quoted field with delimiter", () => {
  assert.deepEqual(parseCSV('name,address\nAna,"Rua A, 10"\n'), [["name", "address"], ["Ana", "Rua A, 10"]]);
});
test("escaped quotes", () => {
  assert.deepEqual(parseCSV('"say ""hi""",x'), [['say "hi"', "x"]]);
  assert.deepEqual(parseCSV('""""'), [['"']]);
});
test("line breaks inside quotes", () => {
  assert.deepEqual(parseCSV('id,note\n1,"line one\nline two"\n2,ok\n'), [
    ["id", "note"],
    ["1", "line one\nline two"],
    ["2", "ok"],
  ]);
});
test("CRLF line endings", () => {
  assert.deepEqual(parseCSV("a,b\r\n1,2\r\n"), [["a", "b"], ["1", "2"]]);
  assert.deepEqual(parseCSV('a\r\n"x\r\ny"\r\n'), [["a"], ["x\r\ny"]]);
});
test("empty fields and empty lines in the middle", () => {
  assert.deepEqual(parseCSV("a,,c\n,,\n"), [["a", "", "c"], ["", "", ""]]);
  assert.deepEqual(parseCSV("a\n\nb\n"), [["a"], [""], ["b"]]);
  assert.deepEqual(parseCSV('"",x'), [["", "x"]]);
});
test("whitespace is preserved", () => {
  assert.deepEqual(parseCSV(" a , b "), [[" a ", " b "]]);
});
test("quotes in the middle of a field are literal", () => {
  assert.deepEqual(parseCSV('5" screen,ok'), [['5" screen', "ok"]]);
});
test("custom delimiter", () => {
  assert.deepEqual(parseCSV('a;"b;c"\n1;2', { delimiter: ";" }), [["a", "b;c"], ["1", "2"]]);
});
test("unterminated quote throws SyntaxError", () => {
  assert.throws(() => parseCSV('a,"oops\n1,2'), SyntaxError);
});
test("trailing delimiter yields empty last field", () => {
  assert.deepEqual(parseCSV("a,b,\n"), [["a", "b", ""]]);
});
