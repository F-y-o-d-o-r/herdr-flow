// The Jira popup (leader J): a list of issues, then one issue's card with what to do.
// Mode: configurable counter lists (Review, Tasks, Sandbox) + History + search by key (/1307).
// Card: preview, then t Take · m Move (then Reassign) · r Reassign · o browser · O side panel.
import { div } from "gpui-kit";
import { v_flex } from "gpui-base";
import { agents, appHome, closeOverlay, focused, props, readTextFile, setShared, shared, theme } from "herdr";
import { currentIssueKey } from "./branchKeyHelpers.js";
import { jiraSource } from "./jiraDataSource.js";
import { FOOTERS, assignRows, byKeyRow, cardRows, issueMeta, modeRows, preview, rowView } from "./issueCardHelpers.js";
import { COUNTERS_FILE, COUNTERS_SHARED, DEFAULT_COUNTERS, parseCounters } from "./counterHelpers.js";
import { searchPeople } from "./issueActionSteps.js";
import { keyed, onListKey } from "../pickerKeyHelpers.js";
import { SEARCH_FOOTER, centered, footer, header, screenCard } from "../pickerView.js";

/** @typedef {import("../types.js").Cx} Cx */
/** @typedef {import("../types.js").KeyEvent} KeyEvent */
/** @typedef {import("../types.js").FocusHandle} FocusHandle */
/** @typedef {import("../types.js").Issue} Issue */
/** @typedef {import("../types.js").Row} Row */
/** @typedef {import("./jiraDataSource.js").JiraSource} JiraSource */
/** @typedef {import("./counterHelpers.js").CounterState} CounterState */
/** @typedef {import("../types.js").Person & { hint?: string }} Suggestion */

export class JiraScreen {
  /** @type {FocusHandle} */ handle = null;
  /** @type {JiraSource} */ jira = null;
  step = "mode";
  list = /** @type {string | null} */ (null);
  filter = "";
  searching = false;
  at = 0;
  error = /** @type {string | null} */ (null);
  loadError = /** @type {string | null} */ (null);
  busy = /** @type {string | null} */ (null);
  counters = /** @type {CounterState[]} */ ([]);
  /** @type {Map<string, Issue[]>} */ listIssues = new Map();
  recent = /** @type {Issue[] | null} */ (null);
  current = /** @type {string | null} */ (null);
  picked = /** @type {Issue | null} */ (null);
  options = /** @type {Row[]} */ ([]);
  optionsTitle = "";
  afterMove = false;
  suggested = /** @type {Suggestion[]} */ ([]);
  found = /** @type {Suggestion[]} */ ([]);
  note = /** @type {string | null} */ (null);
  focusedAtOpen = /** @type {ReturnType<typeof focused>} */ (null);
  here = /** @type {import("herdr").AgentInfo | null} */ (null);

  /**
   * @param {Cx} cx
   * @param {{ card?: string, list?: string }} [p]
   */
  init(cx, p = {}) {
    this.handle = cx.focus_handle();
    cx.timer.after(0, () => this.handle.focus());
    Object.assign(this, { step: "mode", list: null, filter: "", searching: false, at: 0, error: null, busy: null });
    Object.assign(this, { current: null, picked: null, options: [], afterMove: false, listIssues: new Map() });
    this.initCounters();
    this.focusedAtOpen = focused();
    this.here = this.focusedAtOpen?.terminal
      ? (agents().find((a) => a.address === this.focusedAtOpen.terminal) ?? null)
      : null;
    if (p.list) this.go("issues", cx, p.list);
    cx.spawn(async (cx) => {
      await this.load();
      cx.notify();
      if (p.card) this.open({ key: p.card }, cx);
    });
  }

  initCounters() {
    const cached = /** @type {any} */ (shared(COUNTERS_SHARED));
    this.counters =
      cached?.items && Array.isArray(cached.items)
        ? cached.items
        : DEFAULT_COUNTERS.map((c) => ({ ...c, count: 0, issues: [] }));
    for (const c of this.counters) if (c.issues) this.listIssues.set(c.id, c.issues);
  }

