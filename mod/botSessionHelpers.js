// Auto-save and auto-restore of open bot/program sessions across Herdr restarts.
import {
  agents,
  appHome,
  exec,
  hc,
  knownAgents,
  notify,
  panes,
  readTextFile,
  setShared,
  shared,
  writeTextFile,
} from "herdr";
import {
  isSnapshotEqual,
  normalizeCwd,
  planRestoration,
  resolveAgentCommand,
  sessionKey,
  snapshotAgents,
  snapshotSessions,
  withResumeFlag,
} from "./botSessionSnapshot.js";

export { isSnapshotEqual, planRestoration, resolveAgentCommand, snapshotAgents, snapshotSessions };

/** @typedef {import("./types.js").BotSession} BotSession */
/** @typedef {import("herdr").PaneInfo} PaneInfo */

export const BOTS_SESSION_FILE = "data/herdr-flow/bots-session.json";
export const SAVED_BOTS_SHARED = "herdrFlow.savedBots";
const LEGACY_RESTORED_SHARED = "herdrFlow.restored";

const RESTORE_INITIAL_DELAY_MS = 1500;
const RESTORE_POLL_MS = 1000;
const RESTORE_MAX_ATTEMPTS = 15;

// In-memory per-process state: shared() is persisted on disk across restarts.
let restorationDone = false;
/** @type {Set<string>} */
const restoredTerminals = new Set();
/** @type {Set<string>} */
const restoredSessionKeys = new Set();
/** @type {Map<string, string[]>} */
const foregroundCache = new Map();

/** @param {number} count */
function notifyRestored(count) {
  if (count <= 0) return;
  notify({ title: "HerdrFlow", body: `Restored ${count} session${count > 1 ? "s" : ""}`, level: "info" });
}

/** @returns {string} */
export function getBotsSessionFilePath() {
  const home = appHome();
  return home ? `${home}/${BOTS_SESSION_FILE}` : BOTS_SESSION_FILE;
}

/**
 * Saves bot sessions to disk and shared state.
 * @param {BotSession[]} sessions
 * @returns {Promise<boolean>}
 */
export async function saveBotSessions(sessions) {
  try {
    const filePath = getBotsSessionFilePath();
    const dir = filePath.slice(0, filePath.lastIndexOf("/"));
    if (dir) await exec("mkdir", ["-p", dir]).catch(() => null);

    const text = JSON.stringify(sessions, null, 2) + "\n";
    const existing = await readTextFile(filePath).catch(() => null);
    await writeTextFile(filePath, text, existing).catch(() => writeTextFile(filePath, text, null));
    setShared(SAVED_BOTS_SHARED, sessions);
    return true;
  } catch {
    return false;
  }
}

/**
 * Loads saved bot sessions from disk.
 * @returns {Promise<BotSession[]>}
 */
