import { test } from "node:test";
import assert from "node:assert/strict";
import { ago } from "../mod/time.js";

const before = (seconds) => new Date(Date.now() - seconds * 1000).toISOString();

test("ago in minutes, hours, days", () => {
  assert.equal(ago(before(90)), "2m");
  assert.equal(ago(before(2 * 3600)), "2h");
  assert.equal(ago(before(3 * 86400)), "3d");
});

test("ago of a bad date is empty", () => {
  assert.equal(ago("nope"), "");
});
