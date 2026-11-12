// Auto-save and auto-restore of open bot/agent sessions across Herdr restarts.
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

/** @typedef {import("./types.js").BotSession} BotSession */
/** @typedef {import("./types.js").RestorationPlanItem} RestorationPlanItem */
/** @typedef {import("herdr").AgentInfo} AgentInfo */
/** @typedef {import("herdr").PaneInfo} PaneInfo */
/** @typedef {Awaited<ReturnType<typeof knownAgents>>[number]} KnownAgent */

export const BOTS_SESSION_FILE = "data/herdr-flow/bots-session.json";
export const SAVED_BOTS_SHARED = "herdrFlow.savedBots";
export const RESTORED_SHARED = "herdrFlow.restored";

const STANDARD_COMMANDS = ["antigravity", "claude", "codex", "gemini", "pi"];

/** @param {unknown} val */
const normalize = (val) => (typeof val === "string" ? val.trim().toLowerCase() : "");

/** @param {unknown} val */
function normalizeCwd(val) {
  if (typeof val !== "string") return "";
  const trimmed = val.trim();
  return trimmed.length > 1 ? trimmed.replace(/\/+$/, "") : trimmed;
}

/**
 * Finds command to launch the agent. Looks in knownList (matching key or name)
 * and returns known.run.join(" "). Fallback to standard agents, or app ?? programKey ?? "agent".
 * @param {string | null | undefined} app
 * @param {string | null | undefined} programKey
 * @param {string | null | undefined} programName
 * @param {KnownAgent[] | null | undefined} [knownList]
 * @returns {string}
 */
export function resolveAgentCommand(app, programKey, programName, knownList) {
  if (Array.isArray(knownList)) {
    const [k, n, a] = [normalize(programKey), normalize(programName), normalize(app)];
    const found = knownList.find((item) => {
      if (!item?.run?.length) return false;
      const [ik, iname] = [normalize(item.key), normalize(item.name)];
      return (k && ik === k) || (a && ik === a) || (n && iname === n) || (a && iname === a);
    });
    if (found) return found.run.join(" ");
  }

  const tokens = [normalize(app), normalize(programKey), normalize(programName)].filter(Boolean);
  for (const cmd of STANDARD_COMMANDS) {
    for (const tok of tokens) {
      if (tok === cmd || tok.startsWith(cmd) || (cmd === "antigravity" && tok.includes(cmd))) {
        return cmd;
      }
    }
  }

  return app ?? programKey ?? "agent";
}

/**
 * Takes snapshot of current agents given agentsList, panesList, and knownList.
 * @param {AgentInfo[] | null | undefined} agentsList
 * @param {PaneInfo[] | null | undefined} panesList
 * @param {KnownAgent[] | null | undefined} [knownList]
 * @returns {BotSession[]}
 */
export function snapshotAgents(agentsList, panesList, knownList) {
  if (!Array.isArray(agentsList) || agentsList.length === 0) return [];
  /** @type {BotSession[]} */
  const out = [];

  for (const agent of agentsList) {
    if (!agent?.pane || typeof agent.pane !== "string") continue;
    const paneInfo = Array.isArray(panesList) ? panesList.find((p) => p?.pane === agent.pane) : null;
    const cwd = paneInfo?.cwd;
    if (!cwd || typeof cwd !== "string") continue;

    const app = agent.app ?? paneInfo?.app ?? null;
    const command = resolveAgentCommand(
      app,
      agent.program?.key ?? paneInfo?.program?.key,
      agent.program?.name ?? paneInfo?.program?.name,
      knownList,
    );
    if (!command) continue;

    out.push({
      pane: agent.pane,
      tab: agent.tab ?? paneInfo?.tab ?? "",
      tab_name: agent.tab_name ?? "",
      space: agent.space ?? "",
      space_name: agent.space_name ?? "",
      cwd,
      app,
      command,
    });
  }

  return out;
}

/**
 * Returns boolean whether two snapshot arrays are equivalent (same panes, commands, cwds).
 * @param {BotSession[] | null | undefined} prev
 * @param {BotSession[] | null | undefined} next
 * @returns {boolean}
 */
export function isSnapshotEqual(prev, next) {
  if (prev === next) return true;
  if (!Array.isArray(prev) || !Array.isArray(next)) return false;
  if (prev.length !== next.length) return false;

  const toSig = (/** @type {BotSession} */ item) => `${item.pane}::${normalizeCwd(item.cwd)}::${item.command}`;

  const sigsPrev = prev.map(toSig).sort();
  const sigsNext = next.map(toSig).sort();
  return sigsPrev.every((sig, idx) => sig === sigsNext[idx]);
}

