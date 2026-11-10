// Parts of the Jira side panel: search dropdown, titles, facts, text with images, attachments, fields, checklist.
import { div, image } from "gpui-kit";
import { TextView, h_flex, v_flex } from "gpui-base";
import { ago } from "../timeHelpers.js";
import { defaultProject, splitImages, statusColorKey } from "./jiraFormatHelpers.js";
import { priorityBadge, tagChip } from "./issueCardHelpers.js";

/** @typedef {import("../types.js").Theme} Theme */
/** @typedef {import("../types.js").Cx} Cx */
/** @typedef {import("../types.js").Attachment} Attachment */
/** @typedef {import("../types.js").Checklist} Checklist */
/** @typedef {import("../types.js").CustomField} CustomField */
/** @typedef {import("../types.js").Issue} Issue */
/** @typedef {import("../types.js").IssueFull} IssueFull */
/** @typedef {import("../types.js").IssueLink} IssueLink */
/** @typedef {Record<string, string | null>} ImagePaths */

/** @param {Issue[]} issues @returns {Issue[]} */
export function dedupeIssues(issues) {
  const seen = new Set();
  return (issues ?? []).filter((i) => i?.key && !seen.has(i.key) && seen.add(i.key));
}

/**
 * @param {string} query
 * @param {Issue[]} knownIssues
 * @param {string | null | undefined} currentKey
 * @returns {{ key: string, summary?: string, status?: string, prio?: string, byKey?: boolean }[]}
 */
export function filterSuggestions(query, knownIssues, currentKey) {
  const q = (query ?? "").trim();
  const qLower = q.toLowerCase();
  const unique = dedupeIssues(knownIssues);
  const matches = qLower
    ? unique.filter((i) => i.key.toLowerCase().includes(qLower) || i.summary?.toLowerCase().includes(qLower))
    : unique;
  const m = q.match(/^(?:([a-z]+)-)?(\d+)$/i);
  const proj =
    m && (m[1]?.toUpperCase() || defaultProject({ currentKey, issues: unique }) || currentKey?.split("-")[0]);
  if (proj) {
    const resolvedKey = `${proj}-${m[2]}`;
    if (!matches.some((i) => i.key.toUpperCase() === resolvedKey)) {
      return [{ key: resolvedKey, summary: "Open issue by key", byKey: true }, ...matches].slice(0, 8);
    }
  }
  return matches.slice(0, 8);
}

/**
 * @param {Theme} t
 * @param {{ suggestions: { key: string, summary?: string, status?: string, prio?: string, byKey?: boolean }[], selectedAt: number, onSelect: (key: string, cx: Cx) => void }} options
 */
export function searchDropdown(t, { suggestions, selectedAt, onSelect }) {
  if (!suggestions.length) {
    return div()
      .px(10)
      .py(6)
      .bg(t.raised)
      .border_b(1)
      .border_color(t.border)
      .text_size(12)
      .text_color(t.dim)
      .child("No matching issues found");
  }
  return v_flex()
    .bg(t.raised)
    .border_b(1)
    .border_color(t.border)
    .py(2)
    .children(
      suggestions.map((item, idx) => {
        const prio = priorityBadge(t, item.prio);
        const keyColor = item.byKey ? t.accent : t.foreground;
        return h_flex()
          .id(`jv-suggest-${item.key}`)
          .h(28)
          .px(10)
          .gap(8)
          .items_center()
          .cursor_pointer()
          .when(idx === selectedAt, (e) => e.bg(t.selected))
          .hover((e) => e.bg(t.hover))
          .on_click((_e, cx) => onSelect(item.key, cx))
          .child(div().flex_none().text_size(12).font_semibold().text_color(keyColor).child(item.key))
          .when(Boolean(prio), (e) => e.child(prio))
          .child(
            div()
              .flex_1()
              .min_w(0)
              .truncate()
              .text_size(12)
              .text_color(t.dim)
              .child(item.summary ?? ""),
          )
          .when(Boolean(item.status), (e) =>
            e.child(div().flex_none().text_size(11).text_color(t.dim).child(item.status)),
          );
      }),
    );
}

/** @param {Theme} t @param {string} title */
export const section = (t, title) =>
  div().pt(10).pb(2).text_size(11).font_semibold().text_color(t.dim).child(title.toUpperCase());

/** @param {Theme} t @param {string} name @param {any} [content] */
export function fact(t, name, content) {
  const isText = typeof content === "string" || !content;
  const text = isText ? content || "—" : null;
  const body = isText ? div().flex_1().min_w(0).truncate().child(text) : div().flex_1().min_w(0).child(content);
  return h_flex()
    .gap(8)
    .text_size(12)
    .items_center()
    .child(div().w(80).flex_none().text_color(t.dim).child(name))
    .child(body);
}

/** @param {Theme} t @param {string} label @param {string} date @param {any} color */
const factAgo = (t, label, date, color) =>
  fact(
    t,
    label,
    div()
      .text_color(color)
      .child(date ? `${ago(date)} ago` : "—"),
  );

