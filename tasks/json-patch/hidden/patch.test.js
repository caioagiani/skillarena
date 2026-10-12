import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { applyPatch, PatchError } from "../src/patch.js";

const ok = (doc, patch, expected) => assert.deepEqual(applyPatch(doc, patch), expected, JSON.stringify(patch));
const fails = (doc, patch, index) =>
  assert.throws(
    () => applyPatch(doc, patch),
    (e) => e instanceof PatchError && e.index === index,
    `expected PatchError at index ${index} for ${JSON.stringify(patch)}`,
  );

// RFC 6902 Appendix A
test("RFC examples: add", () => {
  ok({ foo: "bar" }, [{ op: "add", path: "/baz", value: "qux" }], { baz: "qux", foo: "bar" });
  ok({ foo: ["bar", "baz"] }, [{ op: "add", path: "/foo/1", value: "qux" }], { foo: ["bar", "qux", "baz"] });
  ok({ foo: "bar" }, [{ op: "add", path: "/child", value: { grandchild: {} } }], { foo: "bar", child: { grandchild: {} } });
  ok({ foo: "bar" }, [{ op: "add", path: "/baz", value: "qux", xyz: 123 }], { foo: "bar", baz: "qux" });
  ok({ foo: ["bar"] }, [{ op: "add", path: "/foo/-", value: ["abc", "def"] }], { foo: ["bar", ["abc", "def"]] });
});
test("RFC examples: remove, replace, move", () => {
  ok({ baz: "qux", foo: "bar" }, [{ op: "remove", path: "/baz" }], { foo: "bar" });
  ok({ foo: ["bar", "qux", "baz"] }, [{ op: "remove", path: "/foo/1" }], { foo: ["bar", "baz"] });
  ok({ baz: "qux", foo: "bar" }, [{ op: "replace", path: "/baz", value: "boo" }], { baz: "boo", foo: "bar" });
  ok(
    { foo: { bar: "baz", waldo: "fred" }, qux: { corge: "grault" } },
    [{ op: "move", from: "/foo/waldo", path: "/qux/thud" }],
    { foo: { bar: "baz" }, qux: { corge: "grault", thud: "fred" } },
  );
  ok({ foo: ["all", "grass", "cows", "eat"] }, [{ op: "move", from: "/foo/1", path: "/foo/3" }], { foo: ["all", "cows", "eat", "grass"] });
});
test("RFC examples: test", () => {
  ok({ baz: "qux", foo: ["a", 2, "c"] }, [{ op: "test", path: "/baz", value: "qux" }, { op: "test", path: "/foo/1", value: 2 }], { baz: "qux", foo: ["a", 2, "c"] });
  fails({ baz: "qux" }, [{ op: "test", path: "/baz", value: "bar" }], 0);
  ok({ "/": 9, "~1": 10 }, [{ op: "test", path: "/~01", value: 10 }], { "/": 9, "~1": 10 });
  fails({ "/": 9, "~1": 10 }, [{ op: "test", path: "/~01", value: "10" }], 0);
});
test("RFC examples: errors", () => {
  fails({ foo: "bar" }, [{ op: "add", path: "/baz/bat", value: "qux" }], 0);
  fails({ foo: "bar" }, [{ op: "add", path: "/baz", value: "qux" }, { op: "remove", path: "/missing" }], 1);
});

test("pointer escaping", () => {
  ok({ "a/b": 1 }, [{ op: "replace", path: "/a~1b", value: 2 }], { "a/b": 2 });
  ok({ "m~n": 1 }, [{ op: "remove", path: "/m~0n" }], {});
  ok({}, [{ op: "add", path: "/~01", value: "x" }], { "~1": "x" });
  ok({ "": { "": 1 } }, [{ op: "replace", path: "//", value: 2 }], { "": { "": 2 } });
  ok({ " ": 1 }, [{ op: "test", path: "/ ", value: 1 }], { " ": 1 });
  fails({ a: 1 }, [{ op: "add", path: "/a~2", value: 1 }], 0);
  fails({ a: 1 }, [{ op: "add", path: "/a~", value: 1 }], 0);
  fails({ a: 1 }, [{ op: "replace", path: "a", value: 1 }], 0);
});

test("array indexes", () => {
  ok([1, 2, 3], [{ op: "add", path: "/3", value: 4 }], [1, 2, 3, 4]);
  ok([1, 2, 3], [{ op: "add", path: "/0", value: 0 }], [0, 1, 2, 3]);
  fails([1, 2, 3], [{ op: "add", path: "/4", value: 4 }], 0);
  fails([1, 2, 3], [{ op: "add", path: "/01", value: 4 }], 0);
  fails([1, 2, 3], [{ op: "add", path: "/-1", value: 4 }], 0);
  fails([1, 2, 3], [{ op: "add", path: "/1e0", value: 4 }], 0);
  fails([1, 2, 3], [{ op: "replace", path: "/3", value: 4 }], 0);
  fails([1, 2, 3], [{ op: "remove", path: "/-" }], 0);
  fails([1, 2, 3], [{ op: "replace", path: "/-", value: 1 }], 0);
  fails([1, 2, 3], [{ op: "test", path: "/-", value: 3 }], 0);
  ok({ a: { "0": "zero" } }, [{ op: "replace", path: "/a/0", value: "x" }], { a: { "0": "x" } });
  ok({ a: { "-": 1 } }, [{ op: "remove", path: "/a/-" }], { a: {} });
});

