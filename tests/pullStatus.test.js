import { test } from "node:test";
import assert from "node:assert/strict";
import { pullOutcome, skipReason } from "../mod/git/pullStatus.js";

test("skipReason: detached, busy, no upstream, local changes, ok", () => {
  assert.equal(skipReason({ branch: "" }), "detached HEAD");
  assert.equal(skipReason({ branch: "main", merging: true }), "main: merge/rebase in progress");
  assert.equal(skipReason({ branch: "main", upstream: "" }), "main: no upstream");
  assert.equal(skipReason({ branch: "main", upstream: "origin/main", dirtyFiles: 2 }), "main: local changes (2 files)");
  assert.equal(skipReason({ branch: "main", upstream: "origin/main", dirtyFiles: 0 }), null);
});

test("pullOutcome: diverged is a skip, other errors fail", () => {
  const diverged = pullOutcome({
    branch: "main",
    upstream: "origin/main",
    code: 1,
    message: "fatal: Not possible to fast-forward",
  });
  assert.deepEqual(diverged, { state: "skip", text: "main: diverged from origin/main — pull by hand" });
  const fail = pullOutcome({ branch: "main", code: 1, message: "line one\nCould not resolve host" });
  assert.deepEqual(fail, { state: "fail", text: "main: Could not resolve host" });
});

test("pullOutcome: up to date and +N commits", () => {
  assert.deepEqual(pullOutcome({ branch: "main", code: 0, before: "a", after: "a" }), {
    state: "same",
    text: "main: up to date",
  });
  assert.deepEqual(pullOutcome({ branch: "main", code: 0, before: "a", after: "b", count: "1" }), {
    state: "ok",
    text: "main: +1 commit",
  });
  assert.deepEqual(pullOutcome({ branch: "main", code: 0, before: "a", after: "b", count: "3" }), {
    state: "ok",
    text: "main: +3 commits",
  });
});
