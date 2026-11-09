#!/bin/sh
# Sheepdog on/off for the herdr-flow leader (ctrl-a u): daemon + menu-bar app (microphone) + Herdr panel.
# Runs detached, so it finishes after the leader popup closes. No login autostart.
export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.local/bin:$PATH"
# terminal-notifier: shows as its own app and a click focuses Herdr (osascript shows as Script Editor).
notify() {
  terminal-notifier -title Sheepdog -message "$1" -group herdr-sheepdog -activate dev.herdr.app >/dev/null 2>&1 \
    || osascript -e "display notification \"$1\" with title \"Sheepdog\"" >/dev/null 2>&1
}
if sheepdog status >/dev/null 2>&1; then
  sheepdog stop >/dev/null 2>&1
  osascript -e 'quit app "Sheepdog"' >/dev/null 2>&1
  herdr-app do layout.hide '{"id":"sheepdog"}' >/dev/null 2>&1
  notify off
else
  if ! sheepdog start >/dev/null 2>&1; then
    notify "could not start — run: sheepdog start"
    exit 1
  fi
  open -g -a Sheepdog >/dev/null 2>&1
  herdr-app do layout.show '{"id":"sheepdog"}' >/dev/null 2>&1
  notify "on — cmd-shift-s to talk"
fi
