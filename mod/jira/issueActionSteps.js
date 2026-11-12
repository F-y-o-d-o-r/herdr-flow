// What the Jira card's keys do. Each function works on the screen (`s`) and its source (`s.jira`):
// it sets s.busy while loading, then moves to the next step or closes.
import { agents, exec, hc, knownAgents, notify, run, setShared, spaces } from "herdr";
import { workFolder } from "../folderHelpers.js";
import { agentPrompt } from "./jiraFormatHelpers.js";
import { refreshBarCounters } from "./counterBarView.js";
import { pasteContextToAgent } from "./agentDraftHelpers.js";

/** @typedef {import("../types.js").Cx} Cx */
/** @typedef {import("../types.js").Person} Person */
/** @typedef {import("./jiraDataSource.js").Transition} Transition */
/** @typedef {import("./jiraScreen.js").JiraScreen} JiraScreen */
/** @typedef {import("./jiraScreen.js").Suggestion} Suggestion */
/** @typedef {Awaited<ReturnType<typeof knownAgents>>[number]} KnownAgent */

export const PANEL = { block: "jira-view", key: "herdrFlow.jiraKey" };

/**
 * Runs `work` with a busy line; shows its error on the screen.
 * @param {JiraScreen} s
 * @param {Cx} cx
 * @param {string} busy
 * @param {() => Promise<unknown>} work
 */
async function step(s, cx, busy, work) {
  s.busy = busy;
  cx.notify();
  try {
    await work();
  } catch (e) {
    s.error = e instanceof Error ? e.message : String(e);
  }
  s.busy = null;
  cx.notify();
}

/**
 * Pastes issue context into the active agent's input line without submitting (no Enter).
 * @param {JiraScreen} s
 * @param {Cx} cx
 */
export function addContext(s, cx) {
  step(s, cx, `Adding ${s.picked.key} context…`, async () => {
    if (s.jira.demo) return s.close();
    const full =
      s.picked.description !== undefined
        ? s.picked
        : { ...s.picked, ...(await s.jira.issue(s.picked.key).catch(() => ({}))) };
    const task = agentPrompt(full);
    const target = s.here ?? agents().find((a) => a.focused) ?? agents()[0] ?? null;
    await pasteContextToAgent({
      target,
      text: task,
      key: s.picked.key,
      name: target?.program?.name ?? target?.app ?? null,
    });
    s.close();
  });
}

/**
 * @param {JiraScreen} s
 * @param {Cx} cx
 */
export function openInBrowser(s, cx) {
  step(s, cx, "Opening…", async () => {
    const url = s.jira.browseUrl(s.picked.key);
    if (url) await exec("open", [url]).catch(() => null);
    s.close();
  });
}

/** @param {JiraScreen} s */
export function openInPanel(s) {
  setShared(PANEL.key, s.picked.key);
  run("layout.show", { id: PANEL.block });
  s.close();
}

/**
 * @param {JiraScreen} s
 * @param {Cx} cx
 */
export function loadTransitions(s, cx) {
  step(s, cx, `Loading ${s.picked.key} statuses…`, async () => {
    const list = await s.jira.transitions(s.picked.key);
    s.options = list.map((t) => ({
      label: t.name,
      hint: t.name === t.to ? "" : `→ ${t.to}`,
      act: (cx) => move(s, cx, t),
    }));
    s.optionsTitle = "new status";
    s.go("options", cx);
    if (!list.length) s.error = "No transitions available";
  });
}

/**
 * @param {JiraScreen} s
 * @param {Cx} cx
 * @param {Transition} t
 */
function move(s, cx, t) {
  const key = s.picked.key;
  step(s, cx, `${key} → ${t.to}…`, async () => {
    await s.jira.transition(key, t.id);
    if (!s.jira.demo) notify({ title: "Jira", body: `${key} → ${t.to}`, level: "info" });
    refreshBarCounters();
    s.afterMove = true;
    await loadPeople(s, cx, `${key} → ${t.to} ✓ · reassign?`);
  });
}

