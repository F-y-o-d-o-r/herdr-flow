// Drawing for the Jira screen: an issue row in a list and the card's short preview.
import { div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { badge } from "../pickerView.js";
import { ago } from "../time.js";

/** @typedef {import("../types.js").Theme} Theme */
/** @typedef {import("../types.js").Row} Row */
/** @typedef {import("../types.js").Issue} Issue */
/** @typedef {import("../types.js").Cx} Cx */

export const URGENT = new Set(["High", "Highest", "Critical", "Blocker"]);

/**
 * One list row: key · label · @who · priority / summary, status and age on the right.
 * @param {Theme} t
 * @param {Row} r
 * @param {{ selected: boolean, searching: boolean, act: (cx: Cx) => void }} options
 */
export function rowView(t, r, { selected, searching, act }) {
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
            .when(Boolean(r.prio), (e) =>
              e.child(
                div()
                  .flex_none()
                  .text_size(11)
                  .text_color(URGENT.has(r.prio) ? t.blocked : t.dim)
                  .child(r.prio),
              ),
            ),
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
 * The card's short preview: state, people, where it belongs, what it's linked to.
 * @param {Theme} t
 * @param {Issue} i
 */
export function preview(t, i) {
  /** @param {string} text */
  const line = (text, color = t.dim) => div().text_size(11).text_color(color).truncate().child(text);
  const facts = [i.type, i.priority, i.sprint, i.labels?.join(", ")].filter(Boolean).join(" · ");
  const people = `@ ${i.assignee} · by ${i.reporter?.name ?? "?"} · created ${ago(i.created)} · updated ${ago(i.updated)} ago`;
  return v_flex()
    .px(8)
    .py(6)
    .gap(3)
    .rounded(6)
    .bg(t.surface)
    .child(
      h_flex()
        .gap(8)
        .items_center()
        .child(div().font_semibold().text_color(t.accent).child(i.key))
        .child(
          div()
            .text_size(12)
            .text_color(URGENT.has(i.priority) ? t.blocked : t.foreground)
            .child(i.status ?? ""),
        ),
    )
    .child(
      div()
        .text_size(13)
        .child(i.summary ?? ""),
    )
    .child(line(people))
    .when(Boolean(facts), (e) => e.child(line(facts)))
    .when(Boolean(i.parent), (e) => e.child(line(`parent ${i.parent}`)))
    .children(
      (i.links ?? [])
        .slice(0, 6)
        .map((l) => line(`${l.how} ${l.key} ${l.summary} — ${l.status}`, l.how.includes("block") ? t.blocked : t.dim)),
    );
}
