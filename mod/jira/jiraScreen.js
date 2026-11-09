// The Jira popup (leader J): a list of issues, then one issue's card with what to do.
//   a Assigned: open issues on me (not done, not Reject), the current branch's first.
//   h History: issues I viewed, moved or reassigned in the last 14 days.
//   /1307 or /KEY-1307: any issue by key (bare number: current branch's or my usual project).
// Card: preview, then t Take · m Move (then Reassign) · r Reassign · o browser · O side panel.
import { div } from "gpui-kit";
import { v_flex } from "gpui-base";
import { agents, closeOverlay, focused, props, theme } from "herdr";
import { currentIssueKey } from "./currentKey.js";
import { defaultProject } from "./format.js";
import { jiraSource } from "./source.js";
import { preview, rowView } from "./cardPreview.js";
import * as steps from "./jiraSteps.js";
import { keyed, onListKey } from "../pickerKeys.js";
import { SEARCH_FOOTER, centered, footer, header, screenCard } from "../pickerView.js";
import { ago } from "../time.js";

/** @typedef {import("../types.js").Cx} Cx */
/** @typedef {import("../types.js").KeyEvent} KeyEvent */
/** @typedef {import("../types.js").FocusHandle} FocusHandle */
/** @typedef {import("../types.js").Issue} Issue */
/** @typedef {import("../types.js").Person} Person */
/** @typedef {import("../types.js").Row} Row */
/** @typedef {import("./source.js").JiraSource} JiraSource */
/** @typedef {Person & { hint?: string }} Suggestion */

/** @type {Record<string, string>} */
const FOOTERS = {
  mode: "a assigned · h history · /1307 any issue · esc close",
  issues: "1-9 a-z open · / search, /1307 any issue · ↑↓ ctrl-j k · esc back",
  card: "t take · m move · r reassign · o browser · O side panel · esc back",
  assign: "1-9 pick · / search people · esc keep",
};

/** @param {Issue} i */
const issueMeta = (i) => [ago(i.updated), i.reporter && `by ${i.reporter.name}`].filter(Boolean).join(" · ");

export class JiraScreen {
  /** @type {FocusHandle} */ handle = null;
  /** @type {JiraSource} */ jira = null;
  step = "mode";
  /** @type {string | null} "assigned" or "history" */ list = null;
  filter = "";
  searching = false;
  at = 0;
  /** @type {string | null} */ error = null;
  /** loading the lists failed (no login, bad token, no network); shown on every step */
  /** @type {string | null} */ loadError = null;
  /** @type {string | null} */ busy = null;
  /** @type {Issue[] | null} */ issues = null;
  /** @type {Issue[] | null} */ recent = null;
  /** @type {string | null} */ current = null;
  /** @type {Issue | null} */ picked = null;
  /** @type {Row[]} */ options = [];
  optionsTitle = "";
  afterMove = false;
  /** @type {Suggestion[]} */ suggested = [];
  /** @type {Suggestion[]} */ found = [];
  /** @type {string | null} */ note = null;
  /** @type {ReturnType<typeof focused>} */ focusedAtOpen = null;
  /** @type {import("herdr").AgentInfo | null} */ here = null;

  /**
   * @param {Cx} cx
   * @param {{ card?: string, list?: string }} [p]
   */
  init(cx, p = {}) {
    this.handle = cx.focus_handle();
    cx.timer.after(0, () => this.handle.focus());
    Object.assign(this, { step: "mode", list: null, filter: "", searching: false, at: 0, error: null, busy: null });
    Object.assign(this, { issues: null, recent: null, current: null, picked: null, options: [], afterMove: false });
    this.focusedAtOpen = focused();
    this.here = this.focusedAtOpen?.terminal
      ? (agents().find((a) => a.address === this.focusedAtOpen.terminal) ?? null)
      : null;
    cx.spawn(async (cx) => {
      await this.load();
      cx.notify();
      if (p.card) this.open({ key: p.card }, cx);
      else if (p.list) this.go("issues", cx, p.list);
    });
  }

