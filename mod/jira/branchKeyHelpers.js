// The issue key in the focused repo's branch name (e.g. "AB-123-short-name"), or null.
import { exec } from "herdr";
import { foregroundCwd } from "../folderHelpers.js";

/**
 * @param {ReturnType<typeof import("herdr").focused>} focused
 * @returns {Promise<string | null>}
 */
export async function currentIssueKey(focused) {
  const dirs = [await foregroundCwd(focused?.terminal), focused?.cwd].filter(Boolean);
  for (const dir of dirs) {
    const r = await exec("git", ["-C", dir, "branch", "--show-current"]).catch(() => null);
    const m = r?.code === 0 && r.stdout.match(/\b([A-Z][A-Z0-9]+-\d+)/i);
    if (m) return m[1].toUpperCase();
  }
  return null;
}
