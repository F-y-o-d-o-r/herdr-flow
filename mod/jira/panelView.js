// The Jira side panel (layout block "jira-view", props { view: "panel" }): the whole issue whose
// key the popup put in shared "herdrFlow.jiraKey" (O on a card). Header ← back · ↗ browser ·
// ⟳ refresh · ✕ hide; facts, links (open here), checklist summary, filled custom fields,
// description and comments with their images, attachments. Images are cached under the app home.
import { div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { exec, run, shared, theme } from "herdr";
import { ago } from "../time.js";
import { URGENT } from "./cardPreview.js";
import { PANEL } from "./jiraSteps.js";
import { attachmentList, checklistView, customFields, fact, linkLine, richText, section } from "./panelSections.js";
import { jiraSource } from "./source.js";

/** @typedef {import("../types.js").Theme} Theme */
/** @typedef {import("../types.js").Cx} Cx */
/** @typedef {import("../types.js").IssueFull} IssueFull */
/** @typedef {import("../types.js").Attachment} Attachment */
/** @typedef {Awaited<ReturnType<typeof jiraSource>>} JiraSource */

const CHECK_MS = 700; // only a shared read

/**
 * @param {Theme} t
 * @param {string} id
 * @param {string} label
 * @param {(cx: Cx) => void} act
 */
function headerButton(t, id, label, act) {
  return div()
    .id(id)
    .px(6)
    .py(2)
    .rounded(4)
    .cursor_pointer()
    .text_color(t.dim)
    .hover((e) => e.bg(t.hover).text_color(t.foreground))
    .on_click((_e, cx) => act(cx))
    .child(label);
}

export class PanelView {
  /** @type {string | null} */ key = null;
  /** @type {IssueFull | null} */ data = null;
  /** @type {string | null} */ error = null;
  loading = false;
  gen = 0;
  /** @type {JiraSource | null} */ jira = null;
  /** @type {Record<string, string | null>} */ images = {};
  /** @type {string[]} */ back = [];
  /** @type {string | null} */ shownFromShared = null;

  /** @param {Cx} cx */
  init(cx) {
    Object.assign(this, {
      key: null,
      data: null,
      error: null,
      loading: false,
      gen: 0,
      jira: null,
      images: {},
      back: [],
    });
    const check = (/** @type {Cx} */ cx) => {
      const k = /** @type {string | null} */ (shared(PANEL.key));
      if (k && k !== this.shownFromShared) {
        this.shownFromShared = k;
        this.back = [];
        this.load(k, cx);
      }
    };
    check(cx);
    cx.timer.every(CHECK_MS, check);
  }

  /**
   * @param {string} key
   * @param {Cx} cx
   */
  load(key, cx) {
    const gen = ++this.gen;
    Object.assign(this, { key, loading: true, error: null, images: {} });
    cx.notify();
    cx.spawn(async (cx) => {
      try {
        this.jira = await jiraSource(); // demo mode may have changed since the last issue
        const data = await this.jira.issueFull(key);
        if (gen !== this.gen) return;
        this.data = data;
      } catch (e) {
        if (gen === this.gen) this.error = e instanceof Error ? e.message : String(e);
      }
      if (gen !== this.gen) return;
      this.loading = false;
      cx.notify();
      await this.loadImages(gen, cx);
    });
  }

  /**
   * Downloads the issue's image attachments one by one, redrawing as each arrives.
   * @param {number} gen
   * @param {Cx} cx
   */
  async loadImages(gen, cx) {
    for (const a of (this.data?.attachments ?? []).filter((x) => x.isImage)) {
      const path = await this.jira.cacheImage(a).catch(() => null);
      if (gen !== this.gen) return;
      this.images = { ...this.images, [a.name]: path };
      cx.notify();
    }
  }

  /** @param {IssueFull} i */
  imageNames(i) {
    return new Set(i.attachments.filter((a) => a.isImage).map((a) => a.name));
  }

  /**
   * @param {string} key
   * @param {Cx} cx
   */
  openLinked(key, cx) {
    this.back.push(this.key);
    this.load(key, cx);
  }

  /** @param {Cx} cx */
  goBack(cx) {
    const key = this.back.pop();
    if (key) this.load(key, cx);
  }

  /** @param {string} [url] */
  openUrl(url) {
    if (url) exec("open", [url]);
  }

  /** @param {Theme} t */
  topBar(t) {
    return h_flex()
      .h(36)
      .px(10)
      .gap(4)
      .items_center()
      .border_b(1)
      .border_color(t.border)
      .when(this.back.length > 0, (e) => e.child(headerButton(t, "jv-back", "←", (cx) => this.goBack(cx))))
      .child(
        div()
          .flex_1()
          .font_semibold()
          .text_color(t.accent)
          .child(this.key ?? "Jira"),
      )
      .when(Boolean(this.key), (e) =>
        e
          .child(headerButton(t, "jv-open", "↗", () => this.openUrl(this.jira?.browseUrl(this.key))))
          .child(headerButton(t, "jv-refresh", "⟳", (cx) => this.load(this.key, cx))),
      )
      .child(headerButton(t, "jv-hide", "✕", () => run("layout.hide", { id: PANEL.block })));
  }

  /**
   * @param {Theme} t
   * @param {IssueFull} i
   */
  details(t, i) {
    return [
      fact(t, "Assignee", i.assignee),
      fact(t, "Reporter", i.reporter?.name),
      fact(t, "Sprint", i.sprint),
      fact(t, "Labels", i.labels.join(", ")),
      fact(t, "Parent", i.parent),
      fact(t, "Created", `${ago(i.created)} ago`),
      fact(t, "Updated", `${ago(i.updated)} ago`),
    ];
  }

  /**
   * @param {Theme} t
   * @param {IssueFull} i
   */
  links(t, i) {
    return i.links.map((l, n) =>
      linkLine(t, {
        id: `jv-link-${n}`,
        text: `${l.how} ${l.key} · ${l.summary} — ${l.status}`,
        color: l.how.includes("block") ? t.blocked : t.foreground,
        act: (cx) => this.openLinked(l.key, cx),
      }),
    );
  }

  /**
   * @param {Theme} t
   * @param {IssueFull} i
   */
  comments(t, i) {
    return i.comments.map((c, n) =>
      v_flex()
        .gap(2)
        .py(4)
        .border_t(1)
        .border_color(t.border)
        .child(
          div()
            .text_size(11)
            .text_color(t.dim)
            .child(`${c.author} · ${ago(c.created)} ago`),
        )
        .child(
          richText(t, {
            id: `jv-c-${this.gen}-${n}`,
            text: c.body,
            images: this.images,
            imageNames: this.imageNames(i),
            size: 12,
          }),
        ),
    );
  }

  /**
   * @param {Theme} t
   * @param {IssueFull} i
   */
  issueBody(t, i) {
    const openAttachment = (/** @type {Attachment} */ a) => this.openUrl(this.jira.attachmentUrl(a.id));
    return v_flex()
      .gap(4)
      .child(
        h_flex()
          .gap(8)
          .items_center()
          .child(div().text_size(12).px(6).py(1).rounded(4).bg(t.raised).child(i.status))
          .child(
            div()
              .text_size(12)
              .text_color(URGENT.has(i.priority) ? t.blocked : t.dim)
              .child(`${i.type} · ${i.priority}`),
          ),
      )
      .child(div().pt(4).text_size(16).font_semibold().child(i.summary))
      .child(section(t, "Details"))
      .children(this.details(t, i))
      .when(i.links.length > 0, (e) => e.child(section(t, "Links")).children(this.links(t, i)))
      .when(Boolean(i.checklist), (e) =>
        e.child(checklistView(t, { checklist: i.checklist, open: () => this.openUrl(i.url) })),
      )
      .when(i.fields.length > 0, (e) => e.child(customFields(t, { fields: i.fields, gen: this.gen })))
      .child(section(t, "Description"))
      .child(
        richText(t, {
          id: `jv-desc-${this.gen}`,
          text: i.description || "_No description_",
          images: this.images,
          imageNames: this.imageNames(i),
        }),
      )
      .when(i.attachments.length > 0, (e) =>
        e
          .child(section(t, `Attachments (${i.attachments.length})`))
          .child(attachmentList(t, { attachments: i.attachments, images: this.images, open: openAttachment })),
      )
      .child(section(t, `Comments (${i.comments.length})`))
      .children(this.comments(t, i));
  }

  render() {
    const t = /** @type {Theme} */ (theme()); // theme() is Record<string, string>; colors want `#…`
    const i = this.data;
    return v_flex()
      .id("jira-view")
      .size_full()
      .bg(t.surface)
      .text_size(13)
      .text_color(t.foreground)
      .child(this.topBar(t))
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
          .when(Boolean(i) && !this.loading, (e) => e.child(this.issueBody(t, i))),
      );
  }
}