  async load() {
    this.jira = await jiraSource();
    this.current = this.jira.demo ? null : await currentIssueKey(this.focusedAtOpen);
    const [mine, recent] = await Promise.allSettled([this.jira.myIssues(), this.jira.recentIssues()]);
    if (mine.status === "rejected") this.loadError = mine.reason?.message ?? String(mine.reason);
    this.issues = mine.status === "fulfilled" ? mine.value : [];
    this.recent = recent.status === "fulfilled" ? recent.value : [];
    if (!this.current || this.issues.some((i) => i.key === this.current)) return;
    const own = await this.jira.issue(this.current).catch(() => null);
    if (own) this.issues.unshift(own);
  }

  close() {
    closeOverlay(props().overlay);
  }

  /**
   * @param {string} step
   * @param {Cx} cx
   * @param {string} [list]
   */
  go(step, cx, list) {
    if (list) this.list = list;
    Object.assign(this, { step, filter: "", searching: false, at: 0, error: null });
    cx.notify();
  }

  /**
   * "1307" / "ab-1307" typed: a row that opens that issue.
   * @param {string} q
   * @returns {Row[]}
   */
  byKey(q) {
    const m = q.match(/^(?:([a-z]+)-)?(\d+)$/);
    const project = m && (m[1]?.toUpperCase() ?? defaultProject({ currentKey: this.current, issues: this.issues }));
    if (!project) return [];
    const key = `${project}-${m[2]}`;
    return [{ byKey: true, label: key, sub: "open by key", act: (cx) => this.open({ key }, cx) }];
  }

  /**
   * @param {string} q
   * @returns {Row[]}
   */
  issueRows(q) {
    const all = [...((this.list === "history" ? this.recent : this.issues) ?? [])];
    if (this.list !== "history" && this.current)
      all.sort((a, b) => Number(b.key === this.current) - Number(a.key === this.current));
    /** @type {Row[]} */
    const rows = all
      .filter((i) => !q || `${i.key} ${i.summary}`.toLowerCase().includes(q))
      .map((i) => ({
        label: `${i.key}${i.key === this.current ? "  ● current branch" : ""}`,
        who: i.assignee,
        prio: i.priority,
        sub: i.summary,
        hint: i.status,
        meta: issueMeta(i),
        act: (cx) => this.open(i, cx),
      }));
    const listed = new Set(all.map((i) => i.key));
    return [...this.byKey(q).filter((r) => !listed.has(r.label)), ...rows];
  }

  /**
   * Shows an issue's card, loading it when only its key is known.
   * @param {Partial<Issue> & { key: string }} i
   * @param {Cx} cx
   */
  open(i, cx) {
    if (i.summary !== undefined && i.links) return ((this.picked = /** @type {Issue} */ (i)), this.go("card", cx));
    this.busy = `Loading ${i.key}…`;
    cx.notify();
    cx.spawn(async (cx) => {
      try {
        this.picked = await this.jira.issue(i.key);
        this.go("card", cx);
      } catch (e) {
        this.error = e instanceof Error ? e.message : String(e);
      }
      this.busy = null;
      cx.notify();
    });
  }

  /** @returns {Row[]} */
  cardRows() {
    return [
      { key: "t", label: "Take", hint: "send to an agent", act: (cx) => steps.loadAgents(this, cx) },
      { key: "m", label: "Move", hint: "change status", act: (cx) => steps.loadTransitions(this, cx) },
      { key: "r", label: "Reassign", hint: "who gave it to you first", act: (cx) => steps.toAssign(this, cx) },
      { key: "o", label: "Open in browser", hint: "Jira", act: (cx) => steps.openInBrowser(this, cx) },
      {
        key: "O",
        label: "Open in the side panel",
        hint: "description, comments, links",
        act: () => steps.openInPanel(this),
      },
    ];
  }

  /** @returns {Row[]} */
  assignRows() {
    const typing = Boolean(this.filter.trim());
    const people = typing ? this.found : this.suggested;
    /** @type {Row[]} */
    const rows = people.map((p, n) => ({
      label: `${!typing && n === 0 && p.hint === "gave it to you" ? "← " : ""}${p.name}`,
      hint: p.hint ?? "",
      act: (cx) => steps.reassign(this, cx, p),
    }));
    return typing ? rows : [...rows, { label: `Keep: ${this.picked.assignee}`, hint: "esc", act: () => this.close() }];
  }