/** @param {Theme} t @param {IssueFull} i */
export function detailsRows(t, i) {
  const muted = t.muted ?? t.dim;
  const assignee = i.assignee ? div().font_semibold().text_color(t.accent).child(`@ ${i.assignee}`) : "—";
  const reporter = i.reporter?.name ? div().text_color(t.foreground).child(i.reporter.name) : "—";
  const sprint = i.sprint ? tagChip(t, i.sprint, t.accent) : "—";
  const labels = i.labels?.length
    ? h_flex()
        .gap(4)
        .children(i.labels.map((l) => tagChip(t, l, muted)))
    : "—";
  return [
    fact(t, "Assignee", assignee),
    fact(t, "Reporter", reporter),
    fact(t, "Sprint", sprint),
    fact(t, "Labels", labels),
    fact(t, "Parent", i.parent),
    factAgo(t, "Created", i.created, muted),
    factAgo(t, "Updated", i.updated, muted),
  ];
}

/** @param {Theme} t @param {string} id @param {string} label @param {(cx: Cx) => void} act */
export const headerButton = (t, id, label, act) =>
  div()
    .id(id)
    .px(6)
    .py(2)
    .rounded(4)
    .cursor_pointer()
    .text_color(t.dim)
    .hover((e) => e.bg(t.hover).text_color(t.foreground))
    .on_click((_e, cx) => act(cx))
    .child(label);

/**
 * @param {Theme} t
 * @param {{ id: string, text: string, color?: any, act: (cx: Cx) => void }} line
 */
export const linkLine = (t, { id, text, color = undefined, act }) =>
  div()
    .id(id)
    .text_size(12)
    .cursor_pointer()
    .rounded(4)
    .hover((s) => s.bg(t.hover))
    .text_color(color ?? t.foreground)
    .on_click((_e, cx) => act(cx))
    .child(text);

/**
 * @param {Theme} t
 * @param {{ id: string, link: IssueLink, act: (cx: Cx) => void }} options
 */
export function linkRow(t, { id, link, act }) {
  const isBlocking = (link.how ?? "").toLowerCase().includes("block");
  const statusColor = t[statusColorKey(link.status)] ?? t.dim;
  return h_flex()
    .id(id)
    .px(6)
    .py(3)
    .gap(6)
    .items_center()
    .rounded(4)
    .cursor_pointer()
    .hover((s) => s.bg(t.hover))
    .on_click((_e, cx) => act(cx))
    .child(
      div()
        .flex_none()
        .text_size(11)
        .font_semibold()
        .text_color(isBlocking ? t.blocked : t.dim)
        .child(link.how),
    )
    .child(div().flex_none().text_size(12).font_semibold().text_color(t.accent).child(link.key))
    .child(
      div()
        .flex_1()
        .min_w(0)
        .truncate()
        .text_size(12)
        .text_color(t.foreground)
        .child(link.summary || ""),
    )
    .when(Boolean(link.status), (e) =>
      e.child(div().flex_none().text_size(11).text_color(statusColor).child(link.status)),
    );
}

/**
 * @param {Theme} t
 * @param {string | null | undefined} path
 * @param {string} name
 */
function imageBox(t, path, name) {
  if (path === undefined) return div().text_size(11).text_color(t.dim).child(`🖼 ${name} (loading…)`);
  if (!path) return div().text_size(11).text_color(t.dim).child(`🖼 ${name}`);
  return div().w_full().h(220).rounded(6).overflow_hidden().bg(t.raised).child(image(path).size_full());
}

/**
 * @param {Theme} t
 * @param {{ id: string, text: string, images: ImagePaths, imageNames: Set<string>, size?: number }} options
 */
export function richText(t, { id, text, images, imageNames, size = 13 }) {
  return v_flex()
    .gap(6)
    .children(
      splitImages(text || "").map((part, n) => {
        if (!part.image) return TextView.markdown(`${id}-${n}`, part.text).selectable(true).text_size(size);
        if (imageNames.has(part.image)) return imageBox(t, images[part.image], part.image);
        const label = /^[0-9a-f-]{36}$/.test(part.image) ? "attached file" : part.image;
        return div().text_size(11).text_color(t.dim).child(`📎 ${label} (see Attachments)`);
      }),
    );
}

/**
 * @param {Theme} t
 * @param {{ attachments: Attachment[], images: ImagePaths, open: (a: Attachment) => void }} options
 */
export function attachmentList(t, { attachments, images, open }) {
  return v_flex()
    .gap(4)
    .children(
      attachments.map((a) =>
        v_flex()
          .gap(2)
          .child(linkLine(t, { id: `jv-att-${a.id}`, text: `📎 ${a.name} · ${a.sizeText}`, act: () => open(a) }))
          .when(a.isImage, (e) => e.child(imageBox(t, images[a.name], a.name))),
      ),
    );
}

/**
 * @param {Theme} t
 * @param {{ fields: CustomField[], gen: number }} options
 */
export function customFields(t, { fields, gen }) {
  return v_flex()
    .gap(2)
    .children(
      fields.map((f, n) =>
        v_flex()
          .child(section(t, f.name))
          .child(TextView.markdown(`jv-f-${gen}-${n}`, f.text).selectable(true).text_size(12)),
      ),
    );
}

/**
 * @param {Theme} t
 * @param {{ checklist: Checklist, open: () => void }} options
 */
export function checklistView(t, { checklist, open }) {
  const state = checklist.done ? "all done" : `${checklist.unchecked} left`;
  return v_flex()
    .gap(2)
    .child(section(t, `${checklist.progress} · ${state}`))
    .child(div().text_size(12).text_color(t.dim).child(checklist.summary))
    .child(linkLine(t, { id: "jv-checklist", text: "↗ edit the checklist in Jira", color: t.accent, act: open }));
}
