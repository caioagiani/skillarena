import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createUser, getUser, resetUsers } from "../src/users.js";

beforeEach((t, done) => resetUsers(done));

test("create and get", (t, done) => {
  createUser({ name: "Ana", email: "ana@example.com" }, (err, user) => {
    assert.ifError(err);
    getUser(user.id, (err2, found) => {
      assert.ifError(err2);
      assert.equal(found.name, "Ana");
      done();
    });
  });
});