  /** @returns {Row[]} */
  rows() {
    const q = this.filter.trim().toLowerCase();
    /** @param {Row} r */
    const match = (r) => !q || `${r.label} ${r.sub ?? ""}`.toLowerCase().includes(q);
    if (this.step === "mode") {
      /** @type {Row[]} */
      const menu = [
        { key: "a", label: "Assigned", hint: "open issues on you", act: (cx) => this.go("issues", cx, "assigned") },
        {
          key: "h",
          label: "History",
          hint: "viewed, moved or reassigned by you",
          act: (cx) => this.go("issues", cx, "history"),
        },
      ];
      return keyed([...menu.filter(match), ...this.byKey(q)]);
    }
    if (this.step === "issues") return keyed(this.issueRows(q));
    if (this.step === "card") return keyed(this.cardRows().filter(match));
    if (this.step === "assign") return keyed(this.assignRows());
    return keyed(this.options.filter(match));
  }

  /** @param {Cx} cx */
  back(cx) {
    if (this.step === "assign" && this.afterMove) return this.close(); // the status already changed
    if (this.step === "options" || this.step === "assign") return this.go("card", cx);
    if (this.step === "card") return this.go(this.list ? "issues" : "mode", cx);
    if (this.step === "issues") return this.go("mode", cx);
    this.close();
  }

  title() {
    const k = this.picked?.key;
    /** @type {Record<string, string>} */
    const titles = { mode: "Jira", issues: this.list === "history" ? "History" : "Assigned", card: k };
    return titles[this.step] ?? (this.step === "assign" ? `${k} · assign to` : `${k} · ${this.optionsTitle}`);
  }

  /**
   * @param {KeyEvent} e
   * @param {Cx} cx
   * @param {Row[]} list
   */
  onKey(e, cx, list) {
    cx.stop_propagation();
    if (this.busy) return e.key === "escape" && this.back(cx);
    const before = this.filter;
    const redraw = onListKey(this, e, list, { act: (r) => r.act(cx), back: () => this.back(cx) });
    if (this.step === "assign" && this.filter !== before) steps.searchPeople(this, cx);
    if (redraw) cx.notify();
  }

  render() {
    const t = /** @type {any} */ (theme()); // theme() is Record<string, string>; colors want `#…`
    const list = this.rows();
    if (this.at >= list.length) this.at = Math.max(0, list.length - 1);
    const loading = this.step === "issues" && !(this.list === "history" ? this.recent : this.issues);
    const note = this.step === "assign" ? this.note : null;
    const body = v_flex()
      .id("jira-list")
      .h(380)
      .overflow_y_scrollbar()
      .gap(1)
      .when(Boolean(this.error || this.loadError), (e) =>
        e.child(
          div()
            .p(8)
            .text_color(t.blocked)
            .child(this.error || this.loadError),
        ),
      )
      .when(Boolean(this.busy) || loading, (e) =>
        e.child(
          div()
            .p(8)
            .text_color(t.dim)
            .child(this.busy ?? "Loading issues…"),
        ),
      )
      .children(
        list.map((r, i) =>
          rowView(t, r, { selected: i === this.at, searching: this.searching, act: (cx) => !this.busy && r.act(cx) }),
        ),
      );
    const card = screenCard(t, {
      id: "herdr-flow-jira",
      width: 520,
      handle: this.handle,
      onKey: (e, cx) => this.onKey(e, cx, list),
    })
      .child(header(t, this, this.title(), this.step === "assign" ? "a name" : "text or a number"))
      .when(this.step === "card" && Boolean(this.picked), (e) => e.child(preview(t, this.picked)))
      .when(Boolean(note), (e) => e.child(div().px(4).text_size(11).text_color(t.done).child(note)))
      .child(body)
      .child(
        footer(
          t,
          this.searching
            ? SEARCH_FOOTER
            : (FOOTERS[this.step] ?? "1-9 pick · / search · ↑↓ ctrl-j k · enter · esc back"),
        ),
      );
    return centered(card);
  }
}
