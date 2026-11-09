// Parts of the Jira side panel: titles, facts, text with images, attachments, fields, checklist.
import { div, image } from "gpui-kit";
import { h_flex, v_flex, TextView } from "gpui-base";
import { splitImages } from "./format.js";

/** @typedef {import("../types.js").Theme} Theme */
/** @typedef {import("../types.js").Cx} Cx */
/** @typedef {import("../types.js").Attachment} Attachment */
/** @typedef {import("../types.js").Checklist} Checklist */
/** @typedef {import("../types.js").CustomField} CustomField */
/** @typedef {Record<string, string | null>} ImagePaths attachment name -> cached path, null if it failed */

/**
 * @param {Theme} t
 * @param {string} title
 */
export function section(t, title) {
  return div().pt(10).pb(2).text_size(11).font_semibold().text_color(t.dim).child(title.toUpperCase());
}

/**
 * @param {Theme} t
 * @param {string} name
 * @param {string} [value]
 */
export function fact(t, name, value) {
  return h_flex()
    .gap(8)
    .text_size(12)
    .child(div().w(80).flex_none().text_color(t.dim).child(name))
    .child(
      div()
        .flex_1()
        .min_w(0)
        .truncate()
        .child(value || "—"),
    );
}

/**
 * @param {Theme} t
 * @param {{ id: string, text: string, color?: any, act: (cx: Cx) => void }} line
 */
export function linkLine(t, { id, text, color = undefined, act }) {
  return div()
    .id(id)
    .text_size(12)
    .cursor_pointer()
    .rounded(4)
    .hover((s) => s.bg(t.hover))
    .text_color(color ?? t.foreground)
    .on_click((_e, cx) => act(cx))
    .child(text);
}

/**
 * @param {Theme} t
 * @param {string | null | undefined} path undefined while loading
 * @param {string} name
 */
function imageBox(t, path, name) {
  if (path === undefined) return div().text_size(11).text_color(t.dim).child(`🖼 ${name} (loading…)`);
  if (!path) return div().text_size(11).text_color(t.dim).child(`🖼 ${name}`);
  return div().w_full().h(220).rounded(6).overflow_hidden().bg(t.raised).child(image(path).size_full());
}

/**
 * A media mark in text: an image attachment we load, else a pointer to the attachments list.
 * @param {Theme} t
 * @param {string} name
 * @param {{ images: ImagePaths, imageNames: Set<string> }} known
 */
function mediaBox(t, name, { images, imageNames }) {
  if (imageNames.has(name)) return imageBox(t, images[name], name);
  const label = /^[0-9a-f-]{36}$/.test(name) ? "attached file" : name;
  return div().text_size(11).text_color(t.dim).child(`📎 ${label} (see Attachments)`);
}

/**
 * Markdown text with its [[image:name]] marks drawn as the cached images.
 * @param {Theme} t
 * @param {{ id: string, text: string, images: ImagePaths, imageNames: Set<string>, size?: number }} options
 */
export function richText(t, { id, text, images, imageNames, size = 13 }) {
  return v_flex()
    .gap(6)
    .children(
      splitImages(text || "").map((part, n) =>
        part.image
          ? mediaBox(t, part.image, { images, imageNames })
          : TextView.markdown(`${id}-${n}`, part.text).selectable(true).text_size(size),
      ),
    );
}

/**
 * Attachments: images shown, other files listed (click opens it in Jira in the browser).
 * @param {Theme} t
 * @param {{ attachments: Attachment[], images: ImagePaths, open: (a: Attachment) => void }} options
 */
export function attachmentList(t, { attachments, images, open }) {
  return v_flex()
    .gap(4)
    .children(
      attachments.map((a) =>
        v_flex()
          .gap(2)
          .child(linkLine(t, { id: `jv-att-${a.id}`, text: `📎 ${a.name} · ${a.sizeText}`, act: () => open(a) }))
          .when(a.isImage, (e) => e.child(imageBox(t, images[a.name], a.name))),
      ),
    );
}

/**
 * Filled custom fields (How to test, Environment…), each a small section.
 * @param {Theme} t
 * @param {{ fields: CustomField[], gen: number }} options
 */
export function customFields(t, { fields, gen }) {
  return v_flex()
    .gap(2)
    .children(
      fields.map((f, n) =>
        v_flex()
          .child(section(t, f.name))
          .child(TextView.markdown(`jv-f-${gen}-${n}`, f.text).selectable(true).text_size(12)),
      ),
    );
}

/**
 * The checklist app shows only a summary through Jira; editing happens in the browser.
 * @param {Theme} t
 * @param {{ checklist: Checklist, open: () => void }} options
 */
export function checklistView(t, { checklist, open }) {
  const state = checklist.done ? "all done" : `${checklist.unchecked} left`;
  return v_flex()
    .gap(2)
    .child(section(t, `${checklist.progress} · ${state}`))
    .child(div().text_size(12).text_color(t.dim).child(checklist.summary))
    .child(linkLine(t, { id: "jv-checklist", text: "↗ edit the checklist in Jira", color: t.accent, act: open }));
}