test("root operations", () => {
  ok({ a: 1 }, [{ op: "replace", path: "", value: [1] }], [1]);
  ok({ a: 1 }, [{ op: "add", path: "", value: "s" }], "s");
  ok(5, [{ op: "test", path: "", value: 5 }], 5);
  fails({ a: 1 }, [{ op: "remove", path: "" }], 0);
});

test("move and copy", () => {
  ok({ a: 1 }, [{ op: "move", from: "/a", path: "/a" }], { a: 1 });
  ok({ a: [1, 2] }, [{ op: "copy", from: "/a", path: "/b" }], { a: [1, 2], b: [1, 2] });
  ok([1, 2, 3], [{ op: "move", from: "/0", path: "/-" }], [2, 3, 1]);
  ok({ a: { b: 1 }, c: {} }, [{ op: "move", from: "/a", path: "/c/a" }], { c: { a: { b: 1 } } });
  fails({ a: { b: {} } }, [{ op: "move", from: "/a", path: "/a/b/c" }], 0);
  ok({ a: { b: 1 }, ab: 2 }, [{ op: "move", from: "/a", path: "/ab" }], { ab: { b: 1 } });
  fails({ a: 1 }, [{ op: "copy", from: "/missing", path: "/b" }], 0);
  fails({ a: 1 }, [{ op: "move", from: "/a", path: "/x/y" }], 0);
  const doc = { a: { deep: [1] } };
  const out = applyPatch(doc, [{ op: "copy", from: "/a", path: "/b" }]);
  out.b.deep.push(2);
  assert.deepEqual(out.a.deep, [1], "copy must be deep");
});

test("test op equality", () => {
  ok({ a: { x: 1, y: [1, { z: null }] } }, [{ op: "test", path: "/a", value: { y: [1, { z: null }], x: 1 } }], { a: { x: 1, y: [1, { z: null }] } });
  fails({ a: [1, 2] }, [{ op: "test", path: "/a", value: [2, 1] }], 0);
  fails({ a: 1 }, [{ op: "test", path: "/a", value: "1" }], 0);
  fails({ a: null }, [{ op: "test", path: "/a", value: false }], 0);
  fails({ a: {} }, [{ op: "test", path: "/a", value: [] }], 0);
  fails({}, [{ op: "test", path: "/missing", value: null }], 0);
  ok({ a: null }, [{ op: "test", path: "/a", value: null }], { a: null });
});

test("validation", () => {
  fails({}, [{ op: "add", path: "/a" }], 0);
  fails({}, [{ op: "replace", path: "/a" }], 0);
  fails({ a: 1 }, [{ op: "test", path: "/a" }], 0);
  ok({}, [{ op: "add", path: "/a", value: null }], { a: null });
  fails({}, [{ op: "frobnicate", path: "/a" }], 0);
  fails({}, [{ path: "/a", value: 1 }], 0);
  fails({}, [{ op: "add", value: 1 }], 0);
  fails({}, [{ op: "add", path: 5, value: 1 }], 0);
  fails({ a: 1 }, [{ op: "move", path: "/b" }], 0);
  fails({}, ["nope"], 0);
  fails({}, [null], 0);
  fails({}, { op: "add", path: "/a", value: 1 }, -1);
  fails({ a: "str" }, [{ op: "add", path: "/a/b", value: 1 }], 0);
  ok({}, [], {});
});

test("atomic: a failing patch changes nothing", () => {
  const doc = { list: [1, 2], meta: { n: 1 } };
  const before = structuredClone(doc);
  fails(doc, [
    { op: "add", path: "/list/-", value: 3 },
    { op: "replace", path: "/meta/n", value: 2 },
    { op: "remove", path: "/nope" },
  ], 2);
  assert.deepEqual(doc, before);
});

test("never mutates inputs and shares no structure", () => {
  const doc = { a: { b: [1, 2] }, c: 1 };
  const patch = [{ op: "add", path: "/a/b/-", value: { v: 1 } }, { op: "replace", path: "/c", value: 2 }];
  const docBefore = structuredClone(doc);
  const patchBefore = structuredClone(patch);
  const out = applyPatch(doc, patch);
  assert.deepEqual(doc, docBefore);
  assert.deepEqual(patch, patchBefore);
  assert.deepEqual(out, { a: { b: [1, 2, { v: 1 }] }, c: 2 });
  out.a.b[2].v = 99;
  assert.equal(patch[0].value.v, 1, "value objects from the patch must be copied");
  assert.notEqual(out.a, doc.a);
});

test("no dependencies", () => {
  const src = readFileSync(new URL("../src/patch.js", import.meta.url), "utf8");
  const imports = [
    ...src.matchAll(/^\s*import\s+(?:[\s\S]*?\s+from\s+)?["']([^"']+)["']/gm),
    ...src.matchAll(/\bimport\s*\(\s*["']([^"']+)["']\s*\)/g),
    ...src.matchAll(/\brequire\s*\(\s*["']([^"']+)["']\s*\)/g),
  ].map((m) => m[1]);
  assert.deepEqual(imports.filter((s) => !s.startsWith(".") && !s.startsWith("node:")), []);
});
