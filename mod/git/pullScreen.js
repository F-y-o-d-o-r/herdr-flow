// Pull all: the current branch of every repo of the space's folder, 4 at a time, with
// `git pull --ff-only` only (never a merge or rebase, so no conflicts). A repo is skipped, with
// the reason, for a detached HEAD, a merge/rebase in progress, no upstream, local changes to
// tracked files, or a branch that diverged. Git never prompts. Stays open until Esc: a popup's
// async work stops when it closes.
import { div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { closeOverlay, exec, props, theme } from "herdr";
import { demoPullResults } from "../demo.js";
import { centered, footer, screenCard } from "../pickerView.js";
import { pullOutcome, skipReason } from "./pullStatusHelpers.js";
import { spaceRepos } from "./gitDataSource.js";

/** @typedef {import("../types.js").Cx} Cx */
/** @typedef {import("../types.js").KeyEvent} KeyEvent */
/** @typedef {import("../types.js").FocusHandle} FocusHandle */
/** @typedef {import("../types.js").Theme} Theme */
/** @typedef {import("./pullStatusHelpers.js").PullRow} PullRow */
/** @typedef {import("./pullStatusHelpers.js").PullResult} PullResult */

const PARALLEL = 4;
const ENV = ["GIT_TERMINAL_PROMPT=0", "GCM_INTERACTIVE=0", "GIT_ASKPASS=", "GIT_SSH_COMMAND=ssh -o BatchMode=yes"];
const MARK = { ok: "✓", same: "·", skip: "!", fail: "✗", run: "…", wait: " " };

/**
 * @param {string} path
 * @param {string[]} args
 * @param {string | null} on
 * @returns {Promise<import("herdr").ExecResult>}
 */
function git(path, args, on) {
  return exec("env", [...ENV, "git", "-C", path, ...args], { on }).catch((e) => ({
    code: 1,
    stdout: "",
    stderr: String(e?.message ?? e),
  }));
}

/**
 * @param {string} path
 * @param {string | null} on
 */
async function isMerging(path, on) {
  if ((await git(path, ["rev-parse", "-q", "--verify", "MERGE_HEAD"], on)).code === 0) return true;
  const gitDir = (await git(path, ["rev-parse", "--git-dir"], on)).stdout.trim();
  const test = `[ -d "${gitDir}/rebase-merge" ] || [ -d "${gitDir}/rebase-apply" ]`;
  return (await exec("sh", ["-c", test], { cwd: path, on }).catch(() => ({ code: 1 }))).code === 0;
}

/**
 * One repo: { state, text }.
 * @param {string} path
 * @param {string | null} on
 * @returns {Promise<PullResult>}
 */
async function pullRepo(path, on) {
  const out = async (/** @type {string[]} */ args) => (await git(path, args, on)).stdout.trim();
  const branch = await out(["symbolic-ref", "--short", "-q", "HEAD"]);
  const upstream = branch ? await out(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]) : "";
  const dirty = branch && upstream ? await out(["status", "--porcelain", "--untracked-files=no"]) : "";
  const merging = branch ? await isMerging(path, on) : false;
  const skip = skipReason({ branch, merging, upstream, dirtyFiles: dirty ? dirty.split("\n").length : 0 });
  if (skip) return { state: "skip", text: skip };
  const before = await out(["rev-parse", "HEAD"]);
  const r = await git(path, ["pull", "--ff-only", "--no-rebase", "--quiet"], on);
  const after = r.code === 0 ? await out(["rev-parse", "HEAD"]) : before;
  const count = before !== after ? await out(["rev-list", "--count", `${before}..${after}`]) : "0";
  return pullOutcome({ branch, upstream, code: r.code, message: r.stderr || r.stdout, before, after, count });
}

export class PullScreen {
  /** @type {FocusHandle} */ handle = null;
  /** @type {PullRow[]} */ rows = [];
  done = false;
  /** @type {string | null} */ error = null;
  /** @type {string | null} */ folder = null;

  /** @param {Cx} cx */
  init(cx) {
    this.handle = cx.focus_handle();
    cx.timer.after(0, () => this.handle.focus());
    Object.assign(this, { rows: [], done: false, error: null, folder: null });
    cx.spawn(async (cx) => {
      const found = await spaceRepos();
      Object.assign(this, { folder: found.folder, error: found.error });
      if (found.demo) return (Object.assign(this, { rows: demoPullResults(), done: true }), cx.notify());
      this.rows = found.repos.map((r) => ({ ...r, state: "wait", text: "" }));
      cx.notify();
      await this.pullAll(found.on, cx);
    });
  }

  /**
   * @param {string | null} on
   * @param {Cx} cx
   */
  async pullAll(on, cx) {
    let next = 0;
    const worker = async () => {
      while (next < this.rows.length) {
        const row = this.rows[next++];
        row.state = "run";
        cx.notify();
        Object.assign(row, await pullRepo(row.path, on));
        cx.notify();
      }
    };
    await Promise.all(Array.from({ length: PARALLEL }, worker));
    this.done = true;
    cx.notify();
  }

  summary() {
    const count = (/** @type {PullRow["state"]} */ s) => this.rows.filter((r) => r.state === s).length;
    if (this.done)
      return `updated ${count("ok")} · up to date ${count("same")} · skipped ${count("skip")} · failed ${count("fail")}`;
    return `pulling ${count("wait") + count("run")} of ${this.rows.length}…`;
  }

  /**
   * @param {Theme} t
   * @param {PullRow} r
   */
  rowView(t, r) {
    const color = {
      ok: t.accent,
      same: t.dim,
      skip: t.warning ?? t.accent,
      fail: t.error ?? t.blocked,
      run: t.foreground,
      wait: t.dim,
    }[r.state];
    return h_flex()
      .id(`pull-${r.name}`)
      .h(24)
      .px(8)
      .gap(8)
      .items_center()
      .child(div().w(14).text_color(color).child(MARK[r.state]))
      .child(div().w(170).truncate().child(r.name))
      .child(div().flex_1().truncate().text_size(12).text_color(color).child(r.text));
  }

  render() {
    const t = /** @type {any} */ (theme()); // theme() is Record<string, string>; colors want `#…`
    /**
     * @param {KeyEvent} e
     * @param {Cx} cx
     */
    const onKey = (e, cx) => {
      cx.stop_propagation();
      if (e.key === "escape" || e.key === "enter") closeOverlay(props().overlay);
    };
    const card = screenCard(t, { id: "herdr-flow-pull", width: 560, handle: this.handle, onKey })
      .child(
        h_flex()
          .h(30)
          .px(8)
          .items_center()
          .gap(8)
          .child(div().font_semibold().child("Pull all repos"))
          .child(
            div()
              .flex_1()
              .truncate()
              .text_color(t.dim)
              .child(this.folder ?? ""),
          ),
      )
      .child(
        v_flex()
          .id("pull-list")
          .h(400)
          .overflow_y_scrollbar()
          .gap(1)
          .when(Boolean(this.error), (e) => e.child(div().p(8).text_color(t.dim).child(this.error)))
          .children(this.rows.map((r) => this.rowView(t, r))),
      )
      .child(footer(t, `${this.summary()} · esc close`));
    return centered(card);
  }
}
