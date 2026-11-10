// The repo list drawn by the repo and lazygit screens: key · name · branch.
import { div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { badge } from "../pickerView.js";

/** @typedef {import("../types.js").Repo} Repo */

/**
 * @template {{ key?: string, name: string, branch?: string }} T
 * @param {import("../types.js").Theme} t
 * @param {{ id: string, list: T[], at: number, searching: boolean, error: string | null, loading: boolean, act: (r: T) => void }} view
 */
export function repoRows(t, { id, list, at, searching, error, loading, act }) {
  return v_flex()
    .id(id)
    .h(380)
    .overflow_y_scrollbar()
    .gap(1)
    .when(Boolean(error), (e) => e.child(div().p(8).text_color(t.dim).child(error)))
    .when(loading && !error, (e) => e.child(div().p(8).text_color(t.dim).child("Looking for repos…")))
    .children(
      list.map((r, i) =>
        h_flex()
          .id(`${id}-${r.key}-${r.name}`)
          .h(28)
          .px(8)
          .gap(8)
          .items_center()
          .rounded(6)
          .cursor_pointer()
          .when(i === at, (e) => e.bg(t.selected))
          .hover((e) => e.bg(t.hover))
          .on_click(() => act(r))
          .child(badge(t, r.key, searching))
          .child(div().flex_1().truncate().child(r.name))
          .child(
            div()
              .max_w(200)
              .truncate()
              .text_size(11)
              .text_color(t.dim)
              .child(r.branch || ""),
          ),
      ),
    );
}

/**
 * Repos whose name contains the filter.
 * @param {Repo[] | null} repos
 * @param {string} filter
 * @returns {Repo[]}
 */
export const filterRepos = (repos, filter) =>
  (repos ?? []).filter((r) => r.name.toLowerCase().includes(filter.toLowerCase()));
