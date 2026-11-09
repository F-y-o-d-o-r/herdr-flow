"""Adds herdr-flow's keys to a Herdr keys.json. Usage: merge-keys.py <keys.json>

A key is set when it is free, or when it points at a mod herdr-flow replaces
(leader). Keys that open the other replaced mods directly (git-pick, repo-pick,
pull-all, jira-move) are removed: those screens open from the leader (ctrl-a g,
b, P, J). Anything else is left alone and reported as a conflict.
"""
import json
import os
import sys

WANTED = {
    "ctrl-a": "mod.open:herdr-flow",
    "ctrl-;": "mod.open:herdr-flow",
}
REPLACED = {
    "mod.open:leader": "mod.open:herdr-flow",
    "mod.open:git-pick": None,
    "mod.open:repo-pick": None,
    "mod.open:pull-all": None,
    "mod.open:jira-move": None,
}


def load(path):
    if not os.path.exists(path):
        return {}
    with open(path) as f:
        return json.load(f)


def main(path):
    keys = load(path)
    changed, conflicts = [], []
    for section in keys.values():
        for key, action in list(section.items()):
            if not (isinstance(action, str) and action in REPLACED):
                continue
            if REPLACED[action] is None:
                del section[key]
                changed.append(f"{key}: {action} removed")
            else:
                section[key] = REPLACED[action]
                changed.append(f"{key}: {action} -> {section[key]}")
    glob = keys.setdefault("global", {})
    for key, action in WANTED.items():
        current = glob.get(key)
        if current is None:
            glob[key] = action
            changed.append(f"{key}: {action}")
        elif current != action:
            conflicts.append(f"{key} is {current!r}, left as is")
    with open(path, "w") as f:
        json.dump(keys, f, ensure_ascii=False, indent=2)
        f.write("\n")
    for line in changed:
        print(f"  key  {line}")
    for line in conflicts:
        print(f"  skip {line}")


if __name__ == "__main__":
    main(sys.argv[1])