  async load() {
    this.jira = await jiraSource();
    this.current = this.jira.demo ? null : await currentIssueKey(this.focusedAtOpen);
    const text = await readTextFile(`${appHome()}/${COUNTERS_FILE}`).catch(() => null);
    const { counters } = parseCounters(text);
    const [recentRes, ...countRes] = await Promise.allSettled([
      this.jira.recentIssues(),
      ...counters.map((c) => this.jira.searchIssues(c.jql, 50)),
    ]);
    this.recent = recentRes.status === "fulfilled" ? recentRes.value : [];
    if (recentRes.status === "rejected" && !this.counters.length) {
      this.loadError = recentRes.reason?.message ?? String(recentRes.reason);
    }
    this.counters = counters.map((counter, index) => {
      const result = countRes[index];
      const issues = result.status === "fulfilled" ? result.value : [];
      if (result.status === "rejected" && !this.loadError) {
        this.loadError = result.reason?.message ?? String(result.reason);
      }
      this.listIssues.set(counter.id, issues);
      return { ...counter, count: issues.length, issues };
    });
    await this.includeCurrentBranchIssue();
    setShared(COUNTERS_SHARED, { at: Date.now(), items: this.counters });
  }

  async includeCurrentBranchIssue() {
    if (!this.current) return;
    for (const [, issues] of this.listIssues) {
      if (issues.some((issue) => issue.key === this.current)) return;
      const own = await this.jira.issue(this.current).catch(() => null);
      if (own) issues.unshift(own);
      return;
    }
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
   * @param {string} q
   * @returns {Row[]}
   */
  byKey(q) {
    const issues = [...this.listIssues.values()].flat();
    return byKeyRow(q, {
      current: this.current,
      issues,
      onOpen: (key) => (cx) => this.open({ key }, cx),
    });
  }

  /**
   * @param {string} q
   * @returns {Row[]}
   */
  issueRows(q) {
    const all = [...(this.list === "history" ? (this.recent ?? []) : (this.listIssues.get(this.list) ?? []))];
    if (this.list !== "history" && this.current) {
      all.sort((a, b) => Number(b.key === this.current) - Number(a.key === this.current));
    }
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
  rows() {
    const q = this.filter.trim().toLowerCase();
    /** @param {Row} r */
    const match = (r) => !q || `${r.label} ${r.sub ?? ""}`.toLowerCase().includes(q);
    if (this.step === "mode") return keyed([...modeRows(this).filter(match), ...this.byKey(q)]);
    if (this.step === "issues") return keyed(this.issueRows(q));
    if (this.step === "card") return keyed(cardRows(this).filter(match));
    if (this.step === "assign") return keyed(assignRows(this));
    return keyed(this.options.filter(match));
  }

  /** @param {Cx} cx */
  back(cx) {
    if (this.step === "assign" && this.afterMove) return this.close();
    if (this.step === "options" || this.step === "assign") return this.go("card", cx);
    if (this.step === "card") return this.go(this.list ? "issues" : "mode", cx);
    if (this.step === "issues") return this.go("mode", cx);
    this.close();
  }

  title() {
    const k = this.picked?.key;
    if (this.step === "issues")
      return this.list === "history" ? "History" : (this.counters.find((x) => x.id === this.list)?.label ?? "Issues");
    if (this.step === "card") return k;
    if (this.step === "assign") return `${k} · assign to`;
    return this.step === "options" ? `${k} · ${this.optionsTitle}` : "Jira";
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
    if (this.step === "assign" && this.filter !== before) searchPeople(this, cx);
    if (redraw) cx.notify();
  }

  render() {
    const t = /** @type {any} */ (theme());
    const list = this.rows();
    if (this.at >= list.length) this.at = Math.max(0, list.length - 1);
    const loading = this.step === "issues" && !(this.list === "history" ? this.recent : this.listIssues.get(this.list));
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