export async function loadBotSessions() {
  try {
    const text = await readTextFile(getBotsSessionFilePath()).catch(() => null);
    const parsed = text ? JSON.parse(text) : null;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Resolves foreground argvs for non-shell, non-agent panes so programs keep their flags.
 * @param {PaneInfo[]} currentPanes
 * @returns {Promise<Record<string, string[]>>}
 */
async function collectForegroundArgvs(currentPanes) {
  /** @type {Record<string, string[]>} */
  const out = {};
  const targets = currentPanes.filter((p) => p?.terminal && p.cwd && p.program && !p.program.shell && !p.program.agent);
  await Promise.all(
    targets.map(async (p) => {
      if (!p.terminal) return;
      const cacheKey = `${p.terminal}:${p.program.name}`;
      const cached = foregroundCache.get(cacheKey);
      if (cached) {
        out[p.terminal] = cached;
        return;
      }
      const res = await hc(["get", p.terminal, "--json"]).catch(() => null);
      if (!res || res.code !== 0 || !res.stdout) return;
      try {
        const argv = JSON.parse(res.stdout)?.foreground?.argv;
        if (Array.isArray(argv)) {
          foregroundCache.set(cacheKey, argv);
          out[p.terminal] = argv;
        }
      } catch {
        // ignore malformed json
      }
    }),
  );
  return out;
}

/**
 * Takes snapshot of agents and non-shell programs. Protects saved sessions while startup restore runs.
 * @param {boolean} [forceToast]
 * @returns {Promise<number>}
 */
export async function syncBotSnapshot(forceToast = false) {
  try {
    const currentPanes = panes();
    const known = await knownAgents().catch(() => []);
    const foregrounds = await collectForegroundArgvs(currentPanes);
    const nextSnapshot = snapshotSessions(agents(), currentPanes, known, foregrounds);

    const prevShared = /** @type {unknown} */ (shared(SAVED_BOTS_SHARED));
    const prev = Array.isArray(prevShared) ? prevShared : await loadBotSessions();

    if (!restorationDone && !forceToast && prev.length > 0 && nextSnapshot.length < prev.length) {
      return prev.length;
    }

    if (!isSnapshotEqual(prev, nextSnapshot) || forceToast) await saveBotSessions(nextSnapshot);

    if (forceToast) {
      const count = nextSnapshot.length;
      notify({ title: "HerdrFlow", body: `Saved ${count} session${count === 1 ? "" : "s"}`, level: "info" });
    }
    return nextSnapshot.length;
  } catch {
    return 0;
  }
}

/**
 * Restores pending saved sessions into matching empty shell panes once.
 * @param {boolean} [force]
 * @returns {Promise<{ restored: number, remaining: number }>}
 */
async function restorePendingOnce(force = false) {
  if (force) {
    restoredTerminals.clear();
    restoredSessionKeys.clear();
    restorationDone = false;
  }

  const saved = await loadBotSessions();
  const pending = saved.filter((s) => !restoredSessionKeys.has(sessionKey(s)));
  if (!pending.length) return { restored: 0, remaining: 0 };

  const currentPanes = panes().filter((p) => !p.terminal || !restoredTerminals.has(p.terminal));
  const plan = planRestoration(pending, currentPanes, agents());
  if (!plan.length) return { restored: 0, remaining: pending.length };

  let restored = 0;
  for (const item of plan) {
    const res = await hc(["send", item.terminal, withResumeFlag(item.command)]).catch(() => null);
    if (!res || res.code !== 0) continue;

    restoredTerminals.add(item.terminal);
    const itemTab = currentPanes.find((p) => p.pane === item.pane)?.tab;
    const matched = pending.find(
      (s) =>
        !restoredSessionKeys.has(sessionKey(s)) &&
        (s.pane === item.pane || normalizeCwd(s.cwd) === normalizeCwd(item.cwd) || (itemTab && s.tab === itemTab)),
    );
    if (matched) restoredSessionKeys.add(sessionKey(matched));
    restored++;
  }

  return { restored, remaining: Math.max(0, pending.length - restored) };
}

/**
 * Manual or single-shot restore entry point (used by `herdr-flow.bots-restore`).
 * @param {boolean} [force]
 * @returns {Promise<number>}
 */
export async function autoRestoreBots(force = false) {
  if (!force && restorationDone) return 0;
  const { restored } = await restorePendingOnce(force);
  if (force) restorationDone = true;
  notifyRestored(restored);
  return restored;
}

/**
 * Startup restore loop: waits for kept shells to start and emit cwd, retrying until all restore or timeout.
 * @param {{ sleep(ms?: number): Promise<void> }} cx
 * @returns {Promise<number>}
 */
export async function runStartupRestore(cx) {
  if (shared(LEGACY_RESTORED_SHARED) != null) setShared(LEGACY_RESTORED_SHARED, null);

  let totalRestored = 0;
  await cx.sleep(RESTORE_INITIAL_DELAY_MS).catch(() => null);

  for (let i = 0; i < RESTORE_MAX_ATTEMPTS; i++) {
    const { restored, remaining } = await restorePendingOnce(false).catch(() => ({ restored: 0, remaining: 0 }));
    totalRestored += restored;
    if (remaining === 0) break;
    await cx.sleep(RESTORE_POLL_MS).catch(() => null);
  }

  restorationDone = true;
  notifyRestored(totalRestored);
  return totalRestored;
}
