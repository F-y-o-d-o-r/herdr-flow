// The Jira data the screens use: the real API, or invented data in demo mode (writes do nothing).
import { notify } from "herdr";
import { isDemo } from "../demo.js";
import * as api from "./jiraApi.js";
import { demo } from "./jiraDemoData.js";

/** @typedef {import("../types.js").Issue} Issue */
/** @typedef {import("../types.js").IssueFull} IssueFull */
/** @typedef {import("../types.js").Person} Person */
/** @typedef {import("../types.js").Attachment} Attachment */
/** @typedef {{ id: string, name: string, to: string }} Transition */

/**
 * What the screens ask of Jira (the real API or demo data).
 * @typedef {object} JiraApi
 * @property {() => Promise<Issue[]>} myIssues
 * @property {() => Promise<Issue[]>} recentIssues
 * @property {(jql: string, max?: number) => Promise<Issue[]>} searchIssues
 * @property {(key: string) => Promise<Issue>} issue
 * @property {(key: string) => Promise<IssueFull>} issueFull
 * @property {(key: string) => Promise<Transition[]>} transitions
 * @property {(key: string, id: string) => Promise<unknown>} transition
 * @property {(key: string, accountId: string) => Promise<unknown>} assign
 * @property {(key: string) => Promise<Person | null>} handedBy
 * @property {(key: string, query: string) => Promise<Person[]>} assignable
 * @property {(key: string) => string} browseUrl
 * @property {(id: string) => string} attachmentUrl
 * @property {(att: Attachment) => Promise<string | null>} cacheImage
 * @property {(commentId: string, wantLiked: boolean) => Promise<unknown>} toggleCommentLike
 */
/** @typedef {JiraApi & { demo: boolean }} JiraSource */

const demoWrite = async () => notify({ title: "herdr-flow", body: "demo mode: nothing changed", level: "info" });

/**
 * The data source for one screen open.
 * @returns {Promise<JiraSource>}
 */
export async function jiraSource() {
  if (await isDemo())
    return { ...demo, transition: demoWrite, assign: demoWrite, toggleCommentLike: demoWrite, demo: true };
  return { ...api, demo: false };
}
