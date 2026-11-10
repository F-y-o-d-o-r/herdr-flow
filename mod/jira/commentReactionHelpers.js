// Thumbs-up comment reactions: batched GraphQL queries, property storage and UI pills.
import { div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { ago } from "../timeHelpers.js";
import { richText } from "./sidePanelHelpers.js";

/** @typedef {import("../types.js").Comment} Comment */
/** @typedef {import("../types.js").Theme} Theme */
/** @typedef {import("../types.js").Cx} Cx */
/** @typedef {Record<string, string | null>} ImagePaths */

export const REACTION_PROP = "herdr_likes";

/**
 * Builds a batched GraphQL query for comment reactions on an issue.
 * @param {string | null | undefined} cloudId
 * @param {string | null | undefined} issueId
 * @param {(string | number)[] | null | undefined} commentIds
 * @returns {string | null}
 */
export function buildReactionsGql(cloudId, issueId, commentIds) {
  if (!cloudId || !issueId || !commentIds?.length) return null;
  const ctx = `ari:cloud:platform::site/${cloudId}`;
  const fields = commentIds
    .map(
      (cid, i) =>
        `c${i}: graphStore_userReactedToIssueCommentInverse(id: "ari:cloud:jira:${cloudId}:issue-comment/${issueId}/${cid}", queryContext: "${ctx}") @optIn(to: "GraphStoreUserReactedToIssueComment") { edges { id } }`,
    )
    .join("\n");
  return `query CommentReactions {\n${fields}\n}`;
}

/**
 * Merges GraphQL reaction edges and Jira issue property reactions into a total like count and liked status.
 * @param {{ gqlEdges?: Array<{ id?: string | null }> | null, propValue?: { liked?: string[], unliked?: string[] } | null, myAccountId?: string | null }} options
 * @returns {{ likes: number, liked: boolean }}
 */
export function mergeCommentLikes({ gqlEdges, propValue, myAccountId }) {
  const gqlUsers = (gqlEdges ?? [])
    .map((e) =>
      String(e?.id ?? "")
        .split("/")
        .pop(),
    )
    .filter(Boolean);
  const liked = Array.isArray(propValue?.liked) ? propValue.liked : [];
  const unliked = Array.isArray(propValue?.unliked) ? propValue.unliked : [];
  const users = new Set([...gqlUsers, ...liked].filter((u) => u && !unliked.includes(u)));
  return { likes: users.size, liked: Boolean(myAccountId && users.has(myAccountId)) };
}

/**
 * Calculates the next Jira issue property value when toggling like on a comment.
 * @param {{ liked?: string[], unliked?: string[] } | null | undefined} propValue
 * @param {string} myAccountId
 * @param {boolean} wantLiked
 * @returns {{ liked: string[], unliked: string[] }}
 */
export function nextLikeProp(propValue, myAccountId, wantLiked) {
  const curLiked = Array.isArray(propValue?.liked) ? propValue.liked : [];
  const curUnliked = Array.isArray(propValue?.unliked) ? propValue.unliked : [];
  if (wantLiked) {
    const liked = Array.from(new Set([...curLiked, myAccountId].filter(Boolean)));
    const unliked = curUnliked.filter((id) => id !== myAccountId);
    return { liked, unliked };
  } else {
    const liked = curLiked.filter((id) => id !== myAccountId);
    const unliked = Array.from(new Set([...curUnliked, myAccountId].filter(Boolean)));
    return { liked, unliked };
  }
}

/**
 * Renders a single comment with its author, age, rich text body and thumbs-up reaction pill.
 * @param {Theme} t
 * @param {{ comment: Comment, index: number, gen: number, images: ImagePaths, imageNames: Set<string>, onToggleLike: (c: Comment, cx: Cx) => void }} options
 */
export function commentRow(t, { comment, index, gen, images, imageNames, onToggleLike }) {
  const active = Boolean(comment.liked);
  const count = comment.likes ?? 0;
  const pill = h_flex()
    .id(`jv-like-${gen}-${index}`)
    .px(6)
    .py(1)
    .gap(4)
    .items_center()
    .rounded(4)
    .border(1)
    .border_color(active ? t.accent : t.border)
    .bg(active ? t.selected : t.raised)
    .text_size(11)
    .text_color(active ? t.accent : count > 0 ? t.foreground : t.dim)
    .cursor_pointer()
    .hover((e) => e.bg(t.hover).border_color(t.accent))
    .on_click((_e, cx) => onToggleLike(comment, cx))
    .child(count > 0 ? `👍 ${count}` : "👍");

  return v_flex()
    .gap(2)
    .py(4)
    .border_t(1)
    .border_color(t.border)
    .child(
      div()
        .text_size(11)
        .text_color(t.dim)
        .child(`${comment.author} · ${ago(comment.created)} ago`),
    )
    .child(
      richText(t, {
        id: `jv-c-${gen}-${index}`,
        text: comment.body,
        images,
        imageNames,
        size: 12,
      }),
    )
    .child(h_flex().pt(2).items_center().child(pill));
}
