// Jira Cloud REST through curl with a netrc file: <app home>/herdr-flow.netrc
// ("machine <site>.atlassian.net login <email> password <API token>", chmod 600).
// The site address is the netrc's machine.
import { appHome, exec, readTextFile } from "herdr";
/** @typedef {import("../types.js").Issue} Issue */
/** @typedef {import("../types.js").IssueFull} IssueFull */
/** @typedef {import("../types.js").Attachment} Attachment */
/** @typedef {import("../types.js").Person} Person */
/** @typedef {{ base: string, netrc: string, sprintField: string | null | undefined, cloudId?: string | null, myId?: string | null }} Site */

import {
  adfText,
  attachmentsFrom,
  checklistFrom,
  customFieldsFrom,
  issueRow,
  personOf,
  pinnedFieldsFrom,
} from "./jiraFormatHelpers.js";
import { REACTION_PROP, buildReactionsGql, mergeCommentLikes, nextLikeProp } from "./commentReactionHelpers.js";
import { COUNTERS_FILE, parsePinnedFieldConfigs } from "./counterHelpers.js";

const NETRC_NAME = "herdr-flow.netrc";
const netrcPath = () => `${appHome()}/${NETRC_NAME}`;
const ASSIGNED_JQL = "assignee = currentUser() AND statusCategory != Done AND status != Reject ORDER BY updated DESC";
const HISTORY_JQL =
  "issuekey in issueHistory() OR status changed BY currentUser() AFTER -14d" +
  " OR assignee changed BY currentUser() AFTER -14d ORDER BY updated DESC";
const BASE_FIELDS = ["summary", "status", "assignee", "priority", "updated", "reporter", "created", "issuetype"];
const MORE_FIELDS = ["labels", "components", "issuelinks", "parent", "subtasks"];
/** @type {Site | null} */
let site = null;

/** The message to show when there is no login file. */
export const NO_LOGIN = `No Jira login: create ~/.config/herdr-app/${NETRC_NAME} (see README)`;

/** @returns {Promise<Site>} */
async function connection() {
  if (site) return site;
  const r = await exec("awk", ['$1 == "machine" { print $2; exit }', netrcPath()]).catch(() => null);
  const host = r?.code === 0 ? r.stdout.trim() : "";
  if (!host) throw new Error(NO_LOGIN);
  site = { base: `https://${host}`, netrc: netrcPath(), sprintField: undefined };
  return site;
}

/**
 * @param {any} json Jira's error JSON
 * @param {number} status
 */
function errorText(json, status) {
  return json?.errorMessages?.join("; ") || Object.values(json?.errors ?? {}).join("; ") || `HTTP ${status}`;
}

/**
 * One REST call; parsed JSON, or null for an empty body.
 * @param {string} method
 * @param {string} path
 * @param {object} [body]
 * @returns {Promise<any>} Jira's raw JSON
 */
async function call(method, path, body) {
  const { base, netrc } = await connection();
  const args = ["-s", "-X", method, "--netrc-file", netrc, "-H", "Accept: application/json", "-w", "\n%{http_code}"];
  if (body) args.push("-H", "Content-Type: application/json", "-d", JSON.stringify(body));
  const r = await exec("curl", [...args, base + path], { timeout: 20000 });
  if (r.code !== 0) throw new Error(`curl failed (${r.code})`);
  const cut = r.stdout.lastIndexOf("\n");
  const status = Number(r.stdout.slice(cut + 1));
  let json = null;
  try {
    json = cut > 0 ? JSON.parse(r.stdout.slice(0, cut)) : null;
  } catch {
    json = null;
  }
  if (status >= 300) throw new Error(errorText(json, status));
  return json;
}

/** This site's Sprint field id (by name), cached. */
async function sprintField() {
  const s = await connection();
  if (s.sprintField !== undefined) return s.sprintField;
  const fields = await call("GET", "/rest/api/3/field").catch(() => []);
  s.sprintField = fields.find((/** @type {any} */ f) => /^(sprint|спринт)$/i.test(f.name))?.id ?? null;
  return s.sprintField;
}

