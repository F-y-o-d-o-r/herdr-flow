// The router: an empty floating block (props { role: "router" }), always on screen and drawing
// nothing, so it receives `herdr-flow.<command>` from keys.json. Herdr's keys can only open a mod
// as a whole (mod.open), so a direct key for one action inside herdr-flow goes through here.
// Commands: nvim-zoom (herdr-nvim's nvim + tree, nvim pane zoomed), leader, git, repo, pull, jira,
// open-next (the screen the leader just asked for), panel (toggle the Jira side panel), card:<KEY>,
// list:<assigned|history>, show:<KEY>, bots-save (snapshot agents), bots-restore (restore agents).
// Also manages startup auto-restore of bot/program sessions and event-driven session snapshots.
import { div } from "gpui-kit";
import { agents, checking, exec, nextCommand, panes, run, setShared } from "herdr";
import { MOD, openNvimZoomed, openScreenNow } from "./leader/leaderActionHelpers.js";
import { PANEL } from "./jira/issueActionSteps.js";
import { autoRestoreBots, runStartupRestore, syncBotSnapshot } from "./botSessionHelpers.js";

const SCREEN_COMMANDS = new Set(["leader", "git", "repo", "pull", "jira"]);
const SNAPSHOT_DEBOUNCE_MS = 800;

/** The leader asked for a screen while closing its popup: open it once that close has applied. */
async function openNextAfterClose() {
  await exec("sleep", ["0.05"]); // no setTimeout in mods
  run("mod.open", { name: MOD });
}

/** @param {string} command */
async function routeCommand(command) {
  if (command === "bots-save") return syncBotSnapshot(true);
  if (command === "bots-restore") return autoRestoreBots(true);
  if (command === "nvim-zoom") return openNvimZoomed();
  if (command === "open-next") return openNextAfterClose();
  if (command === "panel") return run("layout.toggle", { id: PANEL.block });
  const [verb, key] = command.split(":");
  if (verb === "card" && key) return openScreenNow("jira", { card: key });
  if (verb === "list" && key) return openScreenNow("jira", { list: key });
  if (verb === "show" && key) {
    setShared(PANEL.key, key);
    return run("layout.show", { id: PANEL.block });
  }
  if (SCREEN_COMMANDS.has(command)) openScreenNow(command);
}

/** @returns {string} */
function paneSignature() {
  const paneSig = panes()
    .map((p) => `${p.pane}:${p.terminal ?? ""}:${p.cwd ?? ""}:${p.program?.key ?? ""}:${p.program?.name ?? ""}`)
    .join("|");
  const agentSig = agents()
    .map((a) => `${a.pane}:${a.app ?? ""}`)
    .join("|");
  return `${paneSig}#${agentSig}`;
}

export class RouterView {
  /** @param {import("./types.js").Cx} cx */
  init(cx) {
    /** @type {string} */
    this.lastSig = "";
    this.syncGen = 0;
    if (checking()) return;

    cx.spawn(async (asyncCx) => {
      await runStartupRestore(asyncCx).catch(() => null);
    });

    cx.spawn(async () => {
      for (;;) {
        const command = await nextCommand().catch(() => null);
        if (command) await routeCommand(command).catch(() => null);
      }
    });
  }

  /** @param {import("./types.js").Cx} cx */
  render(cx) {
    if (!checking()) {
      const sig = paneSignature();
      if (sig !== this.lastSig) {
        this.lastSig = sig;
        const gen = ++this.syncGen;
        cx.timer.after(SNAPSHOT_DEBOUNCE_MS, () => {
          if (gen === this.syncGen) void syncBotSnapshot().catch(() => null);
        });
      }
    }
    return div();
  }

  async onClose() {
    if (!checking()) await syncBotSnapshot().catch(() => null);
  }
}
