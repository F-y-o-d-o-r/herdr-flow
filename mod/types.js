// Shared JSDoc types for the checker (`yarn typecheck`). No runtime code.
// Use in a file: /** @typedef {import("./types.js").Issue} Issue */ (path relative to that file).

/** @typedef {import("gpui-kit").Context} Cx */
/** @typedef {import("gpui-kit").KeyEvent} KeyEvent */
/** @typedef {import("gpui-kit").FocusHandle} FocusHandle */

/**
 * theme() colors. Herdr types them as plain strings while gpui wants `#…`, so they stay `any`.
 * @typedef {Record<string, any>} Theme
 */

/** @typedef {{ filter: string, searching: boolean, at: number }} ListState */

/**
 * One row of a picker list.
 * @typedef {object} Row
 * @property {string} [key] the key shown on its left
 * @property {string} label
 * @property {string} [sub] second line
 * @property {string} [hint] right side
 * @property {string} [meta] right side, second line
 * @property {string} [who] assignee
 * @property {string} [prio] priority
 * @property {boolean} [byKey] an "open by key" row
 * @property {(cx: Cx) => void} act
 */

/** @typedef {{ name: string, path: string, branch: string, key?: string, pullAll?: boolean }} Repo */
/** @typedef {{ folder: string | null, isRepo: boolean, repos: Repo[] }} RepoList */

/** @typedef {{ id: string, name: string }} Person */
/** @typedef {{ how: string, key: string, summary: string, status: string }} IssueLink */

/**
 * An issue as the screens use it.
 * @typedef {object} Issue
 * @property {string} key
 * @property {string} summary
 * @property {string} status
 * @property {string} assignee
 * @property {string | null} assigneeId
 * @property {string} priority
 * @property {string} updated
 * @property {string} created
 * @property {Person | null} reporter
 * @property {string} type
 * @property {string[]} labels
 * @property {IssueLink[]} links
 * @property {string} parent
 * @property {string} sprint
 * @property {string} [description]
 * @property {string} [url]
 */

/** @typedef {{ id?: string, author: string, created: string, body: string, likes?: number, liked?: boolean }} Comment */
/** @typedef {{ progress: string, summary: string, done: boolean, unchecked: number }} Checklist */
/** @typedef {{ id: string, name: string, mime: string, sizeText: string, isImage: boolean }} Attachment */
/** @typedef {{ name: string, text: string }} CustomField */

/** @typedef {{ id: string, name: string, value: string, type: "date" | "text" }} PinnedField */

/**
 * Everything the side panel shows.
 * @typedef {Issue & { comments: Comment[], checklist: Checklist | null, attachments: Attachment[], fields: CustomField[], pinnedFields?: PinnedField[] }} IssueFull
 */

export {};
