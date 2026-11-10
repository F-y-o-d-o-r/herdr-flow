// Where the git screens get their repos: the focused terminal, the active space's folder, or demo data.
import { focused, spaces } from "herdr";
import { demoRepos, isDemo } from "../demo.js";
import { folderWithRepos, foregroundCwd, rememberWorkFolder } from "../folderHelpers.js";

/**
 * @typedef {object} SpaceRepos
 * @property {string | null} folder
 * @property {boolean} [isRepo]
 * @property {import("../types.js").Repo[]} repos
 * @property {string | null} on the space's machine
 * @property {string | null} error
 * @property {boolean} demo
 */

/**
 * { folder, on, repos, error, demo } for the focused terminal or active space.
 * @returns {Promise<SpaceRepos>}
 */
export async function spaceRepos() {
  if (await isDemo()) return { ...demoRepos(), on: null, error: null, demo: true };
  const space = spaces().find((s) => s.active);
  const on = space?.machine ?? null;
  const f = focused();
  const dirs = [...new Set([await foregroundCwd(f?.terminal), f?.cwd, space?.folder].filter(Boolean))];
  for (const dir of dirs) {
    const found = await folderWithRepos(dir, { on });
    if (!found) continue;
    rememberWorkFolder(found.folder, found.repos);
    return { ...found, on, error: null, demo: false };
  }
  const folder = dirs[0] ?? null;
  const error = folder ? `No git repos inside ${folder}` : "This space has no folder";
  return { folder, isRepo: false, repos: [], on, error, demo: false };
}
