import { test } from "node:test";
import assert from "node:assert/strict";
import { formatIsoDate, quickDateOptions, parseDateInput } from "../mod/jira/sidePanelEditHelpers.js";
import { parsePinnedFieldConfigs } from "../mod/jira/counterHelpers.js";
import { pinnedFieldsFrom } from "../mod/jira/jiraFormatHelpers.js";

test("formatIsoDate: formats Date as YYYY-MM-DD", () => {
  const d = new Date(2026, 10, 12); // Nov 12, 2026
  assert.equal(formatIsoDate(d), "2026-11-12");
});

test("quickDateOptions: calculates Today, Tomorrow, +2d, and Next Mon", () => {
  // Wednesday, Nov 11, 2026
  const wednesday = new Date(2026, 10, 11);
  const options = quickDateOptions(wednesday);
  assert.deepEqual(options, [
    { label: "Today", value: "2026-11-11" },
    { label: "Tomorrow", value: "2026-11-12" },
    { label: "+2d", value: "2026-11-13" },
    { label: "Next Mon", value: "2026-11-16" },
  ]);

  // Monday, Nov 9, 2026 -> next Monday is 7 days later
  const monday = new Date(2026, 10, 9);
  assert.equal(quickDateOptions(monday)[3].value, "2026-11-16");

  // Sunday, Nov 15, 2026 -> next Monday is tomorrow
  const sunday = new Date(2026, 10, 15);
  assert.equal(quickDateOptions(sunday)[3].value, "2026-11-16");
});

test("parseDateInput: parses ISO YYYY-MM-DD", () => {
  assert.equal(parseDateInput("2026-11-12"), "2026-11-12");
  assert.equal(parseDateInput("2025-01-05"), "2025-01-05");
});

test("parseDateInput: parses DD.MM and DD/MM with baseDate year", () => {
  const base = new Date(2026, 10, 10);
  assert.equal(parseDateInput("12.11", base), "2026-11-12");
  assert.equal(parseDateInput("5/4", base), "2026-04-05");
  assert.equal(parseDateInput("01-01", base), "2026-01-01");
});

test("parseDateInput: parses full DD.MM.YYYY, DD-MM-YYYY, and DD/MM/YYYY", () => {
  assert.equal(parseDateInput("12.11.2027"), "2027-11-12");
  assert.equal(parseDateInput("31-12-2025"), "2025-12-31");
  assert.equal(parseDateInput("05/04/2026"), "2026-04-05");
});

test("parseDateInput: rejects empty, invalid strings and impossible dates", () => {
  assert.equal(parseDateInput(null), null);
  assert.equal(parseDateInput(""), null);
  assert.equal(parseDateInput("   "), null);
  assert.equal(parseDateInput("not-a-date"), null);
  assert.equal(parseDateInput("99.99"), null);
  assert.equal(parseDateInput("32.01.2026"), null);
  assert.equal(parseDateInput("2026-13-40"), null);
});

test("parsePinnedFieldConfigs: parses pinned fields from JSON", () => {
  assert.deepEqual(parsePinnedFieldConfigs(null), []);
  assert.deepEqual(parsePinnedFieldConfigs(""), []);
  assert.deepEqual(parsePinnedFieldConfigs("{ bad json"), []);
  assert.deepEqual(parsePinnedFieldConfigs(JSON.stringify({ counters: [] })), []);

  const json = JSON.stringify({
    fields: [
      { name: "Due date Code review", type: "date" },
      { id: "customfield_10044", name: "Reviewer notes", type: "text" },
      { name: "" }, // invalid: empty name
      null, // invalid
    ],
  });
  assert.deepEqual(parsePinnedFieldConfigs(json), [
    { name: "Due date Code review", type: "date" },
    { id: "customfield_10044", name: "Reviewer notes", type: "text" },
  ]);
});

test("pinnedFieldsFrom: extracts and matches configured fields from Jira", () => {
  const fields = {
    customfield_10043: "2026-11-12",
    customfield_10044: "Needs extra verification",
  };
  const names = {
    customfield_10043: "Due date Code review",
    customfield_10044: "Reviewer Notes",
  };
  const configs = [
    { name: "due date code review", type: /** @type {const} */ ("date") },
    { id: "customfield_10044", name: "Reviewer Notes", type: /** @type {const} */ ("text") },
  ];

  const res = pinnedFieldsFrom(fields, names, configs);
  assert.deepEqual(res, [
    { id: "customfield_10043", name: "Due date Code review", value: "2026-11-12", type: "date" },
    { id: "customfield_10044", name: "Reviewer Notes", value: "Needs extra verification", type: "text" },
  ]);
});

test("pinnedFieldsFrom: handles empty raw values and missing fields", () => {
  const fields = { customfield_10043: null };
  const names = { customfield_10043: "Due date Code review" };
  const configs = [{ name: "Due date Code review", type: /** @type {const} */ ("date") }];
  const res = pinnedFieldsFrom(fields, names, configs);
  assert.deepEqual(res, [{ id: "customfield_10043", name: "Due date Code review", value: "", type: "date" }]);

  assert.deepEqual(pinnedFieldsFrom({}, {}, []), []);
});
