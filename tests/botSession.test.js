import { test } from "node:test";
import assert from "node:assert/strict";
import { isSnapshotEqual, resolveAgentCommand, snapshotAgents } from "../mod/botSessionHelpers.js";

/**
 * @param {string} address
 * @param {string} pane
 * @param {string} app
 * @param {"working" | "idle"} [status]
 */
const mockAgent = (address, pane, app, status = "working") => ({
  address,
  pane,
  space: "s1",
  space_name: "Dev",
  tab: "tab1",
  tab_index: 1,
  tab_name: "Main",
  status: /** @type {const} */ (status),
  app,
  program: { key: app, name: app, icon: null, tint: false, tile: null, color: null, shell: false, agent: true },
  title: app,
  seq: 1,
  pinned: false,
  focused: false,
});

/**
 * @param {string} pane
 * @param {string | null} terminal
 * @param {string | null} cwd
 * @param {"working" | "idle" | null} [status]
 * @param {string | null} [app]
 */
const mockPane = (pane, terminal, cwd, status = "working", app = "agent") => ({
  pane,
  terminal,
  tab: "tab1",
  title: app ?? "shell",
  cwd,
  branch: "main",
  status: status ? /** @type {const} */ (status) : null,
  app,
  program: {
    key: app ?? "zsh",
    name: app ?? "zsh",
    icon: null,
    tint: false,
    tile: null,
    color: null,
    shell: !status,
    agent: Boolean(status),
  },
  focused: false,
  zoomed: false,
  movable: true,
});

test("resolveAgentCommand: finds match in knownList by key, name, or app", () => {
  const known = [
    { key: "claude", name: "Claude Code", run: ["claude", "--resume"], installed: true, agent: true },
    { key: "antigravity", name: "Antigravity", run: ["antigravity", "--agent"], installed: true, agent: true },
    { key: "pi", name: "Pi", run: ["pi", "-m"], installed: true, agent: true },
  ];

  assert.equal(resolveAgentCommand("claude-code", "claude", "Claude Code", known), "claude --resume");
  assert.equal(resolveAgentCommand(null, "other", "Claude Code", known), "claude --resume");
  assert.equal(resolveAgentCommand("antigravity", "unknown", "Unknown", known), "antigravity --agent");
  const emptyRun = [{ key: "claude", name: "Claude Code", run: [], installed: true, agent: true }];
  assert.equal(resolveAgentCommand("claude-code", "claude", "Claude Code", emptyRun), "claude");
});

test("resolveAgentCommand: standard agent fallbacks", () => {
  assert.equal(resolveAgentCommand("claude-code", "agent", "Claude Code", null), "claude");
  assert.equal(resolveAgentCommand("antigravity-cli", "agent", "Antigravity", []), "antigravity");
  assert.equal(resolveAgentCommand("codex", "agent", "Codex", null), "codex");
  assert.equal(resolveAgentCommand("gemini-cli", "gemini", "Gemini", null), "gemini");
  assert.equal(resolveAgentCommand("pi", "pi", "Pi", null), "pi");
});

test("resolveAgentCommand: generic fallbacks and null handling", () => {
  assert.equal(resolveAgentCommand("my-bot", "agent", "My Custom Bot", null), "my-bot");
  assert.equal(resolveAgentCommand(null, "custom-key", "Custom", null), "custom-key");
  assert.equal(resolveAgentCommand(null, null, "Other", null), "agent");
  assert.equal(resolveAgentCommand(null, null, null, null), "agent");
});

test("snapshotAgents: snapshots valid agents with cwd from panes", () => {
  const agentsList = [mockAgent("t1", "p1", "claude-code", "working"), mockAgent("t2", "p2", "antigravity", "idle")];
  const panesList = [
    mockPane("p1", "t1", "/Users/dev/project-a", "working", "claude-code"),
    mockPane("p2", "t2", "/Users/dev/project-b", "idle", "antigravity"),
  ];

  const snapshot = snapshotAgents(agentsList, panesList, null);
  assert.equal(snapshot.length, 2);
  assert.deepEqual(snapshot[0], {
    pane: "p1",
    tab: "tab1",
    tab_name: "Main",
    space: "s1",
    space_name: "Dev",
    cwd: "/Users/dev/project-a",
    app: "claude-code",
    command: "claude",
  });
  assert.deepEqual(snapshot[1], {
    pane: "p2",
    tab: "tab1",
    tab_name: "Main",
    space: "s1",
    space_name: "Dev",
    cwd: "/Users/dev/project-b",
    app: "antigravity",
    command: "antigravity",
  });
});

test("snapshotAgents: skips agents without cwd, without pane, or with empty lists", () => {
  const agentsList = [mockAgent("t1", "p1", "claude"), mockAgent("t2", "p2", "claude")];
  const panesList = [mockPane("p1", "t1", null, "working", "claude")];

  assert.equal(snapshotAgents(agentsList, panesList, null).length, 0);
  assert.equal(snapshotAgents([], panesList, null).length, 0);
  assert.equal(snapshotAgents(agentsList, [], null).length, 0);
  assert.equal(snapshotAgents(null, null, null).length, 0);
});

test("isSnapshotEqual: compares snapshot lists correctly", () => {
  /** @type {import("../mod/types.js").BotSession[]} */
  const s1 = [
    {
      pane: "p1",
      tab: "t1",
      tab_name: "T1",
      space: "s1",
      space_name: "S1",
      cwd: "/Users/dev/a",
      app: "claude-code",
      command: "claude",
    },
    {
      pane: "p2",
      tab: "t2",
      tab_name: "T2",
      space: "s1",
      space_name: "S1",
      cwd: "/Users/dev/b",
      app: "pi",
      command: "pi",
    },
  ];
  /** @type {import("../mod/types.js").BotSession[]} */
  const s2 = [
    {
      pane: "p2",
      tab: "t2",
      tab_name: "T2",
      space: "s1",
      space_name: "S1",
      cwd: "/Users/dev/b/",
      app: "pi",
      command: "pi",
    },
    {
      pane: "p1",
      tab: "t1",
      tab_name: "T1",
      space: "s1",
      space_name: "S1",
      cwd: "/Users/dev/a",
      app: "claude-code",
      command: "claude",
    },
  ];
  /** @type {import("../mod/types.js").BotSession[]} */
  const s3 = [
    {
      pane: "p1",
      tab: "t1",
      tab_name: "T1",
      space: "s1",
      space_name: "S1",
      cwd: "/Users/dev/a",
      app: "claude-code",
      command: "claude --diff",
    },
  ];

  assert.equal(isSnapshotEqual(s1, s2), true);
  assert.equal(isSnapshotEqual(s1, s3), false);
  assert.equal(isSnapshotEqual([], []), true);
  assert.equal(isSnapshotEqual(null, []), false);
  assert.equal(isSnapshotEqual([], null), false);
});