/** Lazily fetches and caches cloudId and currentUser accountId on site. */
async function siteIdentity() {
  const s = await connection();
  if (s.cloudId === undefined || s.myId === undefined) {
    const [c, m] = await Promise.all([
      s.cloudId !== undefined
        ? s.cloudId
        : call("GET", "/_edge/tenant_info")
            .then((r) => r?.cloudId ?? null)
            .catch(() => null),
      s.myId !== undefined
        ? s.myId
        : call("GET", "/rest/api/3/myself")
            .then((r) => r?.accountId ?? null)
            .catch(() => null),
    ]);
    s.cloudId = c;
    s.myId = m;
  }
  return { cloudId: s.cloudId, myId: s.myId };
}

async function fieldList() {
  const sprint = await sprintField();
  return [...BASE_FIELDS, ...MORE_FIELDS, ...(sprint ? [sprint] : [])];
}

/**
 * @param {string} jql
 * @param {number} maxResults
 * @returns {Promise<Issue[]>}
 */
async function search(jql, maxResults) {
  const fields = await fieldList();
  const r = await call("POST", "/rest/api/3/search/jql", { jql, fields, maxResults });
  return (r?.issues ?? []).map((/** @type {any} */ i) => issueRow(i, { sprintField: site.sprintField }));
}

export const myIssues = () => search(ASSIGNED_JQL, 50);
export const recentIssues = () => search(HISTORY_JQL, 30);
export const searchIssues = (/** @type {string} */ jql, max = 50) => search(jql, max);
export const browseUrl = (/** @type {string} */ key) => `${site?.base ?? ""}/browse/${key}`;
const issuePath = (/** @type {string} */ key, rest = "") => `/rest/api/3/issue/${encodeURIComponent(key)}${rest}`;

/**
 * One issue with its description as text.
 * @param {string} key
 * @returns {Promise<Issue>}
 */
export async function issue(key) {
  const fields = await fieldList();
  const r = await call("GET", issuePath(key, `?fields=${[...fields, "description"].join(",")}`));
  const row = issueRow(r, { sprintField: site.sprintField });
  return { ...row, description: adfText(r.fields?.description).trim(), url: browseUrl(r.key) };
}

/**
 * What the side panel shows: the issue with every field, comments, checklist, attachments.
 * @param {string} key
 * @returns {Promise<IssueFull>}
 */
export async function issueFull(key) {
  await sprintField();
  const [r, c, list, ident, cfgText] = await Promise.all([
    call("GET", issuePath(key, "?fields=*all&expand=names")),
    call("GET", issuePath(key, "/comment?orderBy=-created&maxResults=50&expand=properties")).catch(() => null),
    call("GET", issuePath(key, "/properties/checklist")).catch(() => null),
    siteIdentity(),
    readTextFile(`${appHome()}/${COUNTERS_FILE}`).catch(() => null),
  ]);
  const rawComments = c?.comments ?? [];
  const gqlQuery =
    rawComments.length > 0
      ? buildReactionsGql(
          ident.cloudId,
          r?.id,
          rawComments.map((/** @type {any} */ m) => m.id),
        )
      : null;
  const gqlRes = gqlQuery ? await call("POST", "/gateway/api/graphql", { query: gqlQuery }).catch(() => null) : null;
  const comments = rawComments.map((/** @type {any} */ m, /** @type {number} */ idx) => {
    const prop = (m.properties ?? []).find((/** @type {any} */ p) => p.key === REACTION_PROP)?.value;
    const gqlEdges = gqlRes?.data?.[`c${idx}`]?.edges;
    return {
      id: String(m.id ?? ""),
      author: m.author?.displayName ?? "",
      created: m.created,
      body: adfText(m.body).trim(),
      ...mergeCommentLikes({ gqlEdges, propValue: prop, myAccountId: ident.myId }),
    };
  });
  const pinnedFields = pinnedFieldsFrom(r?.fields, r?.names, parsePinnedFieldConfigs(cfgText));
  const fields = customFieldsFrom(r?.fields, r?.names).filter((f) => !pinnedFields.some((p) => p.name === f.name));
  return {
    ...issueRow(r, { sprintField: site?.sprintField }),
    description: adfText(r?.fields?.description).trim(),
    url: browseUrl(r?.key),
    comments,
    checklist: checklistFrom(list?.value),
    attachments: attachmentsFrom(r?.fields?.attachment),
    fields,
    pinnedFields,
  };
}

