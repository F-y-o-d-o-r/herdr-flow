import { test } from "node:test";
import assert from "node:assert/strict";
import {
  adfText,
  attachmentsFrom,
  checklistFrom,
  customFieldsFrom,
  splitImages,
} from "../mod/jira/jiraFormatHelpers.js";

test("adfText marks images by file name", () => {
  const doc = {
    type: "doc",
    content: [{ type: "mediaSingle", content: [{ type: "media", attrs: { alt: "shot.png", type: "file" } }] }],
  };
  assert.match(adfText(doc), /\[\[image:shot\.png\]\]/);
});

test("splitImages: text and image parts in order", () => {
  assert.deepEqual(splitImages("a\n[[image:x.png]]\nb"), [{ text: "a\n" }, { image: "x.png" }, { text: "\nb" }]);
  assert.deepEqual(splitImages("plain"), [{ text: "plain" }]);
});

test("attachmentsFrom: name, size, image flag", () => {
  const list = attachmentsFrom([
    { id: "1", filename: "a.png", mimeType: "image/png", size: 2048 },
    { id: "2", filename: "b.zip", mimeType: "application/zip", size: 10 },
  ]);
  assert.deepEqual(
    list.map((a) => [a.name, a.isImage]),
    [
      ["a.png", true],
      ["b.zip", false],
    ],
  );
  assert.equal(list[0].sizeText, "2 KB");
});

test("customFieldsFrom: filled text-like fields by their Jira name, junk hidden", () => {
  const fields = {
    customfield_1: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Open it" }] }] },
    customfield_2: "0|i07c38:",
    customfield_3: null,
    customfield_4: { value: "Always" },
    customfield_5: "{}",
    summary: "not custom",
  };
  const names = {
    customfield_1: "How to test",
    customfield_2: "Rank",
    customfield_3: "How to deploy",
    customfield_4: "Stability",
    customfield_5: "development",
  };
  assert.deepEqual(customFieldsFrom(fields, names), [
    { name: "How to test", text: "Open it" },
    { name: "Stability", text: "Always" },
  ]);
});

test("checklistFrom: done state and counts", () => {
  const c = checklistFrom({
    hasItems: true,
    progressText: "Checklist: 2/2",
    items: "update fix",
    allItemsCompleted: true,
    uncheckedItems: 0,
  });
  assert.equal(c.done, true);
  assert.equal(c.summary, "update fix");
});
