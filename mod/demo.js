// Demo mode: while <app home>/herdr-flow.demo exists, screens show invented data and run no git
// network command and no Jira write. For screenshots and for trying the mod without Jira.
import { appHome, exec } from "herdr";

/** @typedef {import("./types.js").RepoList} RepoList */
/** @typedef {import("./git/pullStatusHelpers.js").PullRow} PullRow */

/** Is demo mode on? Checked once per screen open. */
export async function isDemo() {
  const r = await exec("test", ["-e", `${appHome()}/herdr-flow.demo`]).catch(() => null);
  return r?.code === 0;
}

/**
 * @param {string} [folder]
 * @returns {RepoList}
 */
export function demoRepos(folder = "~/code") {
  const rows = [
    ["billing-api", "main"],
    ["design-system", "feature/ACME-214-tokens"],
    ["mobile-app", "main"],
    ["web-dashboard", "ACME-311-fix-chart-tooltips"],
    ["docs-site", "main"],
  ];
  return { folder, isRepo: false, repos: rows.map(([name, branch]) => ({ name, branch, path: `${folder}/${name}` })) };
}

/** @returns {PullRow[]} */
export function demoPullResults() {
  return [
    { name: "billing-api", state: "ok", text: "main: +3 commits" },
    { name: "design-system", state: "skip", text: "feature/ACME-214-tokens: local changes (2 files)" },
    { name: "mobile-app", state: "same", text: "main: up to date" },
    { name: "web-dashboard", state: "ok", text: "ACME-311-fix-chart-tooltips: +1 commit" },
    { name: "docs-site", state: "same", text: "main: up to date" },
  ];
}
