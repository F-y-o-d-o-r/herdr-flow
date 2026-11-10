// Top bar Jira counters widget (tabs-row): R/T/S badges with live counts.
import { div } from "gpui-kit";
import { h_flex } from "gpui-base";
import { appHome, notify, readTextFile, setShared, shared, theme } from "herdr";
import { openScreenNow } from "../leader/leaderActionHelpers.js";
import {
  COUNTERS_FILE,
  COUNTERS_REFRESH,
  COUNTERS_SHARED,
  DEFAULT_COUNTERS,
  counterActiveColor,
  diffNewCounterIssues,
  parseCounters,
} from "./counterHelpers.js";
import { jiraSource } from "./jiraDataSource.js";

/** @typedef {import("../types.js").Cx} Cx */
/** @typedef {import("../types.js").Theme} Theme */
/** @typedef {import("./counterHelpers.js").CounterState} CounterState */

/** Triggers a background refresh of the bar counters from anywhere in the mod. */
export const refreshBarCounters = () => setShared(COUNTERS_REFRESH, Date.now());

/**
 * Renders one clickable counter pill (e.g. "A 3", "R 0") for the top bar.
 * @param {Theme} t
 * @param {CounterState} counter
 */
function counterPill(t, counter) {
  const hasCount = counter.count > 0;
  const activeColor = counterActiveColor(counter.color, t);
  return h_flex()
    .id(`jira-bar-${counter.id}`)
    .px(6)
    .py(2)
    .gap(2)
    .items_center()
    .rounded(5)
    .cursor_pointer()
    .bg(t.raised)
    .hover((el) => el.bg(t.hover))
    .tooltip(`${counter.label}: ${counter.count} (click to open)`)
    .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
    .on_click(() => openScreenNow("jira", { list: counter.id }))
    .child(
      div()
        .text_size(11)
        .font_semibold()
        .text_color(hasCount ? activeColor : t.dim)
        .child(counter.tag),
    )
    .child(
      div()
        .text_size(11.5)
        .font_semibold()
        .text_color(hasCount ? activeColor : t.muted)
        .child(String(counter.count)),
    );
}

export class BarView {
  /** @type {CounterState[]} */
  items = [];
  /** @type {Map<string, Set<string>> | null} */
  seenKeys = null;
  /** @type {number} */
  lastRefresh = 0;
  busy = false;

  /**
   * @param {Cx} cx
   */
  init(cx) {
    const cached = /** @type {any} */ (shared(COUNTERS_SHARED));
    this.items =
      cached?.items && Array.isArray(cached.items)
        ? cached.items
        : DEFAULT_COUNTERS.map((counter) => ({ ...counter, count: 0 }));
    this.refresh(cx);
    cx.timer.every(60000, () => this.refresh(cx));
    cx.timer.every(2000, () => {
      const requestedAt = shared(COUNTERS_REFRESH);
      if (typeof requestedAt === "number" && requestedAt > this.lastRefresh) {
        this.lastRefresh = requestedAt;
        this.refresh(cx);
      }
    });
  }

  /** @param {Cx} cx */
  async refresh(cx) {
    if (this.busy) return;
    this.busy = true;
    try {
      const text = await readTextFile(`${appHome()}/${COUNTERS_FILE}`).catch(() => null);
      const { counters } = parseCounters(text);
      const jira = await jiraSource();
      const settled = await Promise.allSettled(
        counters.map(async (counter) => {
          const issues = await jira.searchIssues(counter.jql, 50);
          return { ...counter, count: issues.length, issues };
        }),
      );
      this.items = settled.map((result, index) =>
        result.status === "fulfilled" ? result.value : { ...counters[index], count: 0, issues: [] },
      );
      if (settled.every((r) => r.status === "fulfilled")) {
        const { seen, toasts } = diffNewCounterIssues(this.seenKeys, this.items);
        this.seenKeys = seen;
        if (!jira.demo) {
          for (const toast of toasts) {
            notify(toast);
          }
        }
      }
      setShared(COUNTERS_SHARED, { at: Date.now(), items: this.items });
      cx.notify();
    } catch {
      // ignore transient poll failures
    } finally {
      this.busy = false;
    }
  }

  render() {
    const t = /** @type {any} */ (theme());
    return h_flex()
      .id("herdr-flow-jira-bar")
      .size_full()
      .px(6)
      .gap(4)
      .items_center()
      .justify_center()
      .bg(t.chrome)
      .border_b(1)
      .border_color(t.border)
      .children(this.items.map((counter) => counterPill(t, counter)));
  }
}
