import { test } from "node:test";
import assert from "node:assert/strict";
import {
  REACTION_PROP,
  buildReactionsGql,
  mergeCommentLikes,
  nextLikeProp,
} from "../mod/jira/commentReactionHelpers.js";

test("buildReactionsGql: returns null on missing or empty arguments", () => {
  assert.equal(buildReactionsGql(null, "10001", ["c1"]), null);
  assert.equal(buildReactionsGql("site-abc", "", ["c1"]), null);
  assert.equal(buildReactionsGql("site-abc", "10001", []), null);
  assert.equal(buildReactionsGql("site-abc", "10001", null), null);
});

test("buildReactionsGql: builds batched query for comment ids", () => {
  const gql = buildReactionsGql("site-xyz", "10042", ["101", "102"]);
  assert.ok(gql?.startsWith("query CommentReactions {"));
  assert.ok(
    gql.includes(
      'c0: graphStore_userReactedToIssueCommentInverse(id: "ari:cloud:jira:site-xyz:issue-comment/10042/101", queryContext: "ari:cloud:platform::site/site-xyz")',
    ),
  );
  assert.ok(
    gql.includes(
      'c1: graphStore_userReactedToIssueCommentInverse(id: "ari:cloud:jira:site-xyz:issue-comment/10042/102", queryContext: "ari:cloud:platform::site/site-xyz")',
    ),
  );
  assert.ok(gql.includes('@optIn(to: "GraphStoreUserReactedToIssueComment")'));
});

test("mergeCommentLikes: handles empty inputs", () => {
  const res = mergeCommentLikes({});
  assert.deepEqual(res, { likes: 0, liked: false });
});

test("mergeCommentLikes: parses GraphQL user edges", () => {
  const edges = [{ id: "ari:cloud:platform::user/user-1" }, { id: "ari:cloud:platform::user/user-2" }];
  const res = mergeCommentLikes({ gqlEdges: edges, myAccountId: "user-1" });
  assert.deepEqual(res, { likes: 2, liked: true });

  const resOther = mergeCommentLikes({ gqlEdges: edges, myAccountId: "user-99" });
  assert.deepEqual(resOther, { likes: 2, liked: false });
});

test("mergeCommentLikes: merges property liked and unliked overrides", () => {
  const edges = [{ id: "ari:cloud:platform::user/user-1" }, { id: "ari:cloud:platform::user/user-2" }];
  const propValue = { liked: ["user-3"], unliked: ["user-1"] };

  const res = mergeCommentLikes({
    gqlEdges: edges,
    propValue,
    myAccountId: "user-1",
  });
  // user-1 was unliked, user-2 from gql, user-3 from liked
  assert.equal(res.likes, 2);
  assert.equal(res.liked, false);

  const res3 = mergeCommentLikes({
    gqlEdges: edges,
    propValue,
    myAccountId: "user-3",
  });
  assert.equal(res3.liked, true);
});

test("mergeCommentLikes: dedupes user IDs between GraphQL and properties", () => {
  const edges = [{ id: "ari:cloud:platform::user/user-1" }];
  const propValue = { liked: ["user-1", "user-2"] };
  const res = mergeCommentLikes({ gqlEdges: edges, propValue });
  assert.equal(res.likes, 2);
});

test("nextLikeProp: toggles like on", () => {
  assert.equal(REACTION_PROP, "herdr_likes");
  const initial = { liked: ["user-1"], unliked: ["me"] };
  const next = nextLikeProp(initial, "me", true);
  assert.deepEqual(next, { liked: ["user-1", "me"], unliked: [] });

  // Adding already liked user is deduped
  const next2 = nextLikeProp(next, "me", true);
  assert.deepEqual(next2, { liked: ["user-1", "me"], unliked: [] });
});

test("nextLikeProp: toggles like off", () => {
  const initial = { liked: ["user-1", "me"], unliked: [] };
  const next = nextLikeProp(initial, "me", false);
  assert.deepEqual(next, { liked: ["user-1"], unliked: ["me"] });

  // Removing again dedupes in unliked
  const next2 = nextLikeProp(next, "me", false);
  assert.deepEqual(next2, { liked: ["user-1"], unliked: ["me"] });
});

test("nextLikeProp: handles null and empty initial properties", () => {
  const on = nextLikeProp(null, "me", true);
  assert.deepEqual(on, { liked: ["me"], unliked: [] });

  const off = nextLikeProp(undefined, "me", false);
  assert.deepEqual(off, { liked: [], unliked: ["me"] });
});
