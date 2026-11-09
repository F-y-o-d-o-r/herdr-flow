// lazygit screen: the repo of the focused terminal, or of the program in it (nvim after its own
// cd), opens lazygit in a new tab at once; else a list of the space's repos. p = Pull all.
import { closeOverlay, focused, props, run, theme } from "herdr";
import { openScreen } from "../leader/actions.js";
import { keyed, onListKey } from "../pickerKeys.js";
import { SEARCH_FOOTER, centered, footer, header, screenCard } from "../pickerView.js";
import { foregroundCwd, repoRoot } from "../folders.js";
import { isDemo } from "../demo.js";
import { filterRepos, repoRows } from "./repoRows.js";
import { spaceRepos } from "./source.js";

/** @typedef {import("../types.js").Cx} Cx */
/** @typedef {import("../types.js").KeyEvent} KeyEvent */
/** @typedef {import("../types.js").FocusHandle} FocusHandle */
/** @typedef {import("../types.js").Repo} Repo */

/** @param {string} folder */
function openLazygit(folder) {
  run("terminal.open", { folder, argv: ["lazygit"], place: "tab", name: "lazygit" });
}

async function focusedRepo() {
  const f = focused();
  return (await repoRoot(await foregroundCwd(f?.terminal))) ?? (await repoRoot(f?.cwd));
}

const PULL_ALL = { key: "p", name: "⟳ Pull all repos", branch: "current branches, ff-only", pullAll: true };

export class LazygitScreen {
  /** @type {FocusHandle} */ handle = null;
  /** @type {Repo[] | null} */ repos = null;
  filter = "";
  searching = false;
  at = 0;
  /** @type {string | null} */ error = null;
  demo = false;
  /** @type {string | null} */ folder = null;
  /** @type {string | null} */ on = null;

  /** @param {Cx} cx */
  init(cx) {
    this.handle = cx.focus_handle();
    cx.timer.after(0, () => this.handle.focus());
    Object.assign(this, { repos: null, filter: "", searching: false, at: 0, error: null });
    cx.spawn(async (cx) => {
      const here = (await isDemo()) ? null : await focusedRepo();
      if (here) return this.close(() => openLazygit(here));
      Object.assign(this, await spaceRepos());
      cx.notify();
    });
  }

  /**
   * Closes the popup, then runs `then` (before the popup's work stops).
   * @param {() => void} [then]
   */
  close(then) {
    closeOverlay(props().overlay);
    then?.();
  }

  /** @param {Partial<Repo>} r a repo, or the Pull all row */
  pick(r) {
    if (r.pullAll) return this.close(() => openScreen("pull"));
    this.close(() => !this.demo && openLazygit(r.path));
  }

  rows() {
    const q = this.filter.toLowerCase();
    const repos = filterRepos(this.repos, this.filter);
    const withPull = this.repos?.length && (!q || "pull all".includes(q)) ? [PULL_ALL, ...repos] : repos;
    return keyed(withPull);
  }

  render() {
    const t = /** @type {any} */ (theme()); // theme() is Record<string, string>; colors want `#…`
    const list = this.rows();
    if (this.at >= list.length) this.at = Math.max(0, list.length - 1);
    /**
     * @param {KeyEvent} e
     * @param {Cx} cx
     */
    const onKey = (e, cx) => {
      cx.stop_propagation();
      if (onListKey(this, e, list, { act: (r) => this.pick(r), back: () => this.close() })) cx.notify();
    };
    const card = screenCard(t, { id: "herdr-flow-lazygit", width: 440, handle: this.handle, onKey })
      .child(header(t, this, "lazygit", "repo name"))
      .child(
        repoRows(t, {
          id: "lazygit-list",
          list,
          at: this.at,
          searching: this.searching,
          error: this.error,
          loading: !this.repos,
          act: (r) => this.pick(r),
        }),
      )
      .child(
        footer(
          t,
          this.searching
            ? SEARCH_FOOTER
            : "p pull all · 1-9 a-z lazygit in that repo · / search · ↑↓ ctrl-j k · esc close",
        ),
      );
    return centered(card);
  }
}
