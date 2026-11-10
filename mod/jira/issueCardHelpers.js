// Drawing for the Jira screen: an issue row in a list and the card's short preview.
import { div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { badge } from "../pickerView.js";
import { ago } from "../timeHelpers.js";
import { defaultProject, issueTypeMeta, priorityMeta, statusColorKey } from "./jiraFormatHelpers.js";
import * as steps from "./issueActionSteps.js";

/** @typedef {import("../types.js").Theme} Theme */
/** @typedef {import("../types.js").Row} Row */
/** @typedef {import("../types.js").Issue} Issue */
/** @typedef {import("../types.js").Cx} Cx */
/** @typedef {import("./jiraScreen.js").JiraScreen} JiraScreen */

export const URGENT = new Set(["High", "Highest", "Critical", "Blocker"]);

/**
 * Priority badge with icon (⇈, ↑, =, ↓, ⇊) and semantic color.
 * @param {Theme} t
 * @param {string | undefined} priority
 */
export function priorityBadge(t, priority) {
  const meta = priorityMeta(priority);
  if (!meta) return null;
  const color = t[meta.colorKey] ?? t.dim;
  return div().flex_none().text_size(11).font_semibold().text_color(color).child(`${meta.icon} ${priority}`);
}

/**
 * Issue type badge with symbol (● bug, ◈ story, ⚡ epic, ✓ task) and color.
 * @param {Theme} t
 * @param {string | undefined} issueType
 */
export function issueTypeBadge(t, issueType) {
  const meta = issueTypeMeta(issueType);
  if (!meta) return null;
  const color = t[meta.colorKey] ?? t.dim;
  return div().flex_none().text_size(11).text_color(color).child(`${meta.icon} ${issueType}`);
}

/**
 * Status pill for header with semantic color.
 * @param {Theme} t
 * @param {string | undefined} status
 */
export function statusBadge(t, status) {
  if (!status) return null;
  const color = t[statusColorKey(status)] ?? t.foreground;
  return div().px(6).py(1).rounded(4).bg(t.raised).text_size(11).font_semibold().text_color(color).child(status);
}

/**
 * Small rounded pill for sprint or label tags.
 * @param {Theme} t
 * @param {string} text
 * @param {any} color
 */
export const tagChip = (t, text, color) => div().px(5).py(1).rounded(4).bg(t.raised).text_color(color).child(text);

/**
 * One list row: key · label · @who · priority / summary, status and age on the right.
 * @param {Theme} t
 * @param {Row} r
 * @param {{ selected: boolean, searching: boolean, act: (cx: Cx) => void }} options
 */
export function rowView(t, r, { selected, searching, act }) {
  const prio = priorityBadge(t, r.prio);
  return h_flex()
    .id(`row-${r.key}-${r.label}`)
    .min_h(28)
    .px(8)
    .py(3)
    .gap(8)
    .items_center()
    .rounded(6)
    .cursor_pointer()
    .when(selected, (e) => e.bg(t.selected))
    .hover((e) => e.bg(t.hover))
    .on_click((_e, cx) => act(cx))
    .child(badge(t, r.key, searching))
    .child(
      v_flex()
        .flex_1()
        .min_w(0)
        .child(
          h_flex()
            .gap(8)
            .items_center()
            .child(div().flex_none().child(r.label))
            .when(Boolean(r.who), (e) =>
              e.child(div().truncate().text_size(11).text_color(t.accent).child(`@ ${r.who}`)),
            )
            .when(Boolean(prio), (e) => e.child(prio)),
        )
        .when(Boolean(r.sub), (e) => e.child(div().truncate().text_size(11).text_color(t.dim).child(r.sub))),
    )
    .child(
      v_flex()
        .max_w(170)
        .items_end()
        .child(
          div()
            .truncate()
            .text_size(11)
            .text_color(t.dim)
            .child(r.hint || ""),
        )
        .when(Boolean(r.meta), (e) => e.child(div().truncate().text_size(10).text_color(t.dim).child(r.meta))),
    );
}

/**
 * Assignee, reporter, and created/updated timestamps row.
 * @param {Theme} t
 * @param {Issue} issue
 */
function peopleRow(t, issue) {
  const dot = () => div().text_color(t.dim).child("·");
  return h_flex()
    .gap(5)
    .items_center()
    .text_size(11)
    .child(div().font_semibold().text_color(t.accent).child(`@ ${issue.assignee}`))
    .child(dot())
    .child(div().text_color(t.dim).child("by"))
    .child(
      div()
        .text_color(t.foreground)
        .child(issue.reporter?.name ?? "?"),
    )
    .child(dot())
    .child(div().text_color(t.dim).child("created"))
    .child(div().text_color(t.muted).child(ago(issue.created)))
    .child(dot())
    .child(div().text_color(t.dim).child("updated"))
    .child(
      div()
        .text_color(t.muted)
        .child(`${ago(issue.updated)} ago`),
    );
}

/**
 * Issue type, priority, sprint, and label chips row.
 * @param {Theme} t
 * @param {Issue} issue
 */
function metadataRow(t, issue) {
  const type = issueTypeBadge(t, issue.type);
  const prio = priorityBadge(t, issue.priority);
  return h_flex()
    .gap(6)
    .items_center()
    .text_size(11)
    .when(Boolean(type), (e) => e.child(type))
    .when(Boolean(prio), (e) => e.child(prio))
    .when(Boolean(issue.sprint), (e) => e.child(tagChip(t, issue.sprint, t.accent)))
    .children((issue.labels ?? []).map((label) => tagChip(t, label, t.muted)));
}

/**
 * The card's short preview: state, people, where it belongs, what it's linked to.
 * @param {Theme} t
 * @param {Issue} issue
 */
export function preview(t, issue) {
  /** @param {string} text */
  const line = (text, color = t.dim) => div().text_size(11).text_color(color).truncate().child(text);
  const status = statusBadge(t, issue.status);
  return v_flex()
    .px(8)
    .py(6)
    .gap(5)
    .rounded(6)
    .bg(t.surface)
    .child(
      h_flex()
        .gap(8)
        .items_center()
        .child(div().font_semibold().text_color(t.accent).child(issue.key))
        .when(Boolean(status), (e) => e.child(status)),
    )
    .child(
      div()
        .text_size(13)
        .text_color(t.foreground)
        .child(issue.summary ?? ""),
    )
    .child(peopleRow(t, issue))
    .child(metadataRow(t, issue))
    .when(Boolean(issue.parent), (e) => e.child(line(`parent ${issue.parent}`)))
    .children(
      (issue.links ?? [])
        .slice(0, 6)
        .map((l) => line(`${l.how} ${l.key} ${l.summary} — ${l.status}`, l.how.includes("block") ? t.blocked : t.dim)),
    );
}

/** @type {Record<string, string>} */
export const FOOTERS = {
  mode: "pick a list · / search, /1307 any issue · esc close",
  issues: "1-9 a-z open · / search, /1307 any issue · ↑↓ ctrl-j k · esc back",
  card: "t take · m move · r reassign · o browser · O side panel · esc back",
  assign: "1-9 pick · / search people · esc keep",
};

/** @param {Issue} i */
export const issueMeta = (i) => [ago(i.updated), i.reporter && `by ${i.reporter.name}`].filter(Boolean).join(" · ");

/**
 * Mode menu rows: configured counters (`a` first) followed by History.
 * @param {JiraScreen} s
 * @returns {Row[]}
 */
export function modeRows(s) {
  const ordered = [...s.counters].sort((a, b) => Number(b.key === "a") - Number(a.key === "a"));
  /** @type {Row[]} */
  const rows = ordered.map((counter) => ({
    key: counter.key,
    label: counter.label,
    hint: `${counter.count} issue${counter.count === 1 ? "" : "s"}`,
    act: (cx) => s.go("issues", cx, counter.id),
  }));
  rows.push({
    key: "h",
    label: "History",
    hint: "viewed, moved or reassigned by you",
    act: (cx) => s.go("issues", cx, "history"),
  });
  return rows;
}

/**
 * Action rows for a picked issue card.
 * @param {JiraScreen} s
 * @returns {Row[]}
 */
export const cardRows = (s) => [
  { key: "t", label: "Take", hint: "send to an agent", act: (cx) => steps.loadAgents(s, cx) },
  { key: "m", label: "Move", hint: "change status", act: (cx) => steps.loadTransitions(s, cx) },
  { key: "r", label: "Reassign", hint: "who gave it to you first", act: (cx) => steps.toAssign(s, cx) },
  { key: "o", label: "Open in browser", hint: "Jira", act: (cx) => steps.openInBrowser(s, cx) },
  { key: "O", label: "Open in side panel", hint: "details & links", act: () => steps.openInPanel(s) },
];

/**
 * Suggestions for reassigning an issue.
 * @param {JiraScreen} s
 * @returns {Row[]}
 */
export function assignRows(s) {
  const typing = Boolean(s.filter.trim());
  const people = typing ? s.found : s.suggested;
  /** @type {Row[]} */
  const rows = people.map((p, n) => ({
    label: `${!typing && n === 0 && p.hint === "gave it to you" ? "← " : ""}${p.name}`,
    hint: p.hint ?? "",
    act: (cx) => steps.reassign(s, cx, p),
  }));
  return typing ? rows : [...rows, { label: `Keep: ${s.picked.assignee}`, hint: "esc", act: () => s.close() }];
}

/**
 * Row that opens an issue directly when typing digits or a key like "1307" / "ab-1307".
 * @param {string} q
 * @param {{ current: string | null, issues: Issue[], onOpen: (key: string) => (cx: Cx) => void }} ctx
 * @returns {Row[]}
 */
export function byKeyRow(q, { current, issues, onOpen }) {
  const m = q.match(/^(?:([a-z]+)-)?(\d+)$/);
  const project = m && (m[1]?.toUpperCase() ?? defaultProject({ currentKey: current, issues }));
  if (!project) return [];
  const key = `${project}-${m[2]}`;
  return [{ byKey: true, label: key, sub: "open by key", act: onOpen(key) }];
}
