import { test } from "node:test";
import assert from "node:assert/strict";
import { keyed, latin, onListKey } from "../mod/pickerKeyHelpers.js";

test("keyed gives fixed keys, then 1-9, then free letters", () => {
  const rows = keyed([{ key: "p" }, ...Array.from({ length: 11 }, () => ({}))]);
  assert.equal(rows[0].key, "p");
  assert.equal(rows[1].key, "1");
  assert.equal(rows[9].key, "9");
  assert.equal(rows[10].key, "a");
  assert.equal(rows[11].key, "b");
});

test("keyed skips letters taken by fixed rows", () => {
  const rows = keyed([{ key: "a" }, ...Array.from({ length: 10 }, () => ({}))]);
  assert.equal(rows[10].key, "b");
});

test("latin maps the Russian layout and keeps case", () => {
  assert.equal(latin("о"), "j");
  assert.equal(latin("О"), "J");
  assert.equal(latin("x"), "x");
  assert.equal(latin("Ж"), ":");
  assert.equal(latin("Х"), "{");
});

const key = (k, char = k) => ({ key: k, key_char: char, modifiers: {} });

test("onListKey: / starts a search, typing filters, Esc clears", () => {
  const s = { filter: "", searching: false, at: 0 };
  const opts = { act: () => {}, back: () => {} };
  assert.equal(onListKey(s, key("/"), [], opts), true);
  assert.equal(s.searching, true);
  onListKey(s, key("f"), [], opts);
  assert.equal(s.filter, "f");
  onListKey(s, key("escape", null), [], opts);
  assert.deepEqual([s.filter, s.searching], ["", false]);
});

test("onListKey: Enter with one match acts on it", () => {
  const s = { filter: "x", searching: true, at: 0 };
  let acted = null;
  onListKey(s, key("enter", null), [{ key: "1" }], { act: (r) => (acted = r), back: () => {} });
  assert.deepEqual(acted, { key: "1" });
});

test("onListKey: a row key acts, Esc with nothing to clear goes back", () => {
  const s = { filter: "", searching: false, at: 0 };
  let acted = null;
  let back = false;
  const opts = { act: (r) => (acted = r), back: () => (back = true) };
  onListKey(s, key("2"), [{ key: "1" }, { key: "2" }], opts);
  assert.equal(acted.key, "2");
  onListKey(s, key("escape", null), [], opts);
  assert.equal(back, true);
});
