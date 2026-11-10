// Configurable Jira counters for the top bar and screen. Pure (no herdr or gpui imports).
export const COUNTERS_FILE = "herdr-flow.jira.json";
export const COUNTERS_SHARED = "herdrFlow.jiraCounters";
export const COUNTERS_REFRESH = "herdrFlow.jiraCountersRefresh";

/**
 * @typedef {{ title: string, level?: "info" | "success" | "warning" | "error" }} CounterNotify
 */

/**
 * @typedef {object} JiraCounter
 * @property {string} id
 * @property {string} tag
 * @property {string} key
 * @property {string} label
 * @property {string} jql
 * @property {"warn" | "accent" | "ok" | "muted"} [color]
 * @property {CounterNotify | false} [notify]
 */

/**
 * @typedef {JiraCounter & { count: number, issues?: import("../types.js").Issue[] }} CounterState
 */

/**
 * @typedef {{ title: string, body: string, level: "info" | "success" | "warning" | "error" }} CounterToast
 */

/** @type {JiraCounter[]} */
export const DEFAULT_COUNTERS = [
  {
    id: "assigned",
    tag: "A",
    key: "a",
    label: "Assigned",
    jql: 'assignee = currentUser() AND statusCategory != Done AND status != Reject AND status not in ("Code Review", "Review", "In Review") ORDER BY updated DESC',
    color: "accent",
    notify: { title: "Jira [A] · Assigned to you", level: "info" },
  },
  {
    id: "review",
    tag: "R",
    key: "r",
    label: "Review",
    jql: 'assignee = currentUser() AND status in ("Code Review", "Review", "In Review") ORDER BY updated DESC',
    color: "warn",
    notify: { title: "Jira [R] · Ready for your code review", level: "warning" },
  },
];

/**
 * Resolves notification settings for a counter.
 * @param {Record<string, unknown>} o
 * @param {string} tag
 * @param {string} label
 * @param {"warn" | "accent" | "ok" | "muted" | undefined} color
 * @returns {CounterNotify | false}
 */
function sanitizeNotify(o, tag, label, color) {
  const defaultLevel = color === "warn" ? "warning" : color === "ok" ? "success" : "info";
  if (o.notify === false) return false;
  if (o.notify && typeof o.notify === "object") {
    const n = /** @type {Record<string, unknown>} */ (o.notify);
    const title = typeof n.title === "string" && n.title.trim() ? n.title.trim() : `Jira [${tag}] · ${label}`;
    const level =
      typeof n.level === "string" && ["info", "success", "warning", "error"].includes(n.level)
        ? /** @type {"info" | "success" | "warning" | "error"} */ (n.level)
        : defaultLevel;
    return { title, level };
  }
  return { title: `Jira [${tag}] · ${label}`, level: defaultLevel };
}

/**
 * Validates and normalizes one counter entry.
 * @param {unknown} item
 * @returns {JiraCounter | null}
 */
function sanitizeCounter(item) {
  if (!item || typeof item !== "object") return null;
  const o = /** @type {Record<string, unknown>} */ (item);
  const tag = typeof o.tag === "string" ? o.tag.trim() : "";
  const label = typeof o.label === "string" ? o.label.trim() : "";
  const jql = typeof o.jql === "string" ? o.jql.trim() : "";
  if (!tag || !label || !jql) return null;
  const id = typeof o.id === "string" && o.id.trim() ? o.id.trim() : tag.toLowerCase();
  const key = typeof o.key === "string" && o.key.trim() ? o.key.trim() : tag.toLowerCase().charAt(0);
  const color =
    typeof o.color === "string" && ["warn", "accent", "ok", "muted"].includes(o.color)
      ? /** @type {"warn" | "accent" | "ok" | "muted"} */ (o.color)
      : undefined;
  const notify = sanitizeNotify(o, tag, label, color);
  return { id, tag, key, label, jql, ...(color ? { color } : {}), notify };
}

/**
 * Parses counters JSON: supports array of counters or `{ counters: [...] }`.
 * @param {string | null | undefined} text
 * @returns {{ counters: JiraCounter[], warning: string | null }}
 */
export function parseCounters(text) {
  if (!text || !text.trim()) return { counters: DEFAULT_COUNTERS, warning: null };
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    return { counters: DEFAULT_COUNTERS, warning: `${COUNTERS_FILE}: ${e instanceof Error ? e.message : String(e)}` };
  }
  const rawList = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.counters) ? parsed.counters : null;
  if (!rawList) {
    return { counters: DEFAULT_COUNTERS, warning: `${COUNTERS_FILE}: expected an array of counters` };
  }
  const counters = [];
  const bad = [];
  for (let i = 0; i < rawList.length; i++) {
    const c = sanitizeCounter(rawList[i]);
    if (c) counters.push(c);
    else bad.push(String(i));
  }
  if (!counters.length) {
    return { counters: DEFAULT_COUNTERS, warning: `${COUNTERS_FILE}: no valid counters found` };
  }
  const warning = bad.length ? `${COUNTERS_FILE}: skipped invalid counter items: ${bad.join(", ")}` : null;
  return { counters, warning };
}

/**
 * Maps counter color to theme token for active (count > 0) state.
 * @param {string | undefined} color
 * @param {import("../types.js").Theme} t
 */
export function counterActiveColor(color, t) {
  if (color === "warn") return t.ansi3;
  if (color === "ok") return t.ansi2;
  if (color === "accent") return t.accent;
  return t.foreground;
}

/**
 * Builds notification body for newly arrived issues.
 * @param {import("../types.js").Issue[]} newIssues
 */
function counterIssuesBody(newIssues) {
  if (newIssues.length === 1) {
    return `${newIssues[0].key} · ${newIssues[0].summary}`;
  }
  const head = newIssues
    .slice(0, 3)
    .map((i) => `${i.key} ${i.summary}`)
    .join(" · ");
  const more = newIssues.length > 3 ? ` (+${newIssues.length - 3} more)` : "";
  return `${head}${more}`;
}

/**
 * Compares issues against previous snapshot and returns new issue toasts.
 * @param {Map<string, Set<string>> | null} prevKeysByCounter
 * @param {CounterState[]} nextCounters
 * @returns {{ seen: Map<string, Set<string>>, toasts: CounterToast[] }}
 */
export function diffNewCounterIssues(prevKeysByCounter, nextCounters) {
  /** @type {Map<string, Set<string>>} */
  const seen = new Map();
  /** @type {CounterToast[]} */
  const toasts = [];

  for (const counter of nextCounters) {
    const keys = new Set((counter.issues ?? []).map((i) => i.key));
    seen.set(counter.id, keys);

    if (prevKeysByCounter === null) continue;
    if (counter.notify === false) continue;

    const prev = prevKeysByCounter.get(counter.id);
    if (!prev) continue;

    const newIssues = (counter.issues ?? []).filter((i) => !prev.has(i.key));
    if (!newIssues.length) continue;

    const notifyCfg = counter.notify;
    const title = notifyCfg?.title ?? `Jira [${counter.tag}] · ${counter.label}`;
    const level = notifyCfg?.level ?? "info";
    toasts.push({ title, body: counterIssuesBody(newIssues), level });
  }

  return { seen, toasts };
}
