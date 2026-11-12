// The leader table: defaults from the mod, the user's own edits on top. Pure.
// A row is `key: [action, label, direct shortcut, section]`.

export const OVERRIDES_FILE = "herdr-flow.bindings.json";

/** @typedef {[action: string, label?: string, hint?: string, section?: string]} Binding */
/** @typedef {Record<string, Binding>} Bindings */

/**
 * Defaults with the user's rows on top; a `null` row removes that key.
 * @param {Bindings} defaults
 * @param {Record<string, Binding | null> | null} overrides
 * @returns {Bindings}
 */
export function mergeBindings(defaults, overrides) {
  const merged = { ...defaults };
  for (const [key, row] of Object.entries(overrides ?? {})) {
    if (row === null) delete merged[key];
    else merged[key] = row;
  }
  return merged;
}

/**
 * A usable overrides row: `null` (remove the key) or `[action, label, …]` with string action and label.
 * @param {unknown} row
 * @returns {boolean}
 */
const isRow = (row) => row === null || (Array.isArray(row) && typeof row[0] === "string" && typeof row[1] === "string");

/**
 * The overrides file's text -> { table, warning }. A missing file is no overrides; bad rows are
 * dropped and named in the warning.
 * @param {string | null} text
 * @returns {{ table: Record<string, Binding | null>, warning: string | null }}
 */
export function parseOverrides(text) {
  if (!text) return { table: {}, warning: null };
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    return { table: {}, warning: `${OVERRIDES_FILE}: ${e instanceof Error ? e.message : String(e)}` };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { table: {}, warning: `${OVERRIDES_FILE}: not an object, ignored` };
  }
  const entries = Object.entries(parsed);
  const bad = entries.filter(([, row]) => !isRow(row)).map(([key]) => key);
  const table = Object.fromEntries(entries.filter(([, row]) => isRow(row)));
  const warning = bad.length ? `${OVERRIDES_FILE}: bad rows ignored: ${bad.join(", ")}` : null;
  return { table, warning };
}

const ALWAYS = ["send-key", "screen:", "panel:"];

/**
 * Whether an action can run here: our own actions always; others need their mod or app command.
 * @param {string} action
 * @param {{ commands: Set<string>, mods: Set<string> }} env
 * @returns {boolean}
 */
export function isActionAvailable(action, { commands, mods }) {
  if (ALWAYS.some((a) => action === a || (a.endsWith(":") && action.startsWith(a)))) return true;
  if (action.startsWith("repo:")) return isActionAvailable(action.slice("repo:".length), { commands, mods });
  if (action === "nvim-zoom") return mods.has("herdr-nvim");
  const [name, value] = action.split(/:(.*)/s);
  if (name === "mod.open") return mods.has(value);
  if (commands.has(name)) return true;
  return mods.has(name.split(".")[0]);
}
