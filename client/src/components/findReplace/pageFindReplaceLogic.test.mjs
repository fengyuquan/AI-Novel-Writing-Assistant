import test from "node:test";
import assert from "node:assert/strict";

import {
  countMatchesInText,
  escapeRegExp,
  replaceAllInText,
} from "./pageFindReplaceLogic.ts";

test("escapeRegExp keeps literal special characters", () => {
  assert.equal(escapeRegExp("a+b*c?"), String.raw`a\+b\*c\?`);
});

test("countMatchesInText respects case sensitivity", () => {
  assert.equal(countMatchesInText("Foo foo FOO", "foo", { caseSensitive: false }), 3);
  assert.equal(countMatchesInText("Foo foo FOO", "foo", { caseSensitive: true }), 1);
});

test("replaceAllInText replaces every match and reports count", () => {
  const result = replaceAllInText("张三和张三的朋友", "张三", "李四", { caseSensitive: true });
  assert.equal(result.nextText, "李四和李四的朋友");
  assert.equal(result.replacedCount, 2);
});

test("replaceAllInText no-ops on empty query", () => {
  const result = replaceAllInText("abc", "", "x", { caseSensitive: false });
  assert.equal(result.nextText, "abc");
  assert.equal(result.replacedCount, 0);
});
