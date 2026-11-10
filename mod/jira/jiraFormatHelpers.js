// Turning Jira's JSON into what the screens show, and the agent's first message. Pure.

/** @typedef {import("../types.js").Issue} Issue */
/** @typedef {import("../types.js").IssueLink} IssueLink */
/** @typedef {import("../types.js").Person} Person */
/** @typedef {import("../types.js").Checklist} Checklist */
/** @typedef {import("../types.js").Attachment} Attachment */
/** @typedef {import("../types.js").CustomField} CustomField */
/** @typedef {{ text?: string, image?: string }} TextPart */

/**
 * @param {any} u Jira's user JSON
 * @returns {Person | null}
 */
const person = (u) => (u ? { id: u.accountId, name: u.displayName } : null);

/**
 * Atlassian Document Format -> readable markdown-ish text.
 * @param {any} node an ADF node or a plain string
 * @returns {string}
 */
export function adfText(node) {
  if (!node) return "";
  if (typeof node === "string") return node;
  const kids = (node.content ?? []).map(adfText).join("");
  switch (node.type) {
    case "text":
      return node.text ?? "";
    case "hardBreak":
      return "\n";
    case "inlineCard":
    case "blockCard":
    case "embedCard":
      return node.attrs?.url ?? "";
    case "mention":
    case "emoji":
      return node.attrs?.text ?? "";
    case "listItem":
      return `- ${kids.trim()}\n`;
    case "heading":
      return `\n${"#".repeat(node.attrs?.level ?? 2)} ${kids}\n`;
    case "codeBlock":
      return `\n\`\`\`\n${kids}\n\`\`\`\n`;
    case "paragraph":
    case "bulletList":
    case "orderedList":
      return `${kids}\n`;
    case "rule":
      return "\n---\n";
    case "media":
      return `\n[[image:${node.attrs?.alt ?? node.attrs?.id ?? "file"}]]\n`;
    default:
      return kids;
  }
}

/**
 * @param {any} issue Jira's linked issue JSON
 * @param {string} how
 * @returns {IssueLink}
 */
const linked = (issue, how) => ({
  how,
  key: issue?.key,
  summary: issue?.fields?.summary ?? "",
  status: issue?.fields?.status?.name ?? "",
});

/**
 * Linked issues (blocks / is blocked by / relates to…) and subtasks.
 * @param {any} fields Jira's issue fields JSON
 * @returns {IssueLink[]}
 */
export function issueLinks(fields) {
  const links = (fields?.issuelinks ?? []).map((/** @type {any} */ l) =>
    l.outwardIssue ? linked(l.outwardIssue, l.type.outward) : linked(l.inwardIssue, l.type.inward),
  );
  const subtasks = (fields?.subtasks ?? []).map((/** @type {any} */ t) => linked(t, "subtask"));
  return [...links, ...subtasks].filter((l) => l.key);
}

/**
 * One issue as the screens use it.
 * @param {any} i Jira's issue JSON
 * @param {{ sprintField?: string | null }} [options] the site's Sprint field id
 * @returns {Issue}
 */
export function issueRow(i, { sprintField } = {}) {
  const f = i.fields ?? {};
  return {
    key: i.key,
    summary: f.summary ?? "",
    status: f.status?.name ?? "",
    assignee: f.assignee?.displayName ?? "unassigned",
    assigneeId: f.assignee?.accountId ?? null,
    priority: f.priority?.name ?? "",
    updated: f.updated ?? "",
    created: f.created ?? "",
    reporter: person(f.reporter),
    type: f.issuetype?.name ?? "",
    labels: [...(f.labels ?? []), ...(f.components ?? []).map((/** @type {any} */ c) => c.name)],
    links: issueLinks(f),
    parent: f.parent ? `${f.parent.key} ${f.parent.fields?.summary ?? ""}` : "",
    sprint: ((sprintField && f[sprintField]) || []).map((/** @type {any} */ s) => s.name).at(-1) ?? "",
  };
}

export const personOf = person;

/**
 * The checklist app's "checklist" issue property -> { progress, summary, done, unchecked }.
 * The app keeps items and their states to itself; `summary` is its one-line text of the items.
 * @param {any} value the property's JSON value
 * @returns {Checklist | null}
 */
export function checklistFrom(value) {
  if (!value?.hasItems) return null;
  return {
    progress: value.progressText ?? "",
    summary: String(value.items ?? "").trim(),
    done: Boolean(value.allItemsCompleted),
    unchecked: value.uncheckedItems ?? 0,
  };
}

const IMAGE_MARK = /\[\[image:([^\]]+)\]\]/g;

/**
 * Text with [[image:name]] marks -> [{ text } | { image }] in order.
 * @param {string} text
 * @returns {TextPart[]}
 */
export function splitImages(text) {
  /** @type {TextPart[]} */
  const parts = [];
  let last = 0;
  for (const m of text.matchAll(IMAGE_MARK)) {
    if (m.index > last) parts.push({ text: text.slice(last, m.index) });
    parts.push({ image: m[1] });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });
  return parts;
}

/**
 * @param {number} bytes
 * @returns {string}
 */
