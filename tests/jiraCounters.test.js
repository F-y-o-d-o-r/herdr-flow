import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_COUNTERS,
  counterActiveColor,
  diffNewCounterIssues,
  parseCounters,
} from "../mod/jira/counterHelpers.js";

test("parseCounters: empty or whitespace text returns defaults", () => {
  assert.deepEqual(parseCounters("").counters, DEFAULT_COUNTERS);
  assert.equal(parseCounters("").warning, null);
  assert.deepEqual(parseCounters(null).counters, DEFAULT_COUNTERS);
  assert.deepEqual(parseCounters("   ").counters, DEFAULT_COUNTERS);
});

test("parseCounters: bad JSON returns defaults with warning", () => {
  const r = parseCounters("{ bad json");
  assert.deepEqual(r.counters, DEFAULT_COUNTERS);
  assert.match(r.warning ?? "", /^herdr-flow\.jira\.json:/);
});

test("parseCounters: non-array non-object returns defaults with warning", () => {
  const r = parseCounters('"some string"');
  assert.deepEqual(r.counters, DEFAULT_COUNTERS);
  assert.match(r.warning ?? "", /expected an array of counters/);
});

test("parseCounters: array of counters parses and fills default id/key/notify", () => {
  const json = JSON.stringify([
    { tag: "R", label: "Review on me", jql: "status = Review", color: "warn" },
    { id: "custom", tag: "X", key: "z", label: "Custom", jql: "status = Custom" },
  ]);
  const r = parseCounters(json);
  assert.equal(r.warning, null);
  assert.equal(r.counters.length, 2);
  assert.deepEqual(r.counters[0], {
    id: "r",
    tag: "R",
    key: "r",
    label: "Review on me",
    jql: "status = Review",
    color: "warn",
    notify: { title: "Jira [R] · Review on me", level: "warning" },
  });
  assert.deepEqual(r.counters[1], {
    id: "custom",
    tag: "X",
    key: "z",
    label: "Custom",
    jql: "status = Custom",
    notify: { title: "Jira [X] · Custom", level: "info" },
  });
});

test("parseCounters: parses explicit notify config or notify: false", () => {
  const json = JSON.stringify([
    {
      tag: "A",
      label: "Assigned",
      jql: "assignee = me",
      color: "accent",
      notify: { title: "Custom Assigned", level: "error" },
    },
    { tag: "B", label: "Silent", jql: "status = Done", notify: false },
    { tag: "C", label: "Fallback", jql: "status = Open", color: "ok", notify: { level: "invalid" } },
  ]);
  const r = parseCounters(json);
  assert.equal(
    r.counters[0].notify && typeof r.counters[0].notify === "object" ? r.counters[0].notify.title : "",
    "Custom Assigned",
  );
  assert.equal(
    r.counters[0].notify && typeof r.counters[0].notify === "object" ? r.counters[0].notify.level : "",
    "error",
  );
  assert.equal(r.counters[1].notify, false);
  assert.deepEqual(r.counters[2].notify, { title: "Jira [C] · Fallback", level: "success" });
});

test("parseCounters: supports { counters: [...] } format", () => {
  const json = JSON.stringify({
    counters: [{ tag: "T", label: "Tasks", jql: "assignee = currentUser()" }],
  });
  const r = parseCounters(json);
  assert.equal(r.warning, null);
  assert.equal(r.counters.length, 1);
  assert.equal(r.counters[0].tag, "T");
});

test("parseCounters: skips invalid items and warns", () => {
  const json = JSON.stringify([
    { tag: "R", label: "Valid", jql: "status = 1" },
    { tag: "MissingJql", label: "Invalid" },
    null,
    "string",
  ]);
  const r = parseCounters(json);
  assert.equal(r.counters.length, 1);
  assert.equal(r.counters[0].tag, "R");
  assert.match(r.warning ?? "", /skipped invalid counter items: 1, 2, 3/);
});

test("parseCounters: all items invalid falls back to defaults", () => {
  const json = JSON.stringify([{ bad: "entry" }]);
  const r = parseCounters(json);
  assert.deepEqual(r.counters, DEFAULT_COUNTERS);
  assert.match(r.warning ?? "", /no valid counters found/);
});

test("counterActiveColor: maps colors correctly", () => {
  const t = { ansi3: "#warn", ansi2: "#ok", accent: "#accent", foreground: "#fg" };
  assert.equal(counterActiveColor("warn", t), "#warn");
  assert.equal(counterActiveColor("ok", t), "#ok");
  assert.equal(counterActiveColor("accent", t), "#accent");
  assert.equal(counterActiveColor("unknown", t), "#fg");
  assert.equal(counterActiveColor(undefined, t), "#fg");
});

/** @param {string} key @param {string} summary */
const makeIssue = (key, summary) =>
  /** @type {import("../mod/types.js").Issue} */ ({
    key,
    summary,
    status: "Open",
    assignee: "Me",
    priority: "Medium",
    updated: "",
    created: "",
    reporter: { id: "1", name: "Reporter" },
    type: "Task",
    labels: [],
    links: [],
    parent: "",
  });