const CACHE = "data/herdr-flow/cache"; // under the app home: image() paths are relative to it

/** An attachment's address in Jira (opens in the browser with the user's Jira session). */
export const attachmentUrl = (/** @type {string} */ id) => `${site?.base ?? ""}/rest/api/3/attachment/content/${id}`;

/**
 * Downloads an image attachment into the mod's cache once; its path for image(), or null.
 * @param {Attachment} att
 * @returns {Promise<string | null>}
 */
export async function cacheImage(att) {
  const { netrc } = await connection();
  const file = `${CACHE}/${att.id}-${att.name.replace(/[^\w.-]/g, "_")}`;
  const full = `${appHome()}/${file}`;
  if ((await exec("test", ["-s", full]).catch(() => null))?.code === 0) return file;
  await exec("mkdir", ["-p", `${appHome()}/${CACHE}`]);
  const r = await exec("curl", ["-s", "-L", "--netrc-file", netrc, "-o", full, attachmentUrl(att.id)], {
    timeout: 30000,
  });
  return r.code === 0 ? file : null;
}

/**
 * @param {string} key
 * @returns {Promise<{ id: string, name: string, to: string }[]>}
 */
export async function transitions(key) {
  const r = await call("GET", issuePath(key, "/transitions"));
  return (r?.transitions ?? []).map((/** @type {any} */ t) => ({ id: t.id, name: t.name, to: t.to?.name ?? t.name }));
}

export const transition = (/** @type {string} */ key, /** @type {string} */ id) =>
  call("POST", issuePath(key, "/transitions"), { transition: { id } });
export const assign = (/** @type {string} */ key, /** @type {string | null} */ accountId) =>
  call("PUT", issuePath(key, "/assignee"), { accountId });
export const updateField = (/** @type {string} */ key, /** @type {string} */ fieldId, /** @type {unknown} */ value) =>
  call("PUT", issuePath(key), { fields: { [fieldId]: value } });

/**
 * Who handed the issue to its current assignee (the last assignee change), or null.
 * @param {string} key
 * @returns {Promise<Person | null>}
 */
export async function handedBy(key) {
  const page = (/** @type {number} */ at) => issuePath(key, `/changelog?startAt=${at}&maxResults=100`);
  let r = await call("GET", page(0));
  if (r?.total > 100) r = await call("GET", page(r.total - 100));
  const last = (r?.values ?? [])
    .flatMap((/** @type {any} */ h) => h.items.filter((/** @type {any} */ it) => it.field === "assignee"))
    .at(-1);
  return last?.from ? { id: last.from, name: last.fromString } : null;
}

/**
 * People who can be assigned to the issue, matching `query`.
 * @param {string} key
 * @param {string} query
 * @returns {Promise<Person[]>}
 */
export async function assignable(key, query) {
  const q = `issueKey=${encodeURIComponent(key)}&query=${encodeURIComponent(query)}&maxResults=20`;
  const r = await call("GET", `/rest/api/3/user/assignable/search?${q}`);
  return (r ?? []).map(personOf);
}

/**
 * Toggles the user's thumbs-up reaction on a comment.
 * @param {string} commentId
 * @param {boolean} wantLiked
 * @returns {Promise<unknown>}
 */
export async function toggleCommentLike(commentId, wantLiked) {
  const { myId } = await siteIdentity();
  if (!myId || !commentId) return null;
  const path = `/rest/api/3/comment/${encodeURIComponent(commentId)}/properties/${REACTION_PROP}`;
  const cur = await call("GET", path).catch(() => null);
  return call("PUT", path, nextLikeProp(cur?.value, myId, wantLiked));
}
