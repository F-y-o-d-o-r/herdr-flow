// List keys for every picker screen. Pure: no gpui / herdr imports, so node --test loads it.
// Keys are case-sensitive (o and O differ). Every row has a key shown on its left: fixed rows bring
// their own (m, p…), the rest get 1-9, then free letters. "/" starts a search line; Enter keeps the
// filter (and picks the row if only one is left), Esc clears it.

// Same physical key on ЙЦУКЕН and QWERTY, plain and shifted ("Ж" is ":", "Б" is "<").
const RU = "ёйцукенгшщзхъфывапролджэячсмитьбюЁЙЦУКЕНГШЩЗХЪФЫВАПРОЛДЖЭЯЧСМИТЬБЮ";
const EN = "`qwertyuiop[]asdfghjkl;'zxcvbnm,.~QWERTYUIOP{}ASDFGHJKL:\"ZXCVBNM<>";
const AUTO_KEYS = [..."123456789", ..."abcdefghijklmnopqrstuvwxyz"];

/** @typedef {import("./types.js").ListState} ListState */
/** @typedef {import("./types.js").KeyEvent} KeyEvent */
/**
 * @template T
 * @typedef {{ act: (row: T) => void, back: () => void }} ListActions
 */

/**
 * The QWERTY character at the same key as a Russian-layout one (о -> j, О -> J, Ж -> :).
 * @param {string | null | undefined} ch
 * @returns {string}
 */
export function latin(ch) {
  const s = ch ?? "";
  const i = RU.indexOf(s);
  return i < 0 ? s : EN[i];
}

/**
 * Rows with a `key` each: fixed ones keep theirs, the rest get 1-9 then free letters.
 * @template {{ key?: string }} T
 * @param {T[]} rows
 * @returns {T[]}
 */
export function keyed(rows) {
  const taken = new Set(rows.map((r) => r.key).filter(Boolean));
  const free = AUTO_KEYS.filter((c) => !taken.has(c));
  let n = 0;
  return rows.map((r) => (r.key ? r : { ...r, key: free[n++] ?? "" }));
}

/** @param {KeyEvent} e */
function typedChar(e) {
  /** @type {Partial<KeyEvent["modifiers"]>} */
  const m = e.modifiers ?? {};
  return e.key_char && !(m.control || m.platform || m.alt) ? e.key_char : null;
}

/**
 * @param {ListState} s
 * @param {KeyEvent} e
 * @param {unknown[]} list
 */
function moveSelection(s, e, list) {
  const ctrl = e.modifiers?.control;
  const l = latin(e.key);
  if (e.key === "down" || (ctrl && (l === "j" || l === "n"))) s.at = Math.min(list.length - 1, s.at + 1);
  else if (e.key === "up" || (ctrl && (l === "k" || l === "p"))) s.at = Math.max(0, s.at - 1);
  else return false;
  return true;
}

/**
 * @template T
 * @param {ListState} s
 * @param {KeyEvent} e
 * @param {T[]} list
 * @param {(row: T) => void} act
 */
function searchKey(s, e, list, act) {
  if (e.key === "escape") Object.assign(s, { searching: false, filter: "", at: 0 });
  else if (e.key === "enter") {
    s.searching = false;
    if (list.length === 1) act(list[0]);
  } else if (e.key === "backspace") {
    if (s.filter) s.filter = s.filter.slice(0, -1);
    else s.searching = false;
    s.at = 0;
  } else {
    const typed = typedChar(e);
    if (!typed) return false;
    s.filter += typed;
    s.at = 0;
  }
  return true;
}

/**
 * @template {{ key?: string }} T
 * @param {ListState} s
 * @param {KeyEvent} e
 * @param {T[]} list
 * @param {ListActions<T>} actions
 * @returns {boolean}
 */
function browseKey(s, e, list, { act, back }) {
  const typed = typedChar(e);
  if (e.key === "escape") {
    if (!s.filter) return (back(), false);
    Object.assign(s, { filter: "", at: 0 });
    return true;
  }
  if (e.key === "enter") return (list[s.at] && act(list[s.at]), false);
  if (typed === "/" || typed === ".") return (s.searching = true); // "." is "/" on the Russian layout
  const row = typed && list.find((x) => x.key === latin(typed));
  if (row) act(row);
  return false;
}

/**
 * Handles one key for a keyed list. `s` holds { filter, searching, at } and is changed in place.
 * Returns true when the view should redraw.
 * @template {{ key?: string }} T
 * @param {ListState} s
 * @param {KeyEvent} e
 * @param {T[]} list
 * @param {ListActions<T>} actions
 * @returns {boolean}
 */
export function onListKey(s, e, list, { act, back }) {
  if (moveSelection(s, e, list)) return true;
  if (s.searching) return searchKey(s, e, list, act);
  return browseKey(s, e, list, { act, back });
}
