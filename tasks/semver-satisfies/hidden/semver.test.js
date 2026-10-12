import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { satisfies } from "../src/semver.js";

// Expected values were generated with npm's node-semver (strict mode).
test("exact and primitives", () => {
  const cases = [
  ["1.2.3", "1.2.3", true],
  ["1.2.3", "=1.2.3", true],
  ["v1.2.3", "1.2.3", true],
  ["1.2.3", "v1.2.3", true],
  [" 1.2.3 ", "1.2.3", true],
  ["1.2.4", "1.2.3", false],
  ["1.2.3", ">1.2.2", true],
  ["1.2.3", ">1.2.3", false],
  ["1.2.3", ">=1.2.3", true],
  ["1.2.3", "<1.2.4", true],
  ["1.2.3", "<1.2.3", false],
  ["1.2.3", "<=1.2.3", true],
  ["1.2.3", ">= 1.2.3", true],
  ["1.2.3", "> 1.2.2 < 1.2.4", true],
  ["1.2.3+build.5", "1.2.3", true],
  ["1.2.3", "1.2.3+build", true],
  ];
  for (const [v, r, expected] of cases) assert.equal(satisfies(v, r), expected, `satisfies(${JSON.stringify(v)}, ${JSON.stringify(r)})`);
});

test("and / or", () => {
  const cases = [
  ["1.5.0", ">=1.2.0 <2.0.0", true],
  ["2.0.0", ">=1.2.0 <2.0.0", false],
  ["0.9.0", "<1.0.0 || >=2.0.0", true],
  ["1.5.0", "<1.0.0 || >=2.0.0", false],
  ["2.1.0", "<1.0.0 || >=2.0.0", true],
  ["1.2.3", "1.2.3 || 2.0.0", true],
  ["3.0.0", ">=1.0.0 <2.0.0 || >=3.0.0 <4.0.0", true],
  ["1.2.3", "  >=1.0.0    <2.0.0  ", true],
  ];
  for (const [v, r, expected] of cases) assert.equal(satisfies(v, r), expected, `satisfies(${JSON.stringify(v)}, ${JSON.stringify(r)})`);
});

test("x-ranges", () => {
  const cases = [
  ["1.0.0", "*", true],
  ["0.0.1", "", true],
  ["1.0.0", "x", true],
  ["1.9.9", "1.x", true],
  ["2.0.0", "1.x", false],
  ["1.2.9", "1.2.x", true],
  ["1.3.0", "1.2.x", false],
  ["1.2.0", "1.2.*", true],
  ["1.9.0", "1", true],
  ["1.2.5", "1.2", true],
  ["1.3.0", "1.2", false],
  ["2.0.0", ">1", true],
  ["1.9.9", ">1", false],
  ["1.3.0", ">1.2", true],
  ["1.2.9", ">1.2", false],
  ["1.2.0", ">=1.2", true],
  ["1.1.9", "<1.2", true],
  ["1.2.0", "<1.2", false],
  ["1.2.9", "<=1.2", true],
  ["1.3.0", "<=1.2", false],
  ["1.2.5", "=1.2", true],
  ["1.0.0", "X", true],
  ["1.2.3", "1.X", true],
  ];
  for (const [v, r, expected] of cases) assert.equal(satisfies(v, r), expected, `satisfies(${JSON.stringify(v)}, ${JSON.stringify(r)})`);
});

test("hyphen", () => {
  const cases = [
  ["1.2.3", "1.2.3 - 2.3.4", true],
  ["2.3.4", "1.2.3 - 2.3.4", true],
  ["2.3.5", "1.2.3 - 2.3.4", false],
  ["1.2.0", "1.2 - 2.3.4", true],
  ["1.1.9", "1.2 - 2.3.4", false],
  ["2.3.9", "1.2.3 - 2.3", true],
  ["2.4.0", "1.2.3 - 2.3", false],
  ["2.9.9", "1.2.3 - 2", true],
  ["3.0.0", "1.2.3 - 2", false],
  ["1.0.0", "1 - 2", true],
  ];
  for (const [v, r, expected] of cases) assert.equal(satisfies(v, r), expected, `satisfies(${JSON.stringify(v)}, ${JSON.stringify(r)})`);
});

test("tilde", () => {
  const cases = [
  ["1.2.9", "~1.2.3", true],
  ["1.3.0", "~1.2.3", false],
  ["1.2.2", "~1.2.3", false],
  ["1.2.0", "~1.2", true],
  ["1.3.0", "~1.2", false],
  ["1.9.9", "~1", true],
  ["2.0.0", "~1", false],
  ["0.2.9", "~0.2.3", true],
  ["0.3.0", "~0.2.3", false],
  ["1.2.3", "~1.2.3-beta.2", true],
  ["1.2.3-beta.4", "~1.2.3-beta.2", true],
  ["1.2.4-beta.2", "~1.2.3-beta.2", false],
  ["1.2.3", "~ 1.2.3", true],
  ["0.0.5", "~0", true],
  ];
  for (const [v, r, expected] of cases) assert.equal(satisfies(v, r), expected, `satisfies(${JSON.stringify(v)}, ${JSON.stringify(r)})`);
});

