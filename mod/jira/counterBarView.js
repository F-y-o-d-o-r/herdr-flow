// Top bar Jira counters widget (tabs-row): R/T/S badges with live counts.
import { div, svg } from "gpui-kit";
import { h_flex } from "gpui-base";
import { appHome, exec, notify, readTextFile, setShared, shared, theme, window } from "herdr";
import { openScreenNow, panelExists, panelShows, togglePanel } from "../leader/leaderActionHelpers.js";
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

const AUTOMATIONS_PANEL = "automations";

/**
 * Toggle for the herdr-automations side panel; drawn only when the layout has that panel.
 * Sized like the neighbouring header icon buttons (26px high, 16px icon).
 * @param {Theme} t
 */
function automationsButton(t) {
  const on = panelShows(AUTOMATIONS_PANEL);
  return h_flex()
    .id("jira-bar-automations")
    .h(26)
    .px(8)
    .ml(4)
    .flex_none()
    .items_center()
    .rounded(5)
    .cursor_pointer()
    .when(on, (el) => el.bg(t.selected))
    .hover((el) => el.bg(t.hover))
    .tooltip("Automations")
    .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
    .on_click(() => togglePanel(AUTOMATIONS_PANEL))
    .child(
      svg(`mods/${AUTOMATIONS_PANEL}/automations.svg`)
        .size(16)
        .flex_none()
        .text_color(t.ansi6 ?? t.muted),
    );
}

const BUNDLE = "dev.herdr.app";
/** @type {string | null | undefined} */
let macNotifier = undefined;
/** @type {string | null | undefined} */
let herdrAppBin = undefined;

/**
 * Finds terminal-notifier binary or null.
 * @returns {Promise<string | null>}
 */
async function findMacNotifier() {
  const candidates = ["terminal-notifier", "/opt/homebrew/bin/terminal-notifier", "/usr/local/bin/terminal-notifier"];
  for (const bin of candidates) {
    const res = await exec(bin, ["-help"]).catch(() => null);
    if (res?.code === 0) return bin;
  }
  return null;
}

/**
 * Finds herdr-app executable path or null.
 * @returns {Promise<string | null>}
 */
async function findHerdrApp() {
  const found = await exec("/bin/sh", ["-c", "command -v herdr-app"]).catch(() => null);
  if (found?.code === 0 && found.stdout.trim()) return found.stdout.trim();
  const res = await exec("herdr-app", ["--version"]).catch(() => null);
  return res?.code === 0 ? "herdr-app" : null;
}

/**
 * Delivers an OS desktop notification with sound when supported.
 * @param {import("./counterHelpers.js").CounterToast} toast
 */
async function postDesktopNotification(toast) {
  const platform = window()?.platform;
  if (platform === "macos") {
    if (macNotifier === undefined) macNotifier = await findMacNotifier();
    if (herdrAppBin === undefined) herdrAppBin = await findHerdrApp();
    if (macNotifier) {
      const args = ["-title", toast.title, "-message", toast.body ?? "", "-activate", BUNDLE, "-sound", "Glass"];
      if (toast.key && herdrAppBin) {
        args.push("-execute", `${herdrAppBin} do herdr-flow.show:${toast.key}`);
      }
      await exec(macNotifier, args).catch(() => null);
      return;
    }
    await exec("afplay", ["/System/Library/Sounds/Glass.aiff"]).catch(() => null);
    return;
  }
  if (platform === "linux") {
    await exec("notify-send", ["--app-name=Herdr", toast.title, toast.body ?? ""]).catch(() => null);
  }
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
            notify({
              ...toast,
              ...(toast.key ? { action: { name: `herdr-flow.show:${toast.key}` } } : {}),
            });
            postDesktopNotification(toast);
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
    const withAutomations = panelExists(AUTOMATIONS_PANEL);
    const bar = h_flex()
      .id("herdr-flow-jira-bar")
      .size_full()
      .gap(4)
      .items_center()
      .bg(t.chrome)
      .border_b(1)
      .border_color(t.border)
      .children(this.items.map((counter) => counterPill(t, counter)));
    if (!withAutomations) return bar.px(6).justify_center();
    return bar.pl(6).justify_end().child(automationsButton(t));
  }
}
