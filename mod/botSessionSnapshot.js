// Pure planning and snapshotting helpers for bot/program session restore (no herdr imports).

/** @typedef {import("./types.js").BotSession} BotSession */
/** @typedef {import("./types.js").RestorationPlanItem} RestorationPlanItem */
/** @typedef {import("herdr").AgentInfo} AgentInfo */
/** @typedef {import("herdr").PaneInfo} PaneInfo */
/** @typedef {{ key: string, name: string, run: string[], installed: boolean }} KnownAgent */

const STANDARD_COMMANDS = ["antigravity", "claude", "codex", "gemini", "pi"];
const SHELL_NAMES = new Set(["zsh", "bash", "sh", "fish", "nu", "pwsh", "dash", "shell"]);
const CONTINUE_BINS = new Set(["agy", "antigravity", "claude", "pi"]);

/**
 * Adds a session-resume flag to supported agent commands when restoring.
 * @param {string} command
 * @returns {string}
 */
export function withResumeFlag(command) {
  const sep = " && ";
  const idx = command.lastIndexOf(sep);
  const prefix = idx >= 0 ? command.slice(0, idx + sep.length) : "";
  const cmd = (idx >= 0 ? command.slice(idx + sep.length) : command).trim();
  const parts = cmd.split(/\s+/);
  const bin = parts[0]?.split("/").pop()?.toLowerCase() ?? "";

  if (CONTINUE_BINS.has(bin)) {
    const hasFlag = parts.some((p) => ["-c", "--continue", "-r", "--resume", "--conversation"].includes(p));
    return hasFlag ? command : `${prefix}${cmd} --continue`;
  }
  if (bin === "codex" && !parts.includes("resume")) {
    return `${prefix}codex resume --last`;
  }
  return command;
}

/** @param {unknown} val */
const normalize = (val) => (typeof val === "string" ? val.trim().toLowerCase() : "");

/** @param {unknown} val */
export function normalizeCwd(val) {
  if (typeof val !== "string") return "";
  const trimmed = val.trim();
  return trimmed.length > 1 ? trimmed.replace(/\/+$/, "") : trimmed;
}

/** @param {string} arg */
export function shellQuote(arg) {
  if (!arg) return "''";
  if (/^[a-zA-Z0-9_./:@%+=,-]+$/.test(arg)) return arg;
  return `'${arg.replace(/'/g, "'\\''")}'`;
}

/** @param {BotSession} s */
export function sessionKey(s) {
  return `${s.pane}::${normalizeCwd(s.cwd)}::${s.command}`;
}

/**
 * Finds command to launch an agent. Looks in knownList (matching key or name)
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
 * Resolves launch command for a non-agent, non-shell pane.
 * @param {PaneInfo} pane
 * @param {string[] | null | undefined} [foregroundArgv]
 * @returns {string | null}
 */
export function resolveProgramCommand(pane, foregroundArgv) {
  if (Array.isArray(foregroundArgv) && foregroundArgv.length > 0) {
    const bin = normalize(foregroundArgv[0].split("/").pop());
    if (bin && !SHELL_NAMES.has(bin)) return foregroundArgv.map(shellQuote).join(" ");
  }

  const key = pane?.program?.key;
  const name = pane?.program?.name;
  if (key && key !== "program" && key !== "agent" && !SHELL_NAMES.has(normalize(key))) {
    return key;
  }
  if (name && !SHELL_NAMES.has(normalize(name))) {
    return name;
  }
  return null;
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
 * Takes snapshot of both active agents and non-shell programs running in panes.
 * @param {AgentInfo[] | null | undefined} agentsList
 * @param {PaneInfo[] | null | undefined} panesList
 * @param {KnownAgent[] | null | undefined} [knownList]
 * @param {Record<string, string[]>} [foregroundByTerminal]
 * @returns {BotSession[]}
 */
export function snapshotSessions(agentsList, panesList, knownList, foregroundByTerminal = {}) {
  const out = snapshotAgents(agentsList, panesList, knownList);
  const seenPanes = new Set(out.map((s) => s.pane));
  if (!Array.isArray(panesList)) return out;

  for (const p of panesList) {
    if (!p?.pane || !p.terminal || !p.cwd || seenPanes.has(p.pane)) continue;
    if (!p.program || p.program.shell) continue;

    const command = p.program.agent
      ? resolveAgentCommand(p.app, p.program.key, p.program.name, knownList)
      : resolveProgramCommand(p, foregroundByTerminal[p.terminal]);
    if (!command) continue;

    seenPanes.add(p.pane);
    out.push({
      pane: p.pane,
      tab: p.tab ?? "",
      tab_name: "",
      space: "",
      space_name: "",
      cwd: p.cwd,
      app: p.app ?? null,
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

  const sigsPrev = prev.map(sessionKey).sort();
  const sigsNext = next.map(sessionKey).sort();
  return sigsPrev.every((sig, idx) => sig === sigsNext[idx]);
}

/**
 * Computes restoration plan matching saved sessions to candidate empty shell panes.
 * Priority: 1) pane + cwd, 2) tab + cwd, 3) cwd only, 4) pane only, 5) tab only.
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
    (p) =>
      p?.terminal &&
      p.cwd &&
      (p.status === null || p.status === undefined) &&
      (p.program ? p.program.shell : true) &&
      !activePanes.has(p.pane),
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
  matchPass((c, s) => c.pane === s.pane && Boolean(s.pane));
  matchPass((c, s) => c.tab === s.tab && Boolean(s.tab));

  return Array.from(matches.entries()).map(([session, candidate]) => {
    const needsCd = normalizeCwd(candidate.cwd) !== normalizeCwd(session.cwd);
    const command = needsCd ? `cd ${shellQuote(session.cwd)} && ${session.command}` : session.command;
    return {
      pane: candidate.pane,
      terminal: candidate.terminal,
      cwd: candidate.cwd,
      command,
      app: session.app ?? null,
    };
  });
}
