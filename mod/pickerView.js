// Drawing helpers shared by the picker screens (title / search line, row key, footer).
import { div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";

/** @typedef {import("./types.js").Theme} Theme */
/** @typedef {import("./types.js").ListState} ListState */
/** @typedef {import("./types.js").Cx} Cx */
/** @typedef {import("./types.js").KeyEvent} KeyEvent */
/** @typedef {import("./types.js").FocusHandle} FocusHandle */
/** @typedef {import("gpui-kit").Element} Element */

/**
 * Title line, or the search line while searching / filtered.
 * @param {Theme} t
 * @param {ListState} s
 * @param {string} title
 */
export function header(t, s, title, placeholder = "search") {
  if (!s.searching && !s.filter) {
    return h_flex().h(26).px(4).items_center().child(div().font_semibold().text_color(t.foreground).child(title));
  }
  return h_flex()
    .h(28)
    .px(8)
    .items_center()
    .gap(6)
    .rounded(6)
    .border(1)
    .border_color(s.searching ? t.accent : t.border)
    .child(div().text_color(t.dim).child(`${title} /`))
    .child(
      div()
        .flex_1()
        .truncate()
        .text_color(s.filter ? t.foreground : t.dim)
        .child(s.searching ? `${s.filter || placeholder}▏` : `${s.filter}  · esc clear`),
    );
}

/**
 * The row's key, drawn on its left; hidden while typing a search (keys work again after Enter).
 * @param {Theme} t
 * @param {string | undefined} key
 */
export function badge(t, key, searching = false) {
  return div()
    .w(14)
    .flex_none()
    .text_size(12)
    .font_semibold()
    .text_color(t.accent)
    .child(searching ? "" : (key ?? ""));
}

/**
 * The keys line at the bottom of a screen.
 * @param {Theme} t
 * @param {string} text
 */
export function footer(t, text) {
  return div().text_size(11).text_color(t.dim).child(text);
}

/** The usual footer while a search line is open. */
export const SEARCH_FOOTER = "type to search · enter keep filter · esc clear";

/**
 * A screen's card, centred in the mod's wide popup at the screen's own width.
 * @param {Theme} t
 * @param {{ id: string, width: number, handle?: FocusHandle, onKey?: (e: KeyEvent, cx: Cx) => void }} options
 */
export function screenCard(t, { id, width, handle, onKey }) {
  const card = v_flex()
    .id(id)
    .w(width)
    .p(10)
    .gap(6)
    .bg(t.popover)
    .rounded(10)
    .border(1)
    .border_color(t.border)
    .text_size(13)
    .text_color(t.foreground);
  return handle ? card.track_focus(handle).on_key_down(onKey) : card;
}

/**
 * Centres a card in the popup.
 * @param {Element} card
 */
export function centered(card) {
  return h_flex().w_full().justify_center().child(card);
}