function sizeText(bytes) {
  if (bytes >= 1024 * 1024) return `${Math.round(bytes / 1024 / 1024)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/**
 * Jira's attachment list -> [{ id, name, mime, sizeText, isImage }].
 * @param {any[]} list Jira's attachment JSON
 * @returns {Attachment[]}
 */
export function attachmentsFrom(list) {
  return (list ?? []).map((a) => ({
    id: a.id,
    name: a.filename,
    mime: a.mimeType ?? "",
    sizeText: sizeText(a.size ?? 0),
    isImage: /^image\//.test(a.mimeType ?? ""),
  }));
}

const HIDDEN_FIELD = /rank|рейтинг|development|warning|\[chart\]|sprint|спринт|checklist|flagged|epic link|team/i;

/**
 * @param {any} value a custom field's JSON value
 * @returns {string}
 */
function fieldText(value) {
  if (typeof value === "string") return value === "{}" ? "" : value;
  if (typeof value === "number") return String(value);
  if (value?.type === "doc") return adfText(value).trim();
  if (Array.isArray(value)) return value.map(fieldText).filter(Boolean).join(", ");
  return value?.value ?? value?.name ?? value?.displayName ?? "";
}

/**
 * Filled custom fields worth showing, by their Jira names: [{ name, text }].
 * @param {Record<string, any>} fields Jira's issue fields JSON
 * @param {Record<string, string>} names field id -> name
 * @returns {CustomField[]}
 */
export function customFieldsFrom(fields, names) {
  return Object.entries(fields ?? {})
    .filter(([id, value]) => id.startsWith("customfield_") && value !== null && !HIDDEN_FIELD.test(names?.[id] ?? id))
    .map(([id, value]) => ({ name: names?.[id] ?? id, text: fieldText(value) }))
    .filter((f) => f.text && !/^\d+\|[a-z0-9]+:/.test(f.text));
}

const projectOf = (/** @type {string} */ key) => key?.split("-")[0] ?? null;

/**
 * The project a bare number means: the current branch's, else the most common among my issues.
 * @param {{ currentKey?: string | null, issues?: { key: string }[] }} options
 * @returns {string | null}
 */
export function defaultProject({ currentKey, issues }) {
  if (currentKey) return projectOf(currentKey);
  /** @type {Map<string, number>} */
  const counts = new Map();
  for (const i of issues ?? []) counts.set(projectOf(i.key), (counts.get(projectOf(i.key)) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

const MAX_DESCRIPTION = 6000;

/**
 * The first message for an agent taking the issue.
 * @param {Issue} i
 * @returns {string}
 */
export function agentPrompt(i) {
  const desc =
    i.description?.length > MAX_DESCRIPTION
      ? `${i.description.slice(0, MAX_DESCRIPTION)}\n…(cut, see the link)`
      : i.description;
  return [
    `Jira task ${i.key}: ${i.summary}`,
    `Status: ${i.status}. Link: ${i.url}`,
    "",
    desc || "(no description)",
    "",
    "Analyze this task. Work in the current folder: find which repo(s) it belongs to and update the",
    "main branch there. Create a branch for it named by this project's rules (AGENTS.md, CLAUDE.md,",
    ".claude/commands); if there are none, name it like the existing branches.",
    "Then give me your analysis and a plan. Do not start coding yet.",
  ].join("\n");
}

/**
 * @param {string | undefined | null} priority
 * @returns {{ icon: string, colorKey: "ansi1" | "ansi3" | "ansi4" | "muted" } | null}
 */
export function priorityMeta(priority) {
  if (!priority) return null;
  const text = priority.toLowerCase();
  if (/highest|blocker|critical/.test(text)) return { icon: "⇈", colorKey: "ansi1" };
  if (/high/.test(text)) return { icon: "↑", colorKey: "ansi1" };
  if (/lowest/.test(text)) return { icon: "⇊", colorKey: "muted" };
  if (/low/.test(text)) return { icon: "↓", colorKey: "ansi4" };
  return { icon: "=", colorKey: "ansi3" };
}

/**
 * @param {string | undefined | null} issueType
 * @returns {{ icon: string, colorKey: "ansi1" | "ansi2" | "ansi4" | "ansi5" } | null}
 */
export function issueTypeMeta(issueType) {
  if (!issueType) return null;
  const text = issueType.toLowerCase();
  if (/bug|ошиб|баг/.test(text)) return { icon: "●", colorKey: "ansi1" };
  if (/story|истор/.test(text)) return { icon: "◈", colorKey: "ansi2" };
  if (/epic|эпик/.test(text)) return { icon: "⚡", colorKey: "ansi5" };
  return { icon: "✓", colorKey: "ansi4" };
}

/**
 * @param {string | undefined | null} status
 * @returns {"ansi1" | "ansi2" | "ansi3" | "accent" | "foreground"}
 */
export function statusColorKey(status) {
  if (!status) return "foreground";
  const text = status.toLowerCase();
  if (/paused|reject|blocked/.test(text)) return "ansi1";
  if (/review|test|qa|reproduce|analyze/.test(text)) return "ansi3";
  if (/done|deployed|закрыт|ready/.test(text)) return "ansi2";
  if (/progress|работ/.test(text)) return "accent";
  return "foreground";
}
