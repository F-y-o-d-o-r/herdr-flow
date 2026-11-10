// Actions and keyboard handling for Jira side panel inline editing.
import { agents, hc, knownAgents, notify, run, spaces } from "herdr";
import { latin } from "../pickerKeyHelpers.js";
import { workFolder } from "../folderHelpers.js";
import { agentPrompt } from "./jiraFormatHelpers.js";
import { refreshBarCounters } from "./counterBarView.js";
import { parseDateInput } from "./sidePanelDateHelpers.js";

export { formatIsoDate, quickDateOptions, parseDateInput } from "./sidePanelDateHelpers.js";
export { detailsRows, inlineEditorView, issueBody, issueTopBadges } from "./sidePanelEditUiHelpers.js";

/** @typedef {import("../types.js").Cx} Cx */
/** @typedef {import("../types.js").Person} Person */
/** @typedef {import("../types.js").PinnedField} PinnedField */
/** @typedef {import("../types.js").KeyEvent} KeyEvent */
/** @typedef {import("./sidePanelView.js").PanelView} PanelView */
/** @typedef {import("./jiraDataSource.js").Transition} Transition */
/** @typedef {{ label: string, hint?: string, agent?: any, address?: string, name?: string }} AgentOption */

/** @param {PanelView} p @param {Cx} cx */
export const closeEditor = (p, cx) => (Object.assign(p, { editMode: null, editQuery: "", editIndex: 0 }), cx.notify());

/** @param {PanelView} p @param {string} mode @param {Cx} cx */
export function openEditor(p, mode, cx) {
  Object.assign(p, { editMode: mode, editQuery: "", editIndex: 0 });
  if (mode === "status") {
    Object.assign(p, { transitions: [], transitionsLoading: true });
    cx.spawn(async (cx) => {
      p.transitions = (await p.jira?.transitions(p.key ?? "").catch(() => [])) ?? [];
      p.transitionsLoading = false;
      cx.notify();
    });
  } else if (mode === "context") {
    Object.assign(p, { agentOptions: [], agentLoading: true });
    cx.spawn(async (cx) => {
      const live = agents()[0];
      const liveOpt = live
        ? [
            {
              label: `Current pane · ${live.program?.name ?? live.app ?? "agent"}`,
              hint: "send task to active agent",
              address: live.address,
              name: live.program?.name ?? live.app ?? "agent",
            },
          ]
        : [];
      const known = (await knownAgents().catch(() => [])).filter((k) => k.installed && k.agent);
      p.agentOptions = [
        ...liveOpt,
        ...known.map((a) => ({ label: `New tab · ${a.name}`, hint: "start new agent tab", agent: a })),
      ];
      p.agentLoading = false;
      cx.notify();
    });
  } else if (mode === "assignee") {
    Object.assign(p, { handedByPerson: null, peopleFound: [], peopleLoading: false });
    cx.spawn(async (cx) => {
      p.handedByPerson = (await p.jira?.handedBy(p.key ?? "").catch(() => null)) ?? null;
      cx.notify();
    });
  } else if (mode.startsWith("field:")) {
    p.editQuery = p.data?.pinnedFields?.find((x) => x.id === mode.slice(6))?.value ?? "";
  }
  cx.notify();
}

/**
 * @param {PanelView} p
 * @param {Cx} cx
 * @param {string} body
 * @param {() => Promise<unknown>} work
 */
function runStep(p, cx, body, work) {
  cx.spawn(async (cx) => {
    await work().catch(() => null);
    if (!p.jira?.demo) notify({ title: "Jira", body, level: "info" });
    refreshBarCounters();
    closeEditor(p, cx);
  });
}

/** @param {PanelView} p @param {Transition} tr @param {Cx} cx */
export const applyTransition = (p, tr, cx) =>
  p.key &&
  runStep(p, cx, `${p.key} → ${tr.to}`, async () => {
    await p.jira?.transition(p.key ?? "", tr.id);
    if (p.data) p.data = { ...p.data, status: tr.to };
  });

/** @param {PanelView} p @param {Person} person @param {Cx} cx */
export const applyAssign = (p, person, cx) =>
  p.key &&
  runStep(p, cx, `${p.key} assigned to ${person.name}`, async () => {
    await p.jira?.assign(p.key ?? "", person.id);
    if (p.data) p.data = { ...p.data, assignee: person.name, assigneeId: person.id };
  });

