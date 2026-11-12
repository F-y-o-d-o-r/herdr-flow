// Puts issue context into an agent's input line without submitting (no Enter),
// so the user can review and keep typing before sending.
import { agents, exec, notify, run } from "herdr";

/**
 * Copies plain text to the macOS clipboard via pbcopy.
 * @param {string} text
 */
export async function copyToClipboard(text) {
  const r = await exec("sh", ["-c", 'printf %s "$1" | pbcopy', "sh", text]).catch(() => null);
  if (!r || r.code !== 0) throw new Error(r?.stderr?.trim() || "pbcopy failed");
}

/**
 * Pastes context into the active or specified agent terminal without pressing Enter.
 * Focuses the target pane, triggers terminal.paste, and notifies the user.
 * If no agent is running, leaves the text in the clipboard.
 *
 * @param {{
 *   target?: import("herdr").AgentInfo | { pane?: string, address?: string } | null,
 *   text: string,
 *   key?: string | null,
 *   name?: string | null,
 * }} opts
 */
export async function pasteContextToAgent({ target = null, text, key = null, name = null }) {
  await copyToClipboard(text);

  const live =
    (target && "pane" in target && target.pane ? target : null) ??
    agents().find((a) => a.focused) ??
    agents()[0] ??
    null;
  const info = live && "program" in live ? /** @type {import("herdr").AgentInfo} */ (live) : null;
  const agentName = name ?? info?.program?.name ?? info?.app ?? "agent";
  const issueKey = key ?? "Issue";

  if (live) {
    if (live.pane) run("pane.focus", { pane: live.pane });
    else if (live.address) run("pane.focus", { terminal: live.address });
    // Brief yield to allow the focus event to settle in GPUI before paste
    await exec("sleep", ["0.05"]).catch(() => null);
    run("terminal.paste");
    notify({
      title: "Jira",
      body: `Pasted ${issueKey} context into ${agentName}`,
      level: "info",
    });
    return true;
  }

  notify({
    title: "Jira",
    body: `Copied ${issueKey} context to clipboard (no active agent)`,
    level: "info",
  });
  return false;
}

export const pasteDraft = pasteContextToAgent;
