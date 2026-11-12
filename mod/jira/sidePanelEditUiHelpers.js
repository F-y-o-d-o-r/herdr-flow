// UI cards and badge views for Jira side panel inline editing.
import { div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { ago } from "../timeHelpers.js";
import { quickDateOptions } from "./sidePanelDateHelpers.js";
import { issueTypeBadge, priorityBadge, statusBadge, tagChip } from "./issueCardHelpers.js";
import { attachmentList, checklistView, customFields, fact, linkRow, richText, section } from "./sidePanelHelpers.js";
import { commentRow } from "./commentReactionHelpers.js";
import {
  applyAssign,
  applyContext,
  applyField,
  applyTransition,
  closeEditor,
  openEditor,
  sendToAgent,
} from "./sidePanelEditHelpers.js";

/** @typedef {import("../types.js").Theme} Theme */
/** @typedef {import("../types.js").Cx} Cx */
/** @typedef {import("../types.js").IssueFull} IssueFull */
/** @typedef {import("./sidePanelView.js").PanelView} PanelView */

/** @param {Theme} t @param {PanelView} p @param {string} title */
const editHeader = (t, p, title) =>
  h_flex()
    .items_center()
    .child(div().flex_1().text_size(11).font_semibold().text_color(t.dim).child(title))
    .child(
      div()
        .cursor_pointer()
        .text_size(11)
        .text_color(t.dim)
        .hover((e) => e.text_color(t.foreground))
        .on_click((_e, cx) => closeEditor(p, cx))
        .child("✕"),
    );

const chip = (/** @type {Theme} */ t, /** @type {string} */ label, /** @type {(cx: Cx) => void} */ act, dim = false) =>
  div()
    .px(6)
    .py(2)
    .rounded(4)
    .bg(t.surface)
    .border(1)
    .border_color(t.border)
    .cursor_pointer()
    .text_size(11)
    .when(dim, (e) => e.text_color(t.dim))
    .hover((e) => e.bg(t.hover))
    .on_click((_e, cx) => act(cx))
    .child(label);

const editRow = (
  /** @type {Theme} */ t,
  /** @type {string} */ id,
  /** @type {string} */ label,
  /** @type {string} */ hint,
  /** @type {boolean} */ sel,
  /** @type {(cx: Cx) => void} */ act,
) =>
  h_flex()
    .id(id)
    .px(6)
    .py(3)
    .gap(6)
    .rounded(4)
    .cursor_pointer()
    .when(sel, (e) => e.bg(t.selected))
    .hover((e) => e.bg(t.hover))
    .on_click((_e, cx) => act(cx))
    .child(div().text_size(12).font_semibold().text_color(t.accent).child(label))
    .when(Boolean(hint), (e) => e.child(div().text_size(11).text_color(t.dim).child(hint)));

const inputBox = (/** @type {Theme} */ t, /** @type {string} */ query, /** @type {string} */ placeholder) =>
  h_flex()
    .px(6)
    .py(2)
    .rounded(4)
    .bg(t.surface)
    .border(1)
    .border_color(t.border)
    .child(
      div()
        .text_size(12)
        .text_color(query ? t.foreground : t.dim)
        .child(query ? `${query}▏` : placeholder),
    );

/** @param {Theme} t @param {PanelView} p */
export function inlineEditorView(t, p) {
  const box = v_flex().p(8).gap(6).rounded(6).bg(t.raised).border(1).border_color(t.accent);
  if (p.editMode === "status") {
    return box
      .child(editHeader(t, p, "CHANGE STATUS"))
      .when(p.transitionsLoading, (e) => e.child(div().text_size(12).text_color(t.dim).child("Loading statuses…")))
      .children(
        p.transitions.map((tr, idx) =>
          editRow(t, `jv-status-${tr.id}`, tr.name, tr.name !== tr.to ? `→ ${tr.to}` : "", idx === p.editIndex, (cx) =>
            applyTransition(p, tr, cx),
          ),
        ),
      );
  }
  if (p.editMode === "context") {
    return box
      .child(editHeader(t, p, "ADD CONTEXT TO AGENT"))
      .when(p.agentLoading, (e) => e.child(div().text_size(12).text_color(t.dim).child("Finding agents…")))
      .when(!p.agentLoading && !p.agentOptions.length, (e) =>
        e.child(div().text_size(12).text_color(t.dim).child("No agents found")),
      )
      .children(
        p.agentOptions.map((opt, idx) =>
          editRow(t, `jv-agent-${idx}`, opt.label, opt.hint ?? "", idx === p.editIndex, (cx) =>
            sendToAgent(p, opt, cx),
          ),
        ),
      );
  }
  if (p.editMode === "assignee") {
    const list = [
      ...(p.handedByPerson ? [{ label: `↩ ${p.handedByPerson.name} (gave it to you)`, p: p.handedByPerson }] : []),
      ...(p.data?.reporter ? [{ label: `${p.data.reporter.name} (reporter)`, p: p.data.reporter }] : []),
      ...p.peopleFound.map((x) => ({ label: x.name, p: x })),
    ];
    return box
      .child(editHeader(t, p, "ASSIGN TO"))
      .child(inputBox(t, p.editQuery, "Type name to search…"))
      .children(
        list
          .slice(0, 5)
          .map((item, idx) =>
            editRow(t, `jv-assignee-${idx}`, item.label, "", false, (cx) => applyAssign(p, item.p, cx)),
          ),
      );
  }
  if (p.editMode?.startsWith("field:")) {
    const f = p.data?.pinnedFields?.find((x) => x.id === p.editMode?.slice(6));
    const quick = quickDateOptions();
    return box
      .child(editHeader(t, p, (f?.name ?? "FIELD").toUpperCase()))
      .child(
        h_flex()
          .gap(4)
          .flex_wrap()
          .children(quick.map((opt) => chip(t, opt.label, (cx) => f && applyField(p, f, opt.value, cx))))
          .child(chip(t, "Clear", (cx) => f && applyField(p, f, null, cx), true)),
      )
      .child(inputBox(t, p.editQuery, f?.value || "YYYY-MM-DD or DD.MM"));
  }
  return div();
}

/** @param {Theme} t @param {PanelView} p @param {IssueFull} i */
export function issueTopBadges(t, p, i) {
  const statusBtn = h_flex()
    .id("jv-edit-status")
    .cursor_pointer()
    .on_click((_e, cx) => openEditor(p, "status", cx))
    .child(statusBadge(t, `${i.status} ▾`));
  const contextBtn = h_flex()
    .id("jv-add-context")
    .px(8)
    .py(2)
    .rounded(4)
    .border(1)
    .border_color(t.accent)
    .bg(t.raised)
    .cursor_pointer()
    .text_size(11)
    .font_semibold()
    .text_color(t.accent)
    .hover((e) => e.bg(t.selected))
    .on_click((_e, cx) => applyContext(p, cx))
    .child("+ Context");
  return h_flex()
    .gap(6)
    .items_center()
    .flex_wrap()
    .child(statusBtn)
    .when(Boolean(issueTypeBadge(t, i.type)), (e) => e.child(issueTypeBadge(t, i.type)))
    .when(Boolean(priorityBadge(t, i.priority)), (e) => e.child(priorityBadge(t, i.priority)))
    .child(div().flex_1())
    .child(contextBtn);
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

/** @param {Theme} t @param {IssueFull} i @param {PanelView} p */
export function detailsRows(t, i, p) {
  const muted = t.muted ?? t.dim;
  const isAssignee = p.editMode === "assignee";
  const assigneeVal = h_flex()
    .id("jv-edit-assignee")
    .cursor_pointer()
    .on_click((_e, cx) => openEditor(p, "assignee", cx))
    .child(
      div()
        .font_semibold()
        .text_color(t.accent)
        .child(i.assignee ? `@ ${i.assignee} ✎` : "+ Assign"),
    );
  const rows = [fact(t, "Assignee", assigneeVal), ...(isAssignee ? [inlineEditorView(t, p)] : [])];

  for (const pf of i.pinnedFields ?? []) {
    const isField = p.editMode === `field:${pf.id}`;
    const fieldVal = div()
      .id(`jv-edit-field-${pf.id}`)
      .cursor_pointer()
      .text_color(pf.value ? t.accent : t.dim)
      .on_click((_e, cx) => openEditor(p, `field:${pf.id}`, cx))
      .child(pf.value ? `${pf.value} ✎` : "+ Set date");
    rows.push(fact(t, pf.name, fieldVal), ...(isField ? [inlineEditorView(t, p)] : []));
  }

  const labels = i.labels?.length
    ? h_flex()
        .gap(4)
        .children(i.labels.map((l) => tagChip(t, l, muted)))
    : "—";
  return [
    ...rows,
    fact(t, "Reporter", i.reporter?.name ? div().text_color(t.foreground).child(i.reporter.name) : "—"),
    fact(t, "Sprint", i.sprint ? tagChip(t, i.sprint, t.accent) : "—"),
    fact(t, "Labels", labels),
    fact(t, "Parent", i.parent),
    factAgo(t, "Created", i.created, muted),
    factAgo(t, "Updated", i.updated, muted),
  ];
}

/** @param {Theme} t @param {PanelView} p @param {IssueFull} i */
export function issueBody(t, p, i) {
  const names = new Set(i.attachments.filter((a) => a.isImage).map((a) => a.name));
  const openAtt = (/** @type {any} */ a) => p.openUrl(p.jira?.attachmentUrl(a.id));
  return v_flex()
    .gap(4)
    .child(issueTopBadges(t, p, i))
    .when(p.editMode === "status" || p.editMode === "context", (e) => e.child(inlineEditorView(t, p)))
    .child(div().pt(4).text_size(16).font_semibold().child(i.summary))
    .child(section(t, "Details"))
    .children(detailsRows(t, i, p))
    .when(i.links.length > 0, (e) =>
      e
        .child(section(t, "Links"))
        .children(
          i.links.map((l, n) => linkRow(t, { id: `jv-link-${n}`, link: l, act: (cx) => p.openLinked(l.key, cx) })),
        ),
    )
    .when(Boolean(i.checklist), (e) =>
      e.child(checklistView(t, { checklist: i.checklist, open: () => p.openUrl(i.url) })),
    )
    .when(i.fields.length > 0, (e) => e.child(customFields(t, { fields: i.fields, gen: p.gen })))
    .child(section(t, "Description"))
    .child(
      richText(t, {
        id: `jv-desc-${p.gen}`,
        text: i.description || "_No description_",
        images: p.images,
        imageNames: names,
      }),
    )
    .when(i.attachments.length > 0, (e) =>
      e
        .child(section(t, `Attachments (${i.attachments.length})`))
        .child(attachmentList(t, { attachments: i.attachments, images: p.images, open: openAtt })),
    )
    .child(section(t, `Comments (${i.comments.length})`))
    .children(
      i.comments.map((c, n) =>
        commentRow(t, {
          comment: c,
          index: n,
          gen: p.gen,
          images: p.images,
          imageNames: names,
          onToggleLike: (cm, cx) => p.toggleLike(cm, cx),
        }),
      ),
    );
}
