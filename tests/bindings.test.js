import { test } from "node:test";
import assert from "node:assert/strict";
import { isActionAvailable, mergeBindings, parseOverrides } from "../mod/leader/bindingHelpers.js";

test("mergeBindings: null removes a key, new keys are added, others kept", () => {
  const merged = mergeBindings({ a: ["x", "A"], c: ["z", "C"] }, { a: null, b: ["y", "B"] });
  assert.deepEqual(Object.keys(merged).sort(), ["b", "c"]);
  assert.deepEqual(merged.b, ["y", "B"]);
});

test("parseOverrides: empty text is no overrides", () => {
  assert.deepEqual(parseOverrides(null), { table: {}, warning: null });
});

test("parseOverrides: bad JSON gives defaults and a warning", () => {
  const r = parseOverrides("{");
  assert.deepEqual(r.table, {});
  assert.match(r.warning, /^herdr-flow\.bindings\.json:/);
});

const env = { commands: new Set(["tab.new", "agent-history.open", "layout.toggle"]), mods: new Set(["agent-history"]) };

test("isActionAvailable: mod.open of a missing mod is hidden", () => {
  assert.equal(isActionAvailable("mod.open:redline", env), false);
});

test("isActionAvailable: our own screens, panels, send-key are always there", () => {
  for (const a of ["screen:git", "panel:git", "send-key", "repo:screen:git"])
    assert.equal(isActionAvailable(a, env), true);
});

test("isActionAvailable: a mod command needs that mod", () => {
  assert.equal(isActionAvailable("agent-history.open", env), true);
  assert.equal(isActionAvailable("herdr-nvim.pick", env), false);
});

test("isActionAvailable: nvim-zoom needs herdr-nvim", () => {
  assert.equal(isActionAvailable("nvim-zoom", env), false);
  assert.equal(isActionAvailable("nvim-zoom", { ...env, mods: new Set(["herdr-nvim"]) }), true);
});

test("isActionAvailable: app commands need the command", () => {
  assert.equal(isActionAvailable("tab.new", env), true);
  assert.equal(isActionAvailable("tab.select:1", { ...env, commands: new Set(["tab.select"]) }), true);
});

test("parseOverrides: rows that are not [action, label, …] are dropped with a warning", () => {
  const r = parseOverrides('{"a": 5, "b": ["tab.new", "new tab"], "c": null, "d": []}');
  assert.deepEqual(Object.keys(r.table).sort(), ["b", "c"]);
  assert.match(r.warning, /a, d/);
});
