// The leader screen: ctrl-; or ctrl-a opens it; the next key runs its action and closes it.
// The cheat sheet shows at once. Defaults: leader/bindings.json; the user's own rows:
// <app home>/herdr-flow.bindings.json (null removes a key). Rows whose mod isn't installed hide.
// Fork of DanielFGray/herdr-config mods/prefix (Apache-2.0), see NOTICE.
import { v_flex } from "gpui-base";
import { appHome, closeOverlay, commands, exec, props, readTextFile, theme } from "herdr";
import { MOD, openNvimZoomed, runAction } from "./leaderActionHelpers.js";
import { OVERRIDES_FILE, isActionAvailable, mergeBindings, parseOverrides } from "./bindingHelpers.js";
import { cheatSheet, orderedHits } from "./cheatSheetView.js";
import { latin } from "../pickerKeyHelpers.js";

/** @typedef {import("../types.js").Cx} Cx */
/** @typedef {import("../types.js").KeyEvent} KeyEvent */
/** @typedef {import("../types.js").FocusHandle} FocusHandle */
/** @typedef {import("./bindingHelpers.js").Bindings} Bindings */

const MODIFIERS = new Set(["shift", "control", "ctrl", "alt", "cmd", "platform", "function", "fn", "super"]);
const NAMED = new Set(["escape", "enter", "backspace", "up", "down", "left", "right", "tab"]);

async function installedMods() {
  const r = await exec("ls", [`${appHome()}/mods`]).catch(() => null);
  return new Set((r?.stdout ?? "").split("\n").filter(Boolean));
}

/** Defaults + overrides, without rows this setup can't run; plus a warning for a bad overrides file. */
async function loadBindings() {
  const defaults = JSON.parse((await readTextFile(`${appHome()}/mods/${MOD}/leader/bindings.json`)) ?? "{}");
  const { table, warning } = parseOverrides(await readTextFile(`${appHome()}/${OVERRIDES_FILE}`).catch(() => null));
  const env = { commands: new Set(commands().map((c) => c.name)), mods: await installedMods() };
  const all = mergeBindings(defaults, table);
  const shown = Object.fromEntries(Object.entries(all).filter(([, row]) => isActionAvailable(row[0], env)));
  return { bindings: shown, warning };
}

/**
 * A key event's binding name: the typed character ("%", "c"), or the keystroke ("ctrl-a").
 * @param {KeyEvent} e
 * @returns {string | null}
 */
function keyName(e) {
  if (MODIFIERS.has(e.key)) return null;
  /** @type {Partial<KeyEvent["modifiers"]>} */
  const m = e.modifiers ?? {};
  const held = m.control || m.alt || m.platform || m.function;
  return !held && e.key_char ? latin(e.key_char) : e.keystroke;
}

const close = () => closeOverlay(props().overlay);

export class LeaderScreen {
  /** @type {FocusHandle} */ handle = null;
  /** @type {Bindings | null} */ bindings = null;
  /** @type {string | null} */ warning = null;
  searching = false;
  query = "";
  picking = false;
  cursor = 0;
  hidden = false;

  /** @param {Cx} cx */
  init(cx) {
    this.bindings = null;
    this.warning = null;
    this.searching = false; // "/" turns the popup into a search over the sheet
    this.query = "";
    this.picking = false; // after Enter with several matches: n / N move, Enter runs
    this.cursor = 0;
    this.handle = cx.focus_handle();
    cx.timer.after(0, () => this.handle.focus()); // an overlay takes focus only after its first frame
    cx.spawn(async (cx) => {
      Object.assign(this, await loadBindings());
      cx.notify();
    });
  }

  /**
   * @param {string} action
   * @param {string} [key]
   * @param {Cx} [cx]
   */
  run(action, key, cx) {
    if (action === "nvim-zoom" && cx) return this.runNvimZoom(cx);
    close();
    runAction(action, key);
  }

  /**
   * Waits for the nvim pane before zooming it, so the popup stays alive (hidden) until then.
   * @param {Cx} cx
   */
  runNvimZoom(cx) {
    this.hidden = true;
    cx.notify();
    cx.spawn(async () => {
      await openNvimZoomed().catch(() => null);
      close();
    });
  }

  /**
   * @param {string} key
   * @param {string[]} hits
   * @param {Cx} cx
   */
  pickKey(key, hits, cx) {
    if (key === "enter") return hits[this.cursor] ? this.runFound(hits[this.cursor], cx) : null;
    const n = Math.max(1, hits.length);
    if (key === "n" || key === "down") this.cursor = (this.cursor + 1) % n;
    else if (key === "N" || key === "up") this.cursor = (this.cursor - 1 + n) % n;
    else if (key === "/") Object.assign(this, { picking: false, query: "" });
    else if (key === "backspace") this.picking = false;
    else return false;
    return true;
  }

  /**
   * Runs an action found by search, with the key it is bound to (send-key needs it).
   * @param {string} action
   * @param {Cx} cx
   */
  runFound(action, cx) {
    const key = Object.keys(this.bindings ?? {}).find((k) => this.bindings?.[k]?.[0] === action) ?? "";
    this.run(action, key, cx);
  }

  /**
   * Vim-like search: type to filter; Enter runs the only match or lets n / N choose.
   * @param {KeyEvent} e
   * @param {string} typed
   * @param {Cx} cx
   */
  searchKey(e, typed, cx) {
    const key = NAMED.has(e.key) ? e.key : typed;
    if (key === "escape") return (close(), false);
    const hits = orderedHits(this.bindings, this.query);
    if (this.picking) return this.pickKey(key, hits, cx);
    if (key === "backspace") this.query = this.query.slice(0, -1);
    else if (key === "enter") {
      if (hits.length === 1) return (this.runFound(hits[0], cx), false);
      if (hits.length > 1) Object.assign(this, { picking: true, cursor: 0 });
    } else if (!NAMED.has(key) && e.key_char && key.length === 1 && e.key_char >= " ") this.query += e.key_char;
    else return false;
    return true;
  }

  /**
   * @param {KeyEvent} e
   * @param {Cx} cx
   */
  onKey(e, cx) {
    cx.stop_propagation();
    if (this.hidden) return; // nvim-zoom is running; keys must not become leader actions
    const key = keyName(e);
    if (key === null) return;
    if (this.searching) return this.searchKey(e, key, cx) && cx.notify();
    if (key === "/") return ((this.searching = true), cx.notify());
    const action = this.bindings?.[key]?.[0];
    if (action) return this.run(action, key, cx);
    close();
  }

  render() {
    const t = /** @type {any} */ (theme()); // theme() is Record<string, string>; colors want `#…`
    const current = this.picking ? orderedHits(this.bindings, this.query)[this.cursor] : null;
    return v_flex()
      .id("herdr-flow-leader")
      .track_focus(this.handle)
      .on_key_down((e, cx) => this.onKey(e, cx))
      .when(Boolean(this.bindings) && !this.hidden, (el) =>
        el.child(
          cheatSheet(t, {
            bindings: this.bindings,
            query: this.searching ? this.query : null,
            current,
            warning: this.warning,
          }),
        ),
      );
  }
}
