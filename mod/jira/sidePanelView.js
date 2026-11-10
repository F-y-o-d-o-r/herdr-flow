// The Jira side panel ("jira-view"): issue facts, links, checklist, custom fields,
// description, comments with thumbs-up reactions, and image attachments.
import { div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { exec, run, setShared, shared, theme } from "herdr";
import { latin } from "../pickerKeyHelpers.js";
import { defaultProject } from "./jiraFormatHelpers.js";
import { issueTypeBadge, priorityBadge, statusBadge } from "./issueCardHelpers.js";
import { COUNTERS_SHARED } from "./counterHelpers.js";
import { PANEL } from "./issueActionSteps.js";
import * as helpers from "./sidePanelHelpers.js";
import { commentRow } from "./commentReactionHelpers.js";
import { jiraSource } from "./jiraDataSource.js";

/** @typedef {import("../types.js").Theme} Theme */
/** @typedef {import("../types.js").Cx} Cx */
/** @typedef {import("../types.js").Issue} Issue */
/** @typedef {import("../types.js").IssueFull} IssueFull */
/** @typedef {import("../types.js").FocusHandle} FocusHandle */
/** @typedef {Awaited<ReturnType<typeof jiraSource>>} JiraSource */

const CHECK_MS = 700;

export class PanelView {
  /** @type {FocusHandle | null} */ handle = null;
  /** @type {string | null} */ key = null;
  /** @type {IssueFull | null} */ data = null;
  /** @type {string | null} */ error = null;
  loading = false;
  gen = 0;
  /** @type {JiraSource | null} */ jira = null;
  /** @type {Record<string, string | null>} */ images = {};
  /** @type {string[]} */ back = [];
  /** @type {string | null} */ shownFromShared = null;
  searching = false;
  query = "";
  searchAt = 0;

  /** @param {Cx} cx */
  init(cx) {
    this.handle = cx.focus_handle();
    Object.assign(this, {
      key: null,
      data: null,
      error: null,
      loading: false,
      gen: 0,
      jira: null,
      images: {},
      back: [],
      searching: false,
      query: "",
      searchAt: 0,
    });
    const check = (/** @type {Cx} */ cx) => {
      const k = /** @type {string | null} */ (shared(PANEL.key));
      if (k && k !== this.shownFromShared) {
        Object.assign(this, { shownFromShared: k, back: [] });
        this.load(k, cx);
      }
    };
    check(cx);
    cx.timer.every(CHECK_MS, check);
  }

  /** @param {import("../types.js").Comment} comment @param {Cx} cx */
  toggleLike(comment, cx) {
    const nextLiked = !comment.liked;
    const delta = nextLiked ? 1 : -1;
    comment.liked = nextLiked;
    comment.likes = Math.max(0, (comment.likes ?? 0) + delta);
    cx.notify();
    if (comment.id && this.jira) {
      cx.spawn(async () => {
        await this.jira?.toggleCommentLike(comment.id, nextLiked).catch(() => null);
      });
    }
  }

  /** @param {string} key @param {Cx} cx */
  load(key, cx) {
    const gen = ++this.gen;
    Object.assign(this, { key, loading: true, error: null, images: {} });
    cx.notify();
    cx.spawn(async (cx) => {
      try {
        this.jira = await jiraSource();
        const data = await this.jira.issueFull(key);
        if (gen === this.gen) this.data = data;
      } catch (e) {
        if (gen === this.gen) this.error = e instanceof Error ? e.message : String(e);
      }
      if (gen !== this.gen) return;
      this.loading = false;
      cx.notify();
      for (const a of (this.data?.attachments ?? []).filter((x) => x.isImage)) {
        const path = await this.jira.cacheImage(a).catch(() => null);
        if (gen !== this.gen) return;
        this.images = { ...this.images, [a.name]: path };
        cx.notify();
      }
    });
  }

  /** @param {string} key @param {Cx} cx */
  openLinked(key, cx) {
    if (this.key) this.back.push(this.key);
    this.load(key, cx);
  }

  /** @param {string} [url] */
  openUrl(url) {
    if (url) exec("open", [url]);
  }

  /** @param {Cx} cx */
  startSearch(cx) {
    Object.assign(this, { searching: true, searchAt: 0 });
    this.handle?.focus();
    cx.notify();
  }

  /** @param {string} key @param {Cx} cx */
  selectSearchIssue(key, cx) {
    Object.assign(this, { searching: false, query: "", searchAt: 0, shownFromShared: key });
    if (this.key && this.key !== key) this.back.push(this.key);
    setShared(PANEL.key, key);
    this.load(key, cx);
  }

  /** @returns {Issue[]} */
  knownIssues() {
    const cached = /** @type {any} */ (shared(COUNTERS_SHARED));
    const list = (cached?.items ?? []).flatMap((/** @type {any} */ c) => c.issues ?? []);
    if (this.data) list.unshift(this.data);
    return helpers.dedupeIssues(list);
  }

  /** @param {import("../types.js").KeyEvent} e @param {Cx} cx */
  onKey(e, cx) {
    if (!this.searching) {
      if (e.key === "/" || e.key_char === "/" || e.key_char === ".") (cx.stop_propagation(), this.startSearch(cx));
      return;
    }
    cx.stop_propagation();
    const list = helpers.filterSuggestions(this.query, this.knownIssues(), this.key);
    if (e.key === "escape") return (Object.assign(this, { searching: false, query: "", searchAt: 0 }), cx.notify());
    if (e.key === "enter") {
      const hit = list[this.searchAt]?.key;
      if (hit) return this.selectSearchIssue(hit, cx);
      const m = this.query.trim().match(/^(?:([a-z]+)-)?(\d+)$/i);
      const proj =
        m?.[1]?.toUpperCase() ||
        defaultProject({ currentKey: this.key, issues: this.knownIssues() }) ||
        this.key?.split("-")[0];
      return m && proj ? this.selectSearchIssue(`${proj}-${m[2]}`, cx) : ((this.searching = false), cx.notify());
    }
    const ctrl = e.modifiers?.control;
    const l = latin(e.key);
    if (e.key === "up" || (ctrl && (l === "k" || l === "p"))) this.searchAt = Math.max(0, this.searchAt - 1);
    else if (e.key === "down" || (ctrl && (l === "j" || l === "n")))
      this.searchAt = Math.min(Math.max(0, list.length - 1), this.searchAt + 1);
    else if (e.key === "backspace") Object.assign(this, { query: this.query.slice(0, -1), searchAt: 0 });
    else if (!ctrl && !e.modifiers?.platform && !e.modifiers?.alt && e.key_char && latin(e.key_char) >= " ") {
      Object.assign(this, { query: this.query + latin(e.key_char), searchAt: 0 });
    } else return;
    cx.notify();
  }

  /** @param {Theme} t */
  topBar(t) {
    const text = this.searching ? `${this.query}▏` : "⌕ # / key…";
    const color = this.searching && this.query ? t.foreground : t.dim;
    const keyLabel = div()
      .font_semibold()
      .text_color(t.accent)
      .cursor_pointer()
      .on_click((_e, cx) => this.startSearch(cx))
      .child(this.key ?? "Jira");
    const input = h_flex()
      .id("jv-search-input")
      .flex_1()
      .h(24)
      .px(6)
      .items_center()
      .rounded(4)
      .bg(t.raised)
      .border(1)
      .border_color(this.searching ? t.accent : t.border)
      .cursor_pointer()
      .on_click((_e, cx) => this.startSearch(cx))
      .child(div().text_size(12).truncate().text_color(color).child(text));
    return h_flex()
      .h(36)
      .px(10)
      .gap(6)
      .items_center()
      .border_b(1)
      .border_color(t.border)
      .when(this.back.length > 0, (e) =>
        e.child(helpers.headerButton(t, "jv-back", "←", (cx) => this.back.length && this.load(this.back.pop(), cx))),
      )
      .child(keyLabel)
      .child(input)
      .when(Boolean(this.key), (e) =>
        e
          .child(helpers.headerButton(t, "jv-open", "↗", () => this.openUrl(this.jira?.browseUrl(this.key))))
          .child(helpers.headerButton(t, "jv-refresh", "⟳", (cx) => this.load(this.key, cx))),
      )
      .child(helpers.headerButton(t, "jv-hide", "✕", () => run("layout.hide", { id: PANEL.block })));
  }

  /** @param {Theme} t @param {IssueFull} i */
  issueBody(t, i) {
    const badges = [statusBadge(t, i.status), issueTypeBadge(t, i.type), priorityBadge(t, i.priority)].filter(Boolean);
    const names = new Set(i.attachments.filter((a) => a.isImage).map((a) => a.name));
    const openAtt = (/** @type {any} */ a) => this.openUrl(this.jira?.attachmentUrl(a.id));
    return v_flex()
      .gap(4)
      .child(h_flex().gap(8).items_center().children(badges))
      .child(div().pt(4).text_size(16).font_semibold().child(i.summary))
      .child(helpers.section(t, "Details"))
      .children(helpers.detailsRows(t, i))
      .when(i.links.length > 0, (e) =>
        e
          .child(helpers.section(t, "Links"))
          .children(
            i.links.map((l, n) =>
              helpers.linkRow(t, { id: `jv-link-${n}`, link: l, act: (cx) => this.openLinked(l.key, cx) }),
            ),
          ),
      )
      .when(Boolean(i.checklist), (e) =>
        e.child(helpers.checklistView(t, { checklist: i.checklist, open: () => this.openUrl(i.url) })),
      )
      .when(i.fields.length > 0, (e) => e.child(helpers.customFields(t, { fields: i.fields, gen: this.gen })))
      .child(helpers.section(t, "Description"))
      .child(
        helpers.richText(t, {
          id: `jv-desc-${this.gen}`,
          text: i.description || "_No description_",
          images: this.images,
          imageNames: names,
        }),
      )
      .when(i.attachments.length > 0, (e) =>
        e
          .child(helpers.section(t, `Attachments (${i.attachments.length})`))
          .child(helpers.attachmentList(t, { attachments: i.attachments, images: this.images, open: openAtt })),
      )
      .child(helpers.section(t, `Comments (${i.comments.length})`))
      .children(
        i.comments.map((c, n) =>
          commentRow(t, {
            comment: c,
            index: n,
            gen: this.gen,
            images: this.images,
            imageNames: names,
            onToggleLike: (cm, cx) => this.toggleLike(cm, cx),
          }),
        ),
      );
  }

  render() {
    const t = /** @type {Theme} */ (theme());
    const suggestions = this.searching ? helpers.filterSuggestions(this.query, this.knownIssues(), this.key) : [];
    const onSelect = (/** @type {string} */ k, /** @type {Cx} */ cx) => this.selectSearchIssue(k, cx);
    return v_flex()
      .id("jira-view")
      .track_focus(this.handle)
      .on_key_down((e, cx) => this.onKey(e, cx))
      .size_full()
      .bg(t.surface)
      .text_size(13)
      .text_color(t.foreground)
      .child(this.topBar(t))
      .when(this.searching, (e) =>
        e.child(helpers.searchDropdown(t, { suggestions, selectedAt: this.searchAt, onSelect })),
      )
      .child(
        v_flex()
          .id("jv-body")
          .flex_1()
          .min_h(0)
          .overflow_y_scrollbar()
          .px(12)
          .py(8)
          .gap(4)
          .when(!this.key, (e) => e.child(div().text_color(t.dim).child("ctrl-a J → pick an issue → O")))
          .when(this.loading, (e) => e.child(div().text_color(t.dim).child(`Loading ${this.key}…`)))
          .when(Boolean(this.error), (e) => e.child(div().text_color(t.blocked).child(this.error)))
          .when(Boolean(this.data) && !this.loading, (e) => e.child(this.issueBody(t, this.data))),
      );
  }
}