/**
 * Computes restoration plan matching saved sessions to candidate empty shell panes.
 * Priority: 1) pane ID AND cwd, 2) tab AND cwd, 3) cwd only.
 * @param {BotSession[] | null | undefined} savedSessions
 * @param {PaneInfo[] | null | undefined} currentPanes
 * @param {AgentInfo[] | null | undefined} currentAgents
 * @returns {RestorationPlanItem[]}
 */
export function planRestoration(savedSessions, currentPanes, currentAgents) {
  if (!Array.isArray(savedSessions) || !savedSessions.length) return [];
  if (!Array.isArray(currentPanes) || !currentPanes.length) return [];

  const activePanes = new Set((currentAgents ?? []).map((a) => a?.pane).filter(Boolean));
  const candidates = currentPanes.filter(
    (p) => p?.terminal && p.cwd && (p.status === null || p.status === undefined) && !activePanes.has(p.pane),
  );
  if (!candidates.length) return [];

  /** @type {Set<string>} */
  const usedTerminals = new Set();
  /** @type {Map<BotSession, PaneInfo>} */
  const matches = new Map();

  const matchPass = (/** @type {(c: PaneInfo, s: BotSession, cwd: string) => boolean} */ pred) => {
    for (const s of savedSessions) {
      if (matches.has(s) || !s?.cwd) continue;
      const cwd = normalizeCwd(s.cwd);
      const c = candidates.find((cand) => !usedTerminals.has(cand.terminal) && pred(cand, s, cwd));
      if (c) {
        usedTerminals.add(c.terminal);
        matches.set(s, c);
      }
    }
  };

  matchPass((c, s, cwd) => c.pane === s.pane && normalizeCwd(c.cwd) === cwd);
  matchPass((c, s, cwd) => c.tab === s.tab && normalizeCwd(c.cwd) === cwd);
  matchPass((c, _s, cwd) => normalizeCwd(c.cwd) === cwd);

  return Array.from(matches.entries()).map(([session, candidate]) => ({
    pane: candidate.pane,
    terminal: candidate.terminal,
    cwd: candidate.cwd,
    command: session.command,
    app: session.app ?? null,
  }));
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
    try {
      await writeTextFile(filePath, text, existing);
    } catch {
      await writeTextFile(filePath, text, null).catch(() => null);
    }
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
    if (!text || typeof text !== "string") return [];
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Takes snapshot of agents(), panes(), and knownAgents(). If different from previous or empty, saves it.
 * @param {boolean} [forceToast]
 * @returns {Promise<number>}
 */
export async function syncBotSnapshot(forceToast = false) {
  try {
    const currentAgents = agents();
    const currentPanes = panes();
    const known = await knownAgents().catch(() => []);
    const nextSnapshot = snapshotAgents(currentAgents, currentPanes, known);

    const prevShared = /** @type {unknown} */ (shared(SAVED_BOTS_SHARED));
    const prev = Array.isArray(prevShared) ? prevShared : await loadBotSessions();

    const isRestored = Boolean(shared(RESTORED_SHARED));
    if (!isRestored && nextSnapshot.length === 0 && prev.length > 0) return prev.length;

    const changed = !isSnapshotEqual(prev, nextSnapshot);
    if (changed || forceToast) await saveBotSessions(nextSnapshot);

    if (forceToast) {
      const count = nextSnapshot.length;
      notify({
        title: "HerdrFlow",
        body: `Saved ${count} agent session${count === 1 ? "" : "s"}`,
        level: "info",
      });
    }
    return nextSnapshot.length;
  } catch {
    return 0;
  }
}

/**
 * Restores saved bot sessions into matching empty shell panes.
 * @param {boolean} [force]
 * @returns {Promise<number>}
 */
export async function autoRestoreBots(force = false) {
  if (!force && shared(RESTORED_SHARED)) return 0;
  setShared(RESTORED_SHARED, true);

  const saved = await loadBotSessions();
  if (!saved || saved.length === 0) return 0;

  const plan = planRestoration(saved, panes(), agents());
  if (plan.length === 0) return 0;

  for (const item of plan) {
    await hc(["send", item.terminal, `${item.command}\r`]).catch(() => null);
  }

  notify({
    title: "HerdrFlow",
    body: `Restored ${plan.length} agent session${plan.length > 1 ? "s" : ""}`,
    level: "info",
  });
  return plan.length;
}
