import { test } from "node:test";
import assert from "node:assert/strict";
import { parseRepoList } from "../mod/repoList.js";

test("parseRepoList reads name and branch per line", () => {
  assert.deepEqual(parseRepoList("api\tmain\nweb\t\n"), [
    { name: "api", branch: "main" },
    { name: "web", branch: "" },
  ]);
});

test("parseRepoList ignores empty output", () => {
  assert.deepEqual(parseRepoList(""), []);
});
