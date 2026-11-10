import { test } from "node:test";
import assert from "node:assert/strict";
import {
  adfText,
  agentPrompt,
  checklistFrom,
  defaultProject,
  issueLinks,
  issueRow,
  issueTypeMeta,
  priorityMeta,
  statusColorKey,
} from "../mod/jira/jiraFormatHelpers.js";

test("adfText: paragraph, bullet list, code block", () => {
  const doc = {
    type: "doc",
    content: [
      { type: "paragraph", content: [{ type: "text", text: "Hello" }] },
      {
        type: "bulletList",
        content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "one" }] }] }],
      },
      { type: "codeBlock", content: [{ type: "text", text: "x = 1" }] },
    ],
  };
  const text = adfText(doc);
  assert.match(text, /Hello/);
  assert.match(text, /- one/);
  assert.match(text, /```\nx = 1\n```/);
});

test("issueLinks: outward, inward and subtasks", () => {
  const links = issueLinks({
    issuelinks: [
      {
        type: { outward: "blocks", inward: "is blocked by" },
        outwardIssue: { key: "AB-2", fields: { summary: "s2", status: { name: "Open" } } },
      },
      {
        type: { outward: "blocks", inward: "is blocked by" },
        inwardIssue: { key: "AB-3", fields: { summary: "s3", status: { name: "Done" } } },
      },
    ],
    subtasks: [{ key: "AB-4", fields: { summary: "s4", status: { name: "Open" } } }],
  });
  assert.deepEqual(
    links.map((l) => `${l.how} ${l.key}`),
    ["blocks AB-2", "is blocked by AB-3", "subtask AB-4"],
  );
});

test("issueRow: sprint from the named field, labels and components together", () => {
  const row = issueRow(
    {
      key: "AB-1",
      fields: { summary: "S", labels: ["front"], components: [{ name: "Web" }], cf_9: [{ name: "Sprint 7" }] },
    },
    { sprintField: "cf_9" },
  );
  assert.equal(row.sprint, "Sprint 7");
  assert.deepEqual(row.labels, ["front", "Web"]);
  assert.equal(row.assignee, "unassigned");
});

test("checklistFrom: progress and the items line", () => {
  const c = checklistFrom({ hasItems: true, progressText: "Checklist: 0/1", items: "update", uncheckedItems: 1 });
  assert.equal(c.progress, "Checklist: 0/1");
  assert.equal(c.summary, "update");
  assert.equal(c.done, false);
  assert.equal(checklistFrom({ hasItems: false }), null);
  assert.equal(checklistFrom(undefined), null);
});

test("defaultProject: current branch first, else the most common project", () => {
  assert.equal(defaultProject({ currentKey: "XY-9", issues: [{ key: "AB-1" }] }), "XY");
  assert.equal(defaultProject({ currentKey: null, issues: [{ key: "AB-1" }, { key: "AB-2" }, { key: "CD-3" }] }), "AB");
  assert.equal(defaultProject({ currentKey: null, issues: [] }), null);
});

test("agentPrompt: universal instructions, no personal names", () => {
  const text = agentPrompt({
    key: "AB-1",
    summary: "Fix",
    status: "Open",
    url: "https://x/browse/AB-1",
    description: "d",
  });
  assert.match(text, /AB-1: Fix/);
  assert.match(text, /AGENTS\.md/);
  assert.doesNotMatch(text, /\/Users\/|~\//); // no machine paths in the prompt
});

test("priorityMeta: maps priorities to icons and colors", () => {
  assert.deepEqual(priorityMeta("Highest"), { icon: "⇈", colorKey: "ansi1" });
  assert.deepEqual(priorityMeta("Blocker"), { icon: "⇈", colorKey: "ansi1" });
  assert.deepEqual(priorityMeta("Critical"), { icon: "⇈", colorKey: "ansi1" });
  assert.deepEqual(priorityMeta("High"), { icon: "↑", colorKey: "ansi1" });
  assert.deepEqual(priorityMeta("Medium"), { icon: "=", colorKey: "ansi3" });
  assert.deepEqual(priorityMeta("Low"), { icon: "↓", colorKey: "ansi4" });
  assert.deepEqual(priorityMeta("Lowest"), { icon: "⇊", colorKey: "muted" });
  assert.equal(priorityMeta(undefined), null);
});

test("issueTypeMeta: maps issue types to symbols and colors", () => {
  assert.deepEqual(issueTypeMeta("Bug"), { icon: "●", colorKey: "ansi1" });
  assert.deepEqual(issueTypeMeta("Баг"), { icon: "●", colorKey: "ansi1" });
  assert.deepEqual(issueTypeMeta("User Story"), { icon: "◈", colorKey: "ansi2" });
  assert.deepEqual(issueTypeMeta("История"), { icon: "◈", colorKey: "ansi2" });
  assert.deepEqual(issueTypeMeta("Epic"), { icon: "⚡", colorKey: "ansi5" });
  assert.deepEqual(issueTypeMeta("Task"), { icon: "✓", colorKey: "ansi4" });
  assert.deepEqual(issueTypeMeta("Sub-task"), { icon: "✓", colorKey: "ansi4" });
  assert.equal(issueTypeMeta(undefined), null);
});

test("statusColorKey: maps status texts to color tokens", () => {
  assert.equal(statusColorKey("Paused"), "ansi1");
  assert.equal(statusColorKey("Reject"), "ansi1");
  assert.equal(statusColorKey("Blocked"), "ansi1");
  assert.equal(statusColorKey("Code Review"), "ansi3");
  assert.equal(statusColorKey("QA"), "ansi3");
  assert.equal(statusColorKey("In Progress"), "accent");
  assert.equal(statusColorKey("В работе"), "accent");
  assert.equal(statusColorKey("Done"), "ansi2");
  assert.equal(statusColorKey("Ready to prod"), "ansi2");
  assert.equal(statusColorKey("Open"), "ansi4");
  assert.equal(statusColorKey("Открыто"), "ansi4");
  assert.equal(statusColorKey("To Do"), "ansi4");
  assert.equal(statusColorKey(undefined), "foreground");
});
