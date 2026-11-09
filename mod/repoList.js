// Parsing the repo list shell output. Pure.

/** Shell that prints "<name>\t<branch>" for each repo directly inside the current folder. */
export const LIST_REPOS =
  'for d in */; do [ -d "$d/.git" ] || continue; n=${d%/}; printf "%s\\t%s\\n" "$n" "$(git -C "$n" branch --show-current 2>/dev/null)"; done';

/**
 * "<name>\t<branch>" lines -> [{ name, branch }].
 * @param {string} stdout
 * @returns {{ name: string, branch: string }[]}
 */
export function parseRepoList(stdout) {
  return stdout
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [name, branch = ""] = line.split("\t");
      return { name, branch };
    });
}
