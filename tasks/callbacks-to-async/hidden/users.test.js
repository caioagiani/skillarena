import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import * as users from "../src/users.js";
import { usersByDomain } from "../src/report.js";

const { createUser, getUser, updateUser, deleteUser, listUsers, resetUsers, NotFoundError, ValidationError } = users;

beforeEach(async () => {
  await resetUsers();
});

test("every exported function returns a promise", async () => {
  for (const [name, fn] of Object.entries(users)) {
    if (typeof fn !== "function" || /^[A-Z]/.test(name)) continue;
    const p = name === "createUser" ? fn({ name: "X", email: "x@y.io" }) : name === "updateUser" ? fn(999, {}) : fn(999);
    assert.ok(p && typeof p.then === "function", `${name} should return a Promise`);
    await p.catch(() => {});
  }
});
test("create, get, list", async () => {
  const a = await createUser({ name: "Ana", email: "ana@example.com" });
  const b = await createUser({ name: "Bia", email: "bia@example.com" });
  assert.deepEqual(a, { id: 1, name: "Ana", email: "ana@example.com" });
  assert.equal(b.id, 2);
  assert.deepEqual(await getUser(1), a);
  assert.deepEqual((await listUsers()).map((u) => u.id), [1, 2]);
});
test("ids are not consumed by failed creates", async () => {
  await assert.rejects(createUser({ name: "", email: "x@y.io" }), ValidationError);
  const u = await createUser({ name: "Ana", email: "ana@example.com" });
  assert.equal(u.id, 1);
});
test("not found errors keep class and code", async () => {
  await assert.rejects(getUser(42), (err) => err instanceof NotFoundError && err.code === "ENOTFOUND" && err.message === "user 42 not found");
  await assert.rejects(updateUser(42, { name: "x" }), NotFoundError);
  await assert.rejects(deleteUser(42), (err) => err.code === "ENOTFOUND");
});
test("validation errors keep class and code", async () => {
  await assert.rejects(createUser({ name: "Ana", email: "nope" }), (err) => err instanceof ValidationError && err.code === "EVALIDATION");
  const u = await createUser({ name: "Ana", email: "ana@example.com" });
  await assert.rejects(updateUser(u.id, { email: "bad" }), ValidationError);
  assert.equal((await getUser(u.id)).email, "ana@example.com");
});
test("update cannot change id", async () => {
  const u = await createUser({ name: "Ana", email: "ana@example.com" });
  const next = await updateUser(u.id, { id: 99, name: "Ana Maria" });
  assert.deepEqual(next, { id: 1, name: "Ana Maria", email: "ana@example.com" });
});
test("delete", async () => {
  const u = await createUser({ name: "Ana", email: "ana@example.com" });
  assert.equal(await deleteUser(u.id), undefined);
  await assert.rejects(getUser(u.id), NotFoundError);
});
test("returned objects are copies", async () => {
  const u = await createUser({ name: "Ana", email: "ana@example.com" });
  u.name = "hacked";
  (await listUsers())[0].name = "hacked";
  (await getUser(1)).name = "hacked";
  assert.equal((await getUser(1)).name, "Ana");
});
test("functions are asynchronous (no sync throw, resolves after current tick)", async () => {
  let resolved = false;
  const p = getUser(1).catch(() => {}).then(() => (resolved = true));
  assert.equal(resolved, false);
  await p;
});
test("usersByDomain is async and keeps ordering", async () => {
  await createUser({ name: "A", email: "a@b.com" });
  await createUser({ name: "B", email: "b@A.io" });
  await createUser({ name: "C", email: "c@a.io" });
  const p = usersByDomain();
  assert.ok(typeof p.then === "function");
  assert.deepEqual(await p, [
    { domain: "a.io", count: 2 },
    { domain: "b.com", count: 1 },
  ]);
});
