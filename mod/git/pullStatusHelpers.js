// What Pull all says about one repo. Pure.

/** @typedef {"ok" | "same" | "skip" | "fail" | "run" | "wait"} PullState */
/** @typedef {{ state: PullState, text: string }} PullResult */
/** @typedef {PullResult & { name: string, path?: string }} PullRow */

/**
 * Why a repo is skipped before pulling, or null to pull it.
 * @param {{ branch: string, merging?: boolean, upstream?: string, dirtyFiles?: number }} repo
 * @returns {string | null}
 */
export function skipReason({ branch, merging = false, upstream = "", dirtyFiles = 0 }) {
  if (!branch) return "detached HEAD";
  if (merging) return `${branch}: merge/rebase in progress`;
  if (!upstream) return `${branch}: no upstream`;
  if (dirtyFiles > 0) return `${branch}: local changes (${dirtyFiles} files)`;
  return null;
}

/**
 * { state: "ok" | "same" | "skip" | "fail", text } after `git pull --ff-only`.
 * @param {{ branch: string, upstream: string, code: number, message?: string, before: string, after: string, count: string }} pull
 * @returns {PullResult}
 */
export function pullOutcome({ branch, upstream, code, message = "", before, after, count }) {
  if (code !== 0) {
    if (/not possible to fast-forward|diverg/i.test(message)) {
      return { state: "skip", text: `${branch}: diverged from ${upstream} — pull by hand` };
    }
    return { state: "fail", text: `${branch}: ${message.trim().split("\n").pop().slice(0, 120)}` };
  }
  if (before === after) return { state: "same", text: `${branch}: up to date` };
  return { state: "ok", text: `${branch}: +${count} commit${count === "1" ? "" : "s"}` };
}
