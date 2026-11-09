// Where the work is: a folder that is a repo, or a folder whose direct children are repos.
import { exec, hc, setShared, shared } from "herdr";
import { LIST_REPOS, parseRepoList } from "./repoList.js";

/** @typedef {import("./types.js").Repo} Repo */
/** @typedef {import("./types.js").RepoList} RepoList */

const WORK_FOLDER = "herdrFlow.workFolder";

/**
 * The top folder of the repo holding `dir`, or null.
 * @param {string | null | undefined} dir
 * @param {string | null} [on] the machine to run on
 * @returns {Promise<string | null>}
 */
export async function repoRoot(dir, on = null) {
  if (!dir) return null;
  const r = await exec("git", ["-C", dir, "rev-parse", "--show-toplevel"], { on }).catch(() => null);
  return r?.code === 0 ? r.stdout.trim() || null : null;
}

/**
 * { folder, isRepo, repos: [{ name, path, branch }] } for one folder.
 * @param {string} folder
 * @param {{ on?: string | null }} [options]
 * @returns {Promise<RepoList>}
 */
export async function listRepos(folder, { on = null } = {}) {
  const root = await repoRoot(folder, on);
  if (root === folder) {
    const r = await exec("git", ["-C", folder, "branch", "--show-current"], { on }).catch(() => null);
    const name = folder.split("/").pop();
    return { folder, isRepo: true, repos: [{ name, path: folder, branch: r?.stdout.trim() ?? "" }] };
  }
  const r = await exec("sh", ["-c", LIST_REPOS], { cwd: folder, on }).catch(() => null);
  const repos = r?.code === 0 ? parseRepoList(r.stdout).map((x) => ({ ...x, path: `${folder}/${x.name}` })) : [];
  return { folder, isRepo: false, repos };
}

/**
 * The folder of the program running in a terminal (nvim after its own cd), or null.
 * @param {string | null | undefined} terminal
 * @returns {Promise<string | null>}
 */
export async function foregroundCwd(terminal) {
  if (!terminal) return null;
  const r = await hc(["get", "--json", terminal]).catch(() => null);
  try {
    return r?.code === 0 ? (JSON.parse(r.stdout).foreground?.cwd ?? null) : null;
  } catch {
    return null;
  }
}

/**
 * Remembers a folder where repos were found, for when the current one has none.
 * @param {string | null} folder
 * @param {Repo[]} repos
 */
export function rememberWorkFolder(folder, repos) {
  if (folder && repos.length > 0 && shared(WORK_FOLDER) !== folder) setShared(WORK_FOLDER, folder);
}

/**
 * A folder holding repos above / at `dir`: the dir itself, or its repo's parent when that holds repos.
 * @param {string} dir
 * @param {{ on?: string | null }} [options]
 * @returns {Promise<RepoList | null>}
 */
export async function folderWithRepos(dir, { on = null } = {}) {
  const root = await repoRoot(dir, on);
  if (!root) {
    const found = await listRepos(dir, { on });
    return found.repos.length > 0 ? found : null;
  }
  const parent = await listRepos(root.split("/").slice(0, -1).join("/"), { on });
  if (parent.repos.length > 1) return parent; // a folder of sibling repos, like ~/code
  return listRepos(root, { on });
}

/**
 * Where an agent should work: from the focused terminal, else the last remembered folder.
 * @param {{ cwd?: string | null, terminal?: string | null } | null} focused
 * @returns {Promise<string | null>}
 */
export async function workFolder(focused) {
  const dirs = [await foregroundCwd(focused?.terminal), focused?.cwd].filter(Boolean);
  for (const dir of dirs) {
    const found = await folderWithRepos(dir);
    if (!found) continue;
    rememberWorkFolder(found.folder, found.repos);
    return found.folder;
  }
  return /** @type {string | null} */ (shared(WORK_FOLDER)) ?? null;
}