/**
 * Assign step suggestions: who handed the issue over (history) first, then the reporter.
 * @param {JiraScreen} s
 * @param {Cx} cx
 * @param {string | null} [note]
 */
async function loadPeople(s, cx, note = null) {
  /** @type {Person | null} */
  const from = await s.jira.handedBy(s.picked.key).catch(() => null);
  const seen = new Set([s.picked.assigneeId]);
  /** @type {Suggestion[]} */
  const suggested = [];
  /**
   * @param {Person | null} p
   * @param {string} hint
   */
  const add = (p, hint) => {
    if (!p?.id || seen.has(p.id)) return;
    seen.add(p.id);
    suggested.push({ ...p, hint });
  };
  add(from, "gave it to you");
  add(s.picked.reporter, "reporter");
  Object.assign(s, { suggested, found: [], note });
  s.go("assign", cx);
}

/**
 * @param {JiraScreen} s
 * @param {Cx} cx
 */
export function toAssign(s, cx) {
  s.afterMove = false;
  step(s, cx, `Loading ${s.picked.key} people…`, () => loadPeople(s, cx));
}

/**
 * People search as the filter changes; only the newest answer is kept.
 * @param {JiraScreen} s
 * @param {Cx} cx
 */
export function searchPeople(s, cx) {
  const q = s.filter.trim();
  if (q.length < 2) {
    s.found = [];
    return;
  }
  cx.spawn(async (cx) => {
    /** @type {Person[]} */
    const list = await s.jira.assignable(s.picked.key, q).catch(() => []);
    if (s.filter.trim() !== q) return;
    Object.assign(s, { found: list, at: 0 });
    cx.notify();
  });
}

/**
 * @param {JiraScreen} s
 * @param {Cx} cx
 * @param {Person} p
 */
export function reassign(s, cx, p) {
  const key = s.picked.key;
  step(s, cx, `${key} → ${p.name}…`, async () => {
    await s.jira.assign(key, p.id);
    if (!s.jira.demo) notify({ title: "Jira", body: `${key} assigned to ${p.name}`, level: "info" });
    refreshBarCounters();
    s.close();
  });
}

/**
 * @param {JiraScreen} s
 * @param {Cx} cx
 */
export function loadAgents(s, cx) {
  step(s, cx, `Loading ${s.picked.key}…`, async () => {
    s.picked = { ...s.picked, ...(await s.jira.issue(s.picked.key)) };
    /** @type {import("../types.js").Row[]} */
    const out = [];
    if (s.here) {
      const name = s.here.program?.name ?? s.here.app;
      out.push({
        label: `Current pane · ${name}`,
        hint: "send the task to this agent",
        act: (cx) => take(s, cx, null),
      });
    }
    const known = await knownAgents().catch(() => []);
    for (const a of known.filter((k) => k.installed && k.agent)) {
      out.push({ label: `New tab · ${a.name}`, hint: "in the work folder", act: (cx) => take(s, cx, a) });
    }
    Object.assign(s, { options: out, optionsTitle: "agent" });
    s.go("options", cx);
  });
}

/**
 * Where a new agent works: the focused folder's repos, the last remembered one, else the space's folder.
 * @param {JiraScreen} s
 * @returns {Promise<string | null>}
 */
async function takeFolder(s) {
  return (await workFolder(s.focusedAtOpen)) ?? spaces().find((x) => x.active)?.folder ?? null;
}

/**
 * agent null = send to the agent in the focused pane.
 * @param {JiraScreen} s
 * @param {Cx} cx
 * @param {KnownAgent | null} agent
 */
function take(s, cx, agent) {
  const task = agentPrompt(s.picked);
  step(s, cx, `Starting ${s.picked.key}…`, async () => {
    if (s.jira.demo) return s.close();
    const folder = await takeFolder(s);
    if (agent) run("tab.new", { name: s.picked.key, argv: agent.run, task, ...(folder ? { folder } : {}) });
    else {
      const r = await hc(["send", s.here.address, task]);
      if (r.code !== 0) throw new Error(r.stderr?.trim() || "hc send failed");
    }
    s.close();
  });
}