test("diffNewCounterIssues: first load records seen keys without toasts", () => {
  /** @type {import("../mod/jira/counterHelpers.js").CounterState[]} */
  const nextCounters = [
    {
      id: "assigned",
      tag: "A",
      key: "a",
      label: "Assigned",
      jql: "assignee = me",
      count: 2,
      issues: [makeIssue("ACME-1", "First issue"), makeIssue("ACME-2", "Second issue")],
      notify: { title: "Jira [A] · Assigned", level: "info" },
    },
  ];
  const { seen, toasts } = diffNewCounterIssues(null, nextCounters);
  assert.deepEqual(toasts, []);
  assert.equal(seen.size, 1);
  assert.ok(seen.get("assigned")?.has("ACME-1"));
  assert.ok(seen.get("assigned")?.has("ACME-2"));
});

test("diffNewCounterIssues: subsequent load with no new issues yields no toasts", () => {
  const prev = new Map([["assigned", new Set(["ACME-1", "ACME-2"])]]);
  /** @type {import("../mod/jira/counterHelpers.js").CounterState[]} */
  const nextCounters = [
    {
      id: "assigned",
      tag: "A",
      key: "a",
      label: "Assigned",
      jql: "assignee = me",
      count: 2,
      issues: [makeIssue("ACME-1", "First issue"), makeIssue("ACME-2", "Second issue")],
      notify: { title: "Jira [A] · Assigned", level: "info" },
    },
  ];
  const { seen, toasts } = diffNewCounterIssues(prev, nextCounters);
  assert.deepEqual(toasts, []);
  assert.equal(seen.get("assigned")?.size, 2);
});

test("diffNewCounterIssues: single new issue generates 1 toast", () => {
  const prev = new Map([["assigned", new Set(["ACME-1"])]]);
  /** @type {import("../mod/jira/counterHelpers.js").CounterState[]} */
  const nextCounters = [
    {
      id: "assigned",
      tag: "A",
      key: "a",
      label: "Assigned",
      jql: "assignee = me",
      count: 2,
      issues: [makeIssue("ACME-1", "Old"), makeIssue("ACME-2", "New issue summary")],
      notify: { title: "Jira [A] · Assigned", level: "info" },
    },
  ];
  const { toasts } = diffNewCounterIssues(prev, nextCounters);
  assert.equal(toasts.length, 1);
  assert.deepEqual(toasts[0], {
    title: "Jira [A] · Assigned",
    body: "ACME-2 · New issue summary",
    level: "info",
  });
});

test("diffNewCounterIssues: multiple new issues (<= 3 and > 3) format correctly", () => {
  const prev = new Map([["review", new Set(["R-0"])]]);
  /** @type {import("../mod/jira/counterHelpers.js").CounterState[]} */
  const counters2 = [
    {
      id: "review",
      tag: "R",
      key: "r",
      label: "Review",
      jql: "review",
      count: 3,
      issues: [makeIssue("R-0", "Old"), makeIssue("R-1", "One"), makeIssue("R-2", "Two")],
      notify: { title: "Jira [R] · Review", level: "warning" },
    },
  ];
  const { toasts: toasts2 } = diffNewCounterIssues(prev, counters2);
  assert.equal(toasts2.length, 1);
  assert.equal(toasts2[0].body, "R-1 One · R-2 Two");

  /** @type {import("../mod/jira/counterHelpers.js").CounterState[]} */
  const counters5 = [
    {
      id: "review",
      tag: "R",
      key: "r",
      label: "Review",
      jql: "review",
      count: 5,
      issues: [
        makeIssue("R-0", "Old"),
        makeIssue("R-1", "One"),
        makeIssue("R-2", "Two"),
        makeIssue("R-3", "Three"),
        makeIssue("R-4", "Four"),
      ],
      notify: { title: "Jira [R] · Review", level: "warning" },
    },
  ];
  const { toasts: toasts5 } = diffNewCounterIssues(prev, counters5);
  assert.equal(toasts5.length, 1);
  assert.equal(toasts5[0].body, "R-1 One · R-2 Two · R-3 Three (+1 more)");
});

test("diffNewCounterIssues: ignores counters with notify: false", () => {
  const prev = new Map([["sandbox", new Set(["S-0"])]]);
  /** @type {import("../mod/jira/counterHelpers.js").CounterState[]} */
  const nextCounters = [
    {
      id: "sandbox",
      tag: "S",
      key: "s",
      label: "Sandbox",
      jql: "sandbox",
      count: 2,
      issues: [makeIssue("S-0", "Old"), makeIssue("S-1", "New")],
      notify: false,
    },
  ];
  const { seen, toasts } = diffNewCounterIssues(prev, nextCounters);
  assert.deepEqual(toasts, []);
  assert.ok(seen.get("sandbox")?.has("S-1"));
});

test("diffNewCounterIssues: newly added counter is recorded without toasting", () => {
  const prev = new Map([["assigned", new Set(["A-1"])]]);
  /** @type {import("../mod/jira/counterHelpers.js").CounterState[]} */
  const nextCounters = [
    {
      id: "assigned",
      tag: "A",
      key: "a",
      label: "Assigned",
      jql: "assigned",
      count: 1,
      issues: [makeIssue("A-1", "Old")],
      notify: { title: "Assigned" },
    },
    {
      id: "review",
      tag: "R",
      key: "r",
      label: "Review",
      jql: "review",
      count: 1,
      issues: [makeIssue("R-1", "Brand new counter issue")],
      notify: { title: "Review" },
    },
  ];
  const { seen, toasts } = diffNewCounterIssues(prev, nextCounters);
  assert.deepEqual(toasts, []);
  assert.ok(seen.get("review")?.has("R-1"));
});
