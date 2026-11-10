# HerdrFlow — agent instructions

Keyboard tools for the [Herdr](https://herdr.dev) desktop app in one mod: a leader key with a
cheat sheet, repo pickers (lazygit, panels), pull all repos, and a Jira workflow.

If the owner's workspace has a parent `AGENTS.md` (shared rules for all their projects), read it too.

## Installing this mod into a user's Herdr setup

When a user asks to add or install this mod:
1. Copy `mod/` to the user's Herdr mods directory:
   `~/.config/herdr-app/mods/herdr-flow/` (or `$HERDR_APP_HOME/mods/herdr-flow/`).
2. Register the leader keybindings in `~/.config/herdr-app/keys.json`:
   Map `"ctrl-a": "mod.open:herdr-flow"` and `"ctrl-;": "mod.open:herdr-flow"` (only if free, or run `python3 scripts/merge-keys.py ~/.config/herdr-app/keys.json`).
3. Validate the mod using `herdr-app check ~/.config/herdr-app/mods/herdr-flow`.
4. Layout blocks (snippets in `scripts/layout-snippets.json`):
   - `router` block: optional floating block, needed only if direct keys (e.g. `cmd-e` → `herdr-flow.nvim-zoom`) are desired;
   - `jira-view` block: optional Jira side panel (`props: { view: "panel" }`);
   - `jira-bar` block: optional top bar counters widget (`props: { view: "bar" }`) with live counts and toast notifications.
   Always ask the user before editing their active layout file.

## Commands

- `yarn lint` — ESLint + Prettier, must be 0 errors / 0 warnings.
- Before any commit: `yarn lint && yarn typecheck && yarn test && yarn check`.
- `yarn typecheck` — TypeScript checks the JavaScript (`tsc -p mod/jsconfig.json`, strict, JSDoc types): 0 errors.
- `yarn test` — `node --test` on pure logic in `tests/`.
- `yarn check` — `herdr-app check mod` (loads and renders the mod once).
- `yarn install:local` — copy `mod/` into `~/.config/herdr-app/mods/herdr-flow` (scripts/install.sh).

## Rules for this repo

- Plain JavaScript only (Herdr loads `.js` as is): no TypeScript files, no build step. Types go in JSDoc
  (`@param`, `@returns`, `@type`); shared ones live in `mod/types.js`. TypeScript only checks them.
- Files ≤ 300 lines; small single-purpose functions; early returns; no "what this block does" comments.
- Pure logic lives in files without `gpui-*` / `herdr` imports so `node --test` can load it.
- No personal or company names in `mod/`, `scripts/`, `README.md`.
- Never `git add` / `commit` / `push` without the owner's explicit "yes"; no destructive commands.
- No AI attribution anywhere in git or GitHub: no `Co-Authored-By: Claude`/other AI, no `Claude-Session:`,
  no "Generated with …" lines in commits, tags or PRs. Commits are authored by the owner only.
- Never open the mod from the shell (`herdr-app do mod.open …`) in the live window: once it docked a
  mod into the layout file. Use `yarn check`, then ask the owner to press keys.
- Every menu row shows its key on the left, the footer lists keys, `/` searches, keys are
  case-sensitive, the Russian layout maps to Latin keys.
- Never edit third-party or Herdr's shipped mods; only call their commands.
- Keep `README.md`, `AGENTS.md`, and all screenshots in `docs/screenshots/` in sync with the code: whenever any screen, menu, keybinding, or displayed data changes, update both the documentation text and the corresponding demo screenshots.

## Demo mode (development only)

For README screenshots: while `~/.config/herdr-app/herdr-flow.demo` exists, every screen shows
invented data (`mod/demo.js`, `mod/jira/jiraDemoData.js`), runs no git network command and no Jira write.
Not a user feature — keep it out of README. To retake shots: create the file, open each screen
through the router (`herdr-app do herdr-flow.<leader|git|repo|pull|jira|list:assigned|card:ACME-311|show:ACME-311>`),
`herdr-app shot`, crop to the card, then remove the file.

## The router block (direct keys)

Herdr's `keys.json` can only open a mod as a whole (`mod.open:herdr-flow` = the leader). A direct
key for one action inside herdr-flow (e.g. `cmd-e` → `herdr-flow.nvim-zoom`) needs the **router**:
an empty floating block in the user's layout (`props: { role: "router" }`, snippet in
`scripts/layout-snippets.json`). It draws nothing and only waits for `herdr-flow.<command>`
(no timers). Commands: `nvim-zoom`, `leader`, `git`, `repo`, `pull`, `jira`, `panel`, `card:<KEY>`,
`list:<id>`, `show:<KEY>`. When installing for someone, tell them it goes into their layout, what it
does, and that without it only such direct keys stop working (the leader works anyway). Never add it
to a layout without asking.

## Files

- `mod/` — the mod (installed as `mods/herdr-flow`). `main.js` picks the screen from props.
- `mod/jira/` — Jira integration: counter bar, menus, card preview, side panel (`jira-view`) with 👍 comment reactions.
- `tests/` — `node --test` for pure modules.
- `scripts/install.sh` — install / update.
- `NOTICE` — the leader screen is a fork of DanielFGray/herdr-config `mods/prefix` (Apache-2.0).
