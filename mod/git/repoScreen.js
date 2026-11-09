// Repo screen: the space's repos with their branch; picking one cd's the tab's helper shell
// (created right of the focused pane on first use) into it and focuses it, so Herdr's panels
// (Changes, Redline, Pipelines, sidebar branch) follow that repo. With props.then
// (leader "repo:<action>") it runs <action> after the cd, or at once when the focused
// terminal is already in a repo. All work finishes before the popup closes.
import { closeOverlay, exec, focused, hc, notify, panes, props, run, setShared, shared, theme } from "herdr";
import { runAction } from "../leader/actions.js";
import { keyed, onListKey } from "../pickerKeys.js";
import { SEARCH_FOOTER, centered, footer, header, screenCard } from "../pickerView.js";
import { repoRoot } from "../folders.js";
import { filterRepos, repoRows } from "./repoRows.js";
import { spaceRepos } from "./source.js";

/** @typedef {import("../types.js").Cx} Cx */
/** @typedef {import("../types.js").KeyEvent} KeyEvent */
/** @typedef {import("../types.js").FocusHandle} FocusHandle */
/** @typedef {import("../types.js").Repo} Repo */
/** @typedef {import("herdr").PaneInfo} PaneInfo */

const STORE = "repoPick.panes"; // { [tabId]: terminal address of that tab's repo pane }

/** @param {string} path */
const quote = (path) => `'${path.replace(/'/g, "'\\''")}'`;

/**
 * @param {(p: PaneInfo) => unknown} inTab
 * @param {string} path
 * @returns {Promise<string | null>}
 */
async function waitForPane(inTab, path) {
  for (let i = 0; i < 30; i++) {
    const hit = panes().find((p) => inTab(p) && p.cwd === path)?.terminal;
    if (hit) return hit;
    await exec("sleep", ["0.1"]); // no setTimeout in mods
  }
  return null;
}

/**
 * The tab's repo pane: the one used before, else a plain shell placed there by hand.
 * @param {string} tab
 */
function existingRepoPane(tab) {
  const inTab = (/** @type {PaneInfo} */ p) => p.tab === tab && p.terminal;
  const store = /** @type {Record<string, string>} */ (shared(STORE) ?? {});
  return (
    panes().find((p) => inTab(p) && p.terminal === store[tab])?.terminal ??
    panes().find((p) => inTab(p) && p.program?.key === "shell")?.terminal ??
    null
  );
}

/** @param {string} path */
async function moveTo(path) {
  const tab = focused()?.tab;
  if (!tab) return null;
  let terminal = existingRepoPane(tab);
  if (terminal) {
    const r = await hc(["send", terminal, `cd ${quote(path)} && clear\r`]);
    if (r.code !== 0)
      return notify({ title: "Repo", body: `Could not cd: ${(r.stderr || r.stdout).trim()}`, level: "error" });
  } else {
    run("terminal.open", { folder: path, place: "right" });
    terminal = await waitForPane((p) => p.tab === tab && p.terminal, path);
    if (!terminal) return notify({ title: "Repo", body: "The repo terminal did not appear", level: "error" });
  }
  setShared(STORE, { .../** @type {object} */ (shared(STORE) ?? {}), [tab]: terminal });
  run("pane.focus", { terminal });
  return terminal;
}

export class RepoScreen {
  /** @type {FocusHandle} */ handle = null;
  /** @type {Repo[] | null} */ repos = null;
  filter = "";
  searching = false;
  at = 0;
  /** @type {string | null} */ error = null;
  busy = false;
  /** @type {string | null} */ then = null;
  demo = false;
  /** @type {string | null} */ folder = null;
  /** @type {string | null} */ on = null;

  /**
   * @param {Cx} cx
   * @param {{ then?: string }} [p]
   */
  init(cx, p = {}) {
    this.handle = cx.focus_handle();
    cx.timer.after(0, () => this.handle.focus());
    Object.assign(this, {
      repos: null,
      filter: "",
      searching: false,
      at: 0,
      error: null,
      busy: false,
      then: p.then ?? null,
    });
    cx.spawn(async (cx) => {
      if (this.then && (await repoRoot(focused()?.cwd))) {
        this.close();
        return runAction(this.then);
      }
      Object.assign(this, await spaceRepos());
      cx.notify();
    });
  }

  close() {
    closeOverlay(props().overlay);
  }

  /** @param {Repo} repo */
  async choose(repo) {
    if (this.busy) return;
    this.busy = true;
    try {
      if (!this.demo && (await moveTo(repo.path)) && this.then) runAction(this.then);
    } finally {
      this.close();
    }
  }

  render() {
    const t = /** @type {any} */ (theme()); // theme() is Record<string, string>; colors want `#…`
    const list = keyed(filterRepos(this.repos, this.filter));
    if (this.at >= list.length) this.at = Math.max(0, list.length - 1);
    /**
     * @param {KeyEvent} e
     * @param {Cx} cx
     */
    const onKey = (e, cx) => {
      cx.stop_propagation();
      if (this.busy) return; // the cd is running; Esc would cut it off
      if (onListKey(this, e, list, { act: (r) => this.choose(r), back: () => this.close() })) cx.notify();
    };
    const card = screenCard(t, { id: "herdr-flow-repo", width: 440, handle: this.handle, onKey })
      .child(header(t, this, "repo", "repo name"))
      .child(
        repoRows(t, {
          id: "repo-list",
          list,
          at: this.at,
          searching: this.searching,
          error: this.error,
          loading: !this.repos,
          act: (r) => this.choose(r),
        }),
      )
      .child(
        footer(
          t,
          this.searching ? SEARCH_FOOTER : "1-9 a-z open in the repo pane · / search · ↑↓ ctrl-j k · enter · esc close",
        ),
      );
    return centered(card);
  }
}