test("caret", () => {
  const cases = [
  ["1.9.9", "^1.2.3", true],
  ["2.0.0", "^1.2.3", false],
  ["1.2.2", "^1.2.3", false],
  ["0.2.9", "^0.2.3", true],
  ["0.3.0", "^0.2.3", false],
  ["0.0.3", "^0.0.3", true],
  ["0.0.4", "^0.0.3", false],
  ["1.5.0", "^1.2.x", true],
  ["1.1.0", "^1.2.x", false],
  ["0.0.9", "^0.0.x", true],
  ["0.1.0", "^0.0.x", false],
  ["0.0.9", "^0.0", true],
  ["0.1.0", "^0.0", false],
  ["1.9.0", "^1.x", true],
  ["0.9.9", "^0.x", true],
  ["1.0.0", "^0.x", false],
  ["1.0.0", "^1", true],
  ["0.1.0", "^0.1", true],
  ["0.2.0", "^0.1", false],
  ["1.2.3", "^ 1.2.3", true],
  ["0.0.0", "^0.0.0", true],
  ["0.0.1", "^0.0.0", false],
  ];
  for (const [v, r, expected] of cases) assert.equal(satisfies(v, r), expected, `satisfies(${JSON.stringify(v)}, ${JSON.stringify(r)})`);
});

test("prerelease precedence", () => {
  const cases = [
  ["1.0.0-alpha", "<1.0.0-alpha.1", true],
  ["1.0.0-alpha.1", "<1.0.0-alpha.beta", true],
  ["1.0.0-alpha.beta", "<1.0.0-beta", true],
  ["1.0.0-beta", "<1.0.0-beta.2", true],
  ["1.0.0-beta.2", "<1.0.0-beta.11", true],
  ["1.0.0-beta.11", "<1.0.0-rc.1", true],
  ["1.0.0-rc.1", "<1.0.0", false],
  ["1.0.0-rc.1", ">1.0.0-rc.0", true],
  ["1.0.0-2", ">1.0.0-10", false],
  ["1.0.0-a", ">1.0.0-10", true],
  ["1.0.0-alpha+001", "=1.0.0-alpha+002", true],
  ];
  for (const [v, r, expected] of cases) assert.equal(satisfies(v, r), expected, `satisfies(${JSON.stringify(v)}, ${JSON.stringify(r)})`);
});

test("prerelease rule", () => {
  const cases = [
  ["1.2.3-alpha.7", ">1.2.3-alpha.3", true],
  ["3.4.5-alpha.9", ">1.2.3-alpha.3", false],
  ["3.4.5", ">1.2.3-alpha.3", true],
  ["2.0.0-beta", "^1.2.3", false],
  ["1.3.0-beta", "^1.2.3", false],
  ["1.2.3-beta", "^1.2.3-alpha", true],
  ["1.2.4-beta", "^1.2.3-alpha", false],
  ["1.0.0-beta", "*", false],
  ["1.0.0-beta", ">=0.0.0", false],
  ["1.2.3-rc.1", "1.2.3-rc.1", true],
  ["1.2.3-rc.1", "1.x", false],
  ["2.0.0-rc.1", "<2.0.0", false],
  ["2.0.0-rc.1", ">=2.0.0-rc.0 <2.0.0", true],
  ["1.2.3-pr.2", "1.2.3-pr.1 - 1.2.3-pr.5", true],
  ["1.2.4-pr.2", "1.2.3-pr.1 - 1.2.4", false],
  ["1.2.3-beta", "<1.2.3 || >1.2.3-alpha", true],
  ];
  for (const [v, r, expected] of cases) assert.equal(satisfies(v, r), expected, `satisfies(${JSON.stringify(v)}, ${JSON.stringify(r)})`);
});

test("invalid input returns false", () => {
  const cases = [
  ["1.2", "1.2.3", false],
  ["1.2.3.4", "*", false],
  ["01.2.3", "*", false],
  ["1.2.3-", "*", false],
  ["foo", "*", false],
  ["", "*", false],
  ["1.2.3", "not a range", false],
  ["1.2.3", ">=1.2.3 <", false],
  ["1.2.3", "1.2.3 - ", false],
  ["1.2.3", "^^1", false],
  ];
  for (const [v, r, expected] of cases) assert.equal(satisfies(v, r), expected, `satisfies(${JSON.stringify(v)}, ${JSON.stringify(r)})`);
});

test("non-string input returns false", () => {
  for (const [v, r] of [[null, "*"], ["1.2.3", null], [123, "*"], [undefined, undefined]]) assert.equal(satisfies(v, r), false);
});

test("no dependencies", () => {
  const src = readFileSync(new URL("../src/semver.js", import.meta.url), "utf8");
  const imports = [
    ...src.matchAll(/^\s*import\s+(?:[\s\S]*?\s+from\s+)?["']([^"']+)["']/gm),
    ...src.matchAll(/\bimport\s*\(\s*["']([^"']+)["']\s*\)/g),
    ...src.matchAll(/\brequire\s*\(\s*["']([^"']+)["']\s*\)/g),
  ].map((m) => m[1]);
  assert.deepEqual(imports.filter((s) => !s.startsWith(".") && !s.startsWith("node:")), []);
});