/** @param {PanelView} p @param {PinnedField} field @param {string | null} val @param {Cx} cx */
export const applyField = (p, field, val, cx) =>
  p.key &&
  field &&
  runStep(p, cx, `${p.key} · ${field.name} updated`, async () => {
    await p.jira?.updateField(p.key ?? "", field.id, val);
    if (p.data) {
      const list = (p.data.pinnedFields ?? []).map((f) => (f.id === field.id ? { ...f, value: val ?? "" } : f));
      p.data = { ...p.data, pinnedFields: list };
    }
  });

/** @param {PanelView} p @param {AgentOption} opt @param {Cx} cx */
export function sendToAgent(p, opt, cx) {
  if (!p.data) return;
  const task = agentPrompt(p.data);
  const key = p.key ?? p.data.key;
  cx.spawn(async (cx) => {
    if (opt.address) {
      const r = await hc(["send", opt.address, task]);
      if (r.code !== 0) throw new Error(r.stderr?.trim() || "hc send failed");
      notify({ title: "Jira", body: `Sent ${key} to ${opt.name}`, level: "info" });
    } else if (opt.agent) {
      const folder = (await workFolder(null)) ?? spaces().find((x) => x.active)?.folder ?? null;
      run("tab.new", { name: key, argv: opt.agent.run, task, ...(folder ? { folder } : {}) });
      notify({ title: "Jira", body: `Started ${opt.agent.name} for ${key}`, level: "info" });
    }
    closeEditor(p, cx);
  });
}

/** @param {PanelView} p @param {string} q @param {Cx} cx */
function searchPeople(p, q, cx) {
  if (!q.trim()) return Object.assign(p, { peopleFound: [], peopleLoading: false });
  p.peopleLoading = true;
  cx.notify();
  cx.spawn(async (cx) => {
    p.peopleFound = (await p.jira?.assignable(p.key ?? "", q).catch(() => [])) ?? [];
    p.peopleLoading = false;
    cx.notify();
  });
}

/** @param {PanelView} p @param {KeyEvent} e @param {Cx} cx */
export function onEditKey(p, e, cx) {
  if (e.key === "escape") return (closeEditor(p, cx), true);
  if (p.editMode === "status" || p.editMode === "context") {
    const list = p.editMode === "status" ? p.transitions : p.agentOptions;
    if (e.key === "enter" && list[p.editIndex]) {
      p.editMode === "status"
        ? applyTransition(p, p.transitions[p.editIndex], cx)
        : sendToAgent(p, p.agentOptions[p.editIndex], cx);
    } else if (e.key === "up") p.editIndex = Math.max(0, p.editIndex - 1);
    else if (e.key === "down") p.editIndex = Math.min(Math.max(0, list.length - 1), p.editIndex + 1);
    else return false;
    return (cx.notify(), true);
  }
  if (p.editMode === "assignee") {
    if (e.key === "backspace") {
      p.editQuery = p.editQuery.slice(0, -1);
      searchPeople(p, p.editQuery, cx);
    } else if (e.key === "enter") {
      const person = p.peopleFound[0] ?? p.handedByPerson ?? p.data?.reporter;
      if (person) applyAssign(p, person, cx);
    } else if (
      !e.modifiers?.control &&
      !e.modifiers?.alt &&
      !e.modifiers?.platform &&
      e.key_char &&
      latin(e.key_char) >= " "
    ) {
      p.editQuery += latin(e.key_char);
      searchPeople(p, p.editQuery, cx);
    } else return false;
    return (cx.notify(), true);
  }
  if (p.editMode?.startsWith("field:")) {
    const f = p.data?.pinnedFields?.find((x) => x.id === p.editMode?.slice(6));
    if (e.key === "enter" && f) {
      const parsed = parseDateInput(p.editQuery);
      if (parsed) applyField(p, f, parsed, cx);
      else if (!p.editQuery.trim()) applyField(p, f, null, cx);
    } else if (e.key === "backspace") {
      p.editQuery = p.editQuery.slice(0, -1);
      cx.notify();
    } else if (
      !e.modifiers?.control &&
      !e.modifiers?.alt &&
      !e.modifiers?.platform &&
      e.key_char &&
      /^[0-9./-]$/.test(e.key_char)
    ) {
      p.editQuery += e.key_char;
      cx.notify();
    } else return false;
    return true;
  }
  return false;
}
