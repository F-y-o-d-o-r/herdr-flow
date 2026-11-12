import { test } from "node:test";
import assert from "node:assert/strict";
import { planRestoration } from "../mod/botSessionHelpers.js";

test("planRestoration: prioritizes pane+cwd match, tab+cwd, then cwd only", () => {
  /** @type {import("../mod/types.js").BotSession[]} */
  const saved = [
    {
      pane: "p1",
      tab: "tab1",
      tab_name: "T1",
      space: "s1",
      space_name: "S1",
      cwd: "/code/alpha",
      app: "claude-code",
      command: "claude",
    },
    {
      pane: "p2",
      tab: "tab2",
      tab_name: "T2",
      space: "s1",
      space_name: "S1",
      cwd: "/code/beta",
      app: "pi",
      command: "pi",
    },
    {
      pane: "p3",
      tab: "tab3",
      tab_name: "T3",
      space: "s1",
      space_name: "S1",
      cwd: "/code/gamma",
      app: "codex",
      command: "codex",
    },
  ];

  const currentPanes = [
    // Candidate 1: matches p1 + cwd exactly (Priority 1)
    {
      pane: "p1",
      terminal: "term-1",
      tab: "tab1",
      title: "zsh",
      cwd: "/code/alpha",
      branch: null,
      status: null,
      app: null,
      program: { key: "zsh", name: "zsh", icon: null, tint: false, tile: null, color: null, shell: true, agent: false },
      focused: true,
      zoomed: false,
      movable: true,
    },
    // Candidate 2: different pane (p9), but same tab (tab2) + cwd (Priority 2)
    {
      pane: "p9",
      terminal: "term-9",
      tab: "tab2",
      title: "zsh",
      cwd: "/code/beta",
      branch: null,
      status: null,
      app: null,
      program: { key: "zsh", name: "zsh", icon: null, tint: false, tile: null, color: null, shell: true, agent: false },
      focused: false,
      zoomed: false,
      movable: true,
    },
    // Candidate 3: different pane (p8), different tab (tab8), but matching cwd (Priority 3)
    {
      pane: "p8",
      terminal: "term-8",
      tab: "tab8",
      title: "zsh",
      cwd: "/code/gamma",
      branch: null,
      status: null,
      app: null,
      program: { key: "zsh", name: "zsh", icon: null, tint: false, tile: null, color: null, shell: true, agent: false },
      focused: false,
      zoomed: false,
      movable: true,
    },
  ];

  const plan = planRestoration(saved, currentPanes, []);
  assert.equal(plan.length, 3);
  assert.deepEqual(plan[0], {
    pane: "p1",
    terminal: "term-1",
    cwd: "/code/alpha",
    command: "claude",
    app: "claude-code",
  });
  assert.deepEqual(plan[1], {
    pane: "p9",
    terminal: "term-9",
    cwd: "/code/beta",
    command: "pi",
    app: "pi",
  });
  assert.deepEqual(plan[2], {
    pane: "p8",
    terminal: "term-8",
    cwd: "/code/gamma",
    command: "codex",
    app: "codex",
  });
});

test("planRestoration: skips active agents, non-terminals, and avoids duplicates", () => {
  /** @type {import("../mod/types.js").BotSession[]} */
  const saved = [
    {
      pane: "p1",
      tab: "tab1",
      tab_name: "T1",
      space: "s1",
      space_name: "S1",
      cwd: "/code/alpha",
      app: "claude-code",
      command: "claude",
    },
    {
      pane: "p2",
      tab: "tab1",
      tab_name: "T1",
      space: "s1",
      space_name: "S1",
      cwd: "/code/alpha",
      app: "pi",
      command: "pi",
    },
  ];

  const currentPanes = [
    // Already running an active agent (status is working)
    {
      pane: "p1",
      terminal: "term-1",
      tab: "tab1",
      title: "claude",
      cwd: "/code/alpha",
      branch: null,
      status: /** @type {const} */ ("working"),
      app: "claude-code",
      program: {
        key: "claude",
        name: "Claude",
        icon: null,
        tint: false,
        tile: null,
        color: null,
        shell: false,
        agent: true,
      },
      focused: false,
      zoomed: false,
      movable: true,
    },
    // Mod pane (terminal is null)
    {
      pane: "p-mod",
      terminal: null,
      mod: "jira",
      tab: "tab1",
      title: "Jira",
      cwd: "/code/alpha",
      branch: null,
      status: null,
      app: null,
      program: {
        key: "mod",
        name: "mod",
        icon: null,
        tint: false,
        tile: null,
        color: null,
        shell: false,
        agent: false,
      },
      focused: false,
      zoomed: false,
      movable: true,
    },
    // Only one eligible candidate terminal for cwd /code/alpha
    {
      pane: "p-free",
      terminal: "term-free",
      tab: "tab1",
      title: "zsh",
      cwd: "/code/alpha",
      branch: null,
      status: null,
      app: null,
      program: { key: "zsh", name: "zsh", icon: null, tint: false, tile: null, color: null, shell: true, agent: false },
      focused: false,
      zoomed: false,
      movable: true,
    },
  ];

  const currentAgents = [
    {
      address: "term-1",
      pane: "p1",
      space: "s1",
      space_name: "S1",
      tab: "tab1",
      tab_index: 1,
      tab_name: "T1",
      status: /** @type {const} */ ("working"),
      app: "claude-code",
      program: {
        key: "claude",
        name: "Claude",
        icon: null,
        tint: false,
        tile: null,
        color: null,
        shell: false,
        agent: true,
      },
      title: "claude",
      seq: 1,
      pinned: false,
      focused: false,
    },
  ];

  // Candidate term-free should only be assigned once to the first session that matches it
  const plan = planRestoration(saved, currentPanes, currentAgents);
  assert.equal(plan.length, 1);
  assert.equal(plan[0].terminal, "term-free");
});
