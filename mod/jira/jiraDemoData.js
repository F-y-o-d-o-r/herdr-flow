// Invented Jira data for demo mode (screenshots, trying the mod without Jira).
/** @typedef {import("../types.js").Issue} Issue */
/** @typedef {import("./jiraDataSource.js").JiraApi} JiraApi */

/** @param {number} hours */
const ago = (hours) => new Date(Date.now() - hours * 3600 * 1000).toISOString();
const people = {
  me: { id: "demo-me", name: "Alex Rivera" },
  sam: { id: "demo-sam", name: "Sam Lee" },
  kim: { id: "demo-kim", name: "Kim Novak" },
  ola: { id: "demo-ola", name: "Ola Berg" },
};

/**
 * @param {string} key
 * @param {string} summary
 * @param {Partial<Issue>} [extra]
 * @returns {Issue}
 */
const base = (key, summary, extra) => ({
  key,
  summary,
  status: "In Progress",
  assignee: people.me.name,
  assigneeId: people.me.id,
  priority: "Medium",
  updated: ago(3),
  created: ago(72),
  reporter: people.sam,
  type: "Task",
  labels: ["web"],
  links: [],
  parent: "",
  sprint: "Sprint 42",
  ...extra,
});

const ISSUES = [
  base("ACME-311", "Chart tooltips overlap on small screens", {
    priority: "High",
    type: "Bug",
    links: [{ how: "is blocked by", key: "ACME-298", summary: "Upgrade chart library", status: "Code Review" }],
  }),
  base("ACME-305", "Add CSV export to the billing page", {
    status: "Code Review",
    reporter: people.kim,
    updated: ago(20),
  }),
  base("ACME-290", "Dark mode for settings", { status: "To Do", priority: "Low", updated: ago(50) }),
  base("ACME-287", "Rate limit the public API", {
    status: "Ready for Stage",
    labels: ["api", "Backend"],
    reporter: people.ola,
    updated: ago(5),
    links: [{ how: "blocks", key: "ACME-301", summary: "Public API docs", status: "To Do" }],
  }),
  base("ACME-275", "Improve accessibility for modal dialogs", {
    status: "Open",
    priority: "Low",
    assignee: "",
    updated: ago(60),
  }),
];

const DETAILS = {
  description:
    "## Problem\nTooltips on the revenue chart overlap the legend below 400 px.\n\n## Done when\n- Tooltips stay inside the chart\n- Works at 360 px\n\n```\nchart.tooltip.clamp = true\n```",
  comments: [
    { id: "c1", author: people.kim.name, created: ago(4), body: "Reproduced on iPhone SE.", likes: 2, liked: true },
    {
      id: "c2",
      author: people.sam.name,
      created: ago(26),
      body: "Library upgrade (ACME-298) should help.",
      likes: 1,
      liked: false,
    },
  ],
  checklist: { progress: "Checklist: 1/3", summary: "Repro Fix clamp Check 360 px", done: false, unchecked: 2 },
  attachments: [{ id: "d1", name: "tooltip-overlap.png", mime: "image/png", sizeText: "84 KB", isImage: true }],
  fields: [
    { name: "How to test", text: "Open the dashboard at 360 px and hover the revenue chart." },
    { name: "Environment", text: "Stage" },
  ],
};

/** @type {Omit<JiraApi, "transition" | "assign" | "toggleCommentLike">} */
export const demo = {
  myIssues: async () => ISSUES,
  recentIssues: async () => [ISSUES[1], ISSUES[3], base("ACME-270", "Onboarding emails", { status: "Closed" })],
  searchIssues: async (/** @type {string} */ jql) => {
    const isReview =
      (jql.includes("Code Review") || jql.includes("Review")) && !jql.includes("not in") && !jql.includes("!=");
    if (isReview) return [ISSUES[1]];
    if (jql.includes("EMPTY") || jql.includes("Open") || jql.includes("front-end")) return [ISSUES[4]];
    return [ISSUES[0], ISSUES[2], ISSUES[3]];
  },
  issue: async (key) => ({ ...(ISSUES.find((i) => i.key === key) ?? base(key, "Demo issue")), ...DETAILS, url: "" }),
  issueFull: async (key) => ({
    ...(ISSUES.find((i) => i.key === key) ?? base(key, "Demo issue")),
    ...DETAILS,
    url: "",
  }),
  transitions: async () =>
    ["To Do", "In Progress", "Code Review", "Ready for Stage"].map((name, n) => ({ id: String(n), name, to: name })),
  handedBy: async () => people.sam,
  assignable: async (_key, q) => Object.values(people).filter((p) => p.name.toLowerCase().includes(q.toLowerCase())),
  browseUrl: () => "",
  attachmentUrl: () => "",
  cacheImage: async () => null,
};
