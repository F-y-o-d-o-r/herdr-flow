// The leader's cheat sheet: tmux-standard block on top, our additions below, each row with its
// keys, label and (grey) direct shortcut.
import { div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";

/** @typedef {import("../types.js").Theme} Theme */
/** @typedef {import("./bindings.js").Bindings} Bindings */
/** @typedef {import("gpui-kit").Element} Element */
/** @typedef {{ action: string, label: string, hint: string, keys: string[] }} SheetRow */

export const LEADER_KEYS = "ctrl-; / ctrl-a";
/** @type {Record<string, string>} */
const SECTIONS = {
  tabs: "tabs",
  panes: "panes",
  spaces: "spaces · misc",
  agents: "agents & editor",
  git: "git",
  tools: "tools",
};
const ORDER = ["tabs", "spaces", "panes", "agents", "tools", "git"]; // reading order on screen

/**
 * Bindings grouped by section; keys sharing an action share a row; digits 2–9 fold into "tab 1…9".
 * @param {Bindings} bindings
 */
export function groupRows(bindings) {
  /** @type {Record<string, Map<string, SheetRow>>} */
  const groups = Object.fromEntries(Object.keys(SECTIONS).map((id) => [id, new Map()]));
  for (const [key, [action, label, hint, group]] of Object.entries(bindings)) {
    if (/^[2-9]$/.test(key)) continue;
    const rows = groups[group] ?? groups.tools;
    const row = rows.get(action) ?? { action, label: label ?? action, hint: hint ?? "", keys: [] };
    row.keys.push(key);
    if (!row.hint && hint) row.hint = hint;
    rows.set(action, row);
  }
  return groups;
}

/**
 * @param {SheetRow} row
 * @param {string} q
 */
const matches = (row, q) => row.label.toLowerCase().includes(q) || row.keys.some((k) => k.toLowerCase() === q);

/**
 * Actions whose label or key matches the query, in on-screen order.
 * @param {Bindings | null} bindings
 * @param {string} query
 * @returns {string[]}
 */
export function orderedHits(bindings, query) {
  const q = query.trim().toLowerCase();
  if (!q || !bindings) return [];
  const groups = groupRows(bindings);
  return ORDER.flatMap((id) => [...groups[id].values()])
    .filter((r) => matches(r, q))
    .map((r) => r.action);
}

/**
 * @param {Theme} t
 * @param {SheetRow} r
 * @param {{ q: string, current: string | null }} search
 */
function rowView(t, r, { q, current }) {
  const on = Boolean(q) && matches(r, q);
  const faded = Boolean(q) && !on;
  const chip = (/** @type {string} */ key) => div().px(5).rounded(4).bg(t.raised).text_color(t.foreground).child(key);
  return h_flex()
    .gap(8)
    .items_center()
    .py(1)
    .px(4)
    .rounded(4)
    .border(1)
    .border_color(Boolean(current) && r.action === current ? t.accent : t.popover)
    .when(on, (el) => el.bg(t.selected))
    .child(h_flex().w(92).flex_none().gap(2).children(r.keys.map(chip)))
    .child(
      div()
        .flex_1()
        .text_color(on ? t.accent : faded ? t.dim : t.foreground)
        .child(r.label),
    )
    .child(div().flex_none().text_size(11).text_color(t.dim).child(r.hint));
}

/**
 * @param {Theme} t
 * @param {string} title
 * @param {string[][]} columns section ids per column
 * @param {(id: string) => Element} draw
 */
function block(t, title, columns, draw) {
  return v_flex()
    .gap(6)
    .child(div().text_size(11).text_color(t.dim).child(title))
    .child(
      h_flex()
        .gap(28)
        .items_start()
        .children(columns.map((ids) => v_flex().flex_1().children(ids.map(draw)))),
    );
}

/**
 * @param {string | null} query
 * @param {string | null} current
 */
function hintLine(query, current) {
  if (query === null) return "press a key · / search · esc cancels · grey = direct shortcut";
  if (current) return `search: ${query} · n / N next / previous · enter runs · / new search · esc closes`;
  return `search: ${query}▏ · enter: go to matches · esc closes`;
}

/**
 * The whole sheet. `query` null = not searching; `current` = the action picked among matches.
 * @param {Theme} t
 * @param {{ bindings: Bindings, query: string | null, current: string | null, warning: string | null }} sheet
 */
export function cheatSheet(t, { bindings, query, current, warning }) {
  const groups = groupRows(bindings);
  const q = query?.trim().toLowerCase() ?? "";
  const section = (/** @type {string} */ id) =>
    v_flex()
      .gap(2)
      .pb(8)
      .child(div().pb(2).text_size(10.5).font_semibold().text_color(t.muted).child(SECTIONS[id]))
      .children([...groups[id].values()].map((r) => rowView(t, r, { q, current })));
  return v_flex()
    .w_full()
    .p(14)
    .gap(10)
    .rounded(8)
    .border(1)
    .border_color(t.border)
    .bg(t.popover)
    .text_size(12.5)
    .child(
      h_flex()
        .gap(6)
        .child(div().font_semibold().text_color(t.foreground).child(`leader ${LEADER_KEYS}`))
        .child(div().text_color(t.dim).child(hintLine(query, current))),
    )
    .when(Boolean(warning), (el) => el.child(div().text_size(11).text_color(t.blocked).child(warning)))
    .child(block(t, "tmux standard", [["tabs", "spaces"], ["panes"]], section))
    .child(div().w_full().h(1).bg(t.border))
    .child(block(t, "added", [["agents", "tools"], ["git"]], section));
}
