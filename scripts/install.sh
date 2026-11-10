#!/bin/sh
# Installs or updates herdr-flow into the Herdr app's home (~/.config/herdr-app, or $HERDR_APP_HOME).
# Copies mod/ to mods/herdr-flow, adds the leader keys (only free ones, or ones pointing at the mods it
# replaces), and prints the layout blocks to add by hand. Never touches herdr-flow.bindings.json
# or herdr-flow.netrc.
set -eu
HERE=$(cd "$(dirname "$0")/.." && pwd)
HOME_DIR=${HERDR_APP_HOME:-"$HOME/.config/herdr-app"}
TARGET="$HOME_DIR/mods/herdr-flow"

mkdir -p "$TARGET"
rsync -a --delete --exclude '*.d.ts' --exclude 'jsconfig.json' "$HERE/mod/" "$TARGET/"
echo "mod   -> $TARGET"

echo "keys  -> $HOME_DIR/keys.json"
python3 "$HERE/scripts/merge-keys.py" "$HOME_DIR/keys.json"

if command -v herdr-app >/dev/null 2>&1; then herdr-app check "$TARGET" | tail -1; fi

cat <<MSG

Optional layout blocks for your own (cloned) layout, see README "Install":
- router: invisible, needed only for direct keys like cmd-e -> herdr-flow.nvim-zoom;
- jira-view: the Jira side panel;
- jira-bar: Jira counters in the top bar with toast alerts.
$(cat "$HERE/scripts/layout-snippets.json")

Jira: create $HOME_DIR/herdr-flow.netrc (README "Jira login").
MSG
