// What a leader key does. Actions: an app command ("name" / "name:value"), a mod command
// ("mod.cmd"), "screen:<name>" (a herdr-flow screen), "panel:<id>" (a side-panel child),
// "repo:<action>" (pick the repo first), "send-key", "sheepdog-toggle", "nvim-zoom" (async: the
// caller keeps its popup open until it resolves).
import { appHome, commands, exec, focused, hc, layout, panes, run, setShared } from "herdr";

export const MOD = "herdr-flow";
export const NEXT_SCREEN = "herdrFlow.next";
export const ROUTER_ID = "herdr-flow-router";

/** @typedef {{ id?: string, hidden?: boolean, active?: string, children?: LayoutNode[] }} LayoutNode */

/**
 * Opens a herdr-flow screen as the mod's popup; main.js reads which one from shared state.
 * @param {string} screen
 * @param {Record<string, unknown>} [props]
 */
export function openScreen(screen, props = {}) {
  setShared(NEXT_SCREEN, { screen, props, at: Date.now() });
  if (routerShown()) return run(`${MOD}.open-next`);
  run("mod.open", { name: MOD });
}

/**
 * Opens a screen right away (for the router: no herdr-flow popup is open then).
 * @param {string} screen
 * @param {Record<string, unknown>} [props]
 */
export function openScreenNow(screen, props = {}) {
  setShared(NEXT_SCREEN, { screen, props, at: Date.now() });
  run("mod.open", { name: MOD });
}

/** Is the router block in the shown layout? It opens the next screen once this popup has closed. */
function routerShown() {
  const root = /** @type {any} */ (layout());
  return (root?.floating ?? []).some((/** @type {{ id?: string }} */ f) => f.id === ROUTER_ID);
}

/**
 * @param {LayoutNode | null} node
 * @param {string} id
 * @returns {LayoutNode | null}
 */
function findNode(node, id) {
  if (!node) return null;
  if (node.id === id) return node;
  for (const child of node.children ?? []) {
    const hit = findNode(child, id);
    if (hit) return hit;
  }
  return null;
}

/**
 * Is that side-panel child showing now?
 * @param {string} id
 */
export function panelShows(id) {
  const root = /** @type {LayoutNode | null} */ (layout());
  const panel = findNode(root, "panel");
  return Boolean(panel && !panel.hidden && findNode(root, "panel-body")?.active === id);
}

/**
 * Shows a side-panel child, or hides the panel when that child already shows.
 * @param {string} id
 */
export function togglePanel(id) {
  if (panelShows(id)) return run("layout.hide", { id: "panel" });
  run("layout.select", { stack: "panel-body", child: id });
  run("layout.show", { id: "panel" });
}

/** @param {string} key */
function sendKey(key) {
  const terminal = focused()?.terminal;
  if (terminal) hc(["keys", terminal, key.replace("-", "+")]);
}

/** Sheepdog on/off in a detached script: this popup's async work stops when it closes. */
function toggleSheepdog() {
  const script = `${appHome()}/mods/${MOD}/leader/sheepdogToggle.sh`;
  exec("sh", ["-c", `nohup sh "${script}" >/dev/null 2>&1 &`]).catch(() => null);
}

/** @param {import("herdr").PaneInfo} p */
const isNvimPane = (p) => p.program?.key === "nvim" || /nvim/i.test(p.program?.name ?? "");
const ZOOM_WAIT_STEPS = 30; // × 0.1 s

/** Toggles herdr-nvim's tab nvim + tree like cmd-e does, zooming the nvim pane when it opens. */
export async function openNvimZoomed() {
  const tab = focused()?.tab;
  const nvimPane = () => panes().find((p) => p.tab === tab && isNvimPane(p));
  const wasOpen = Boolean(nvimPane());
  run("mod.open", { name: "herdr-nvim" });
  if (wasOpen) return; // that press closed it
  for (let i = 0; i < ZOOM_WAIT_STEPS && !nvimPane(); i++) await exec("sleep", ["0.1"]); // no setTimeout in mods
  const pane = nvimPane();
  if (!pane) return;
  run("pane.focus", { pane: pane.pane });
  if (!pane.zoomed) run("pane.zoom", { pane: pane.pane });
}

/** @param {string} action */
function runCommand(action) {
  const [name, value] = action.split(/:(.*)/s);
  if (value === undefined) return run(name);
  const first = commands().find((c) => c.name === name)?.args[0]?.name;
  run(name, { [first]: /^\d+$/.test(value) ? Number(value) : value });
}

/**
 * "repo:<action>": a shown panel just hides; otherwise the repo screen runs <action> after the cd.
 * @param {string} then
 */
function withRepo(then) {
  if (then.startsWith("panel:") && panelShows(then.slice("panel:".length))) return togglePanel(then.slice(6));
  openScreen("repo", { then });
}

/**
 * Runs one leader action; `key` is the pressed key (for send-key).
 * @param {string} action
 * @param {string} [key]
 */
export function runAction(action, key) {
  if (action === "send-key") return sendKey(key);
  if (action === "sheepdog-toggle") return toggleSheepdog();
  if (action.startsWith("screen:")) return openScreen(action.slice("screen:".length));
  if (action.startsWith("panel:")) return togglePanel(action.slice("panel:".length));
  if (action.startsWith("repo:")) return withRepo(action.slice("repo:".length));
  runCommand(action);
}
