import test from "node:test";
import assert from "node:assert/strict";
import {
  applyCanonicalChapterFieldsToPlanChapter,
  resolveChapterExpectationFromPlan,
} from "../src/services/novel/volume/chapterPlanningFieldMapping.ts";

function buildPlanChapter(overrides = {}) {
  return {
    id: "plan-1",
    volumeId: "vol-1",
    chapterId: "ch-1",
    chapterOrder: 1,
    beatKey: "open_hook",
    title: "距离本书太监，还有五章",
    summary: "楚天在青云宗后山接了猎杀铁皮猪任务，面板弹出陨石警告。",
    purpose: "建立金手指（高维数据面板）概念，明确字数=寿命规则。",
    exclusiveEvent: null,
    endingState: null,
    nextChapterEntryState: null,
    conflictLevel: null,
    conflictLevelSource: "user",
    revealLevel: null,
    targetWordCount: null,
    mustAvoid: null,
    taskSheet: "写出套路开局。",
    sceneCards: null,
    styleContract: null,
    payoffRefs: [],
    createdAt: "2026-08-08T00:00:00.000Z",
    updatedAt: "2026-08-08T00:00:00.000Z",
    ...overrides,
  };
}

test("hydrate maps Chapter.expectation to purpose and keeps outline summary", () => {
  const plan = buildPlanChapter();
  const next = applyCanonicalChapterFieldsToPlanChapter(plan, {
    id: "ch-1",
    order: 1,
    title: plan.title,
    expectation: plan.purpose,
    taskSheet: plan.taskSheet,
  });

  assert.equal(next.summary, plan.summary);
  assert.equal(next.purpose, plan.purpose);
  assert.notEqual(next.summary, next.purpose);
});

test("hydrate does not replace distinct summary with expectation goal text", () => {
  const plan = buildPlanChapter();
  const next = applyCanonicalChapterFieldsToPlanChapter(plan, {
    id: "ch-1",
    order: 1,
    title: plan.title,
    expectation: "建立金手指（高维数据面板）概念，明确字数=寿命规则。",
  });

  assert.match(next.summary, /铁皮猪|陨石/);
  assert.match(next.purpose ?? "", /金手指|寿命/);
});

test("legacy expectation-only chapter still fills empty planning fields", () => {
  const plan = buildPlanChapter({
    summary: "",
    purpose: null,
    taskSheet: null,
  });
  const next = applyCanonicalChapterFieldsToPlanChapter(plan, {
    id: "ch-legacy",
    order: 1,
    title: "旧章",
    expectation: "只有执行区目标",
  });

  assert.equal(next.summary, "只有执行区目标");
  assert.equal(next.purpose, "只有执行区目标");
});

test("sync expectation prefers purpose over summary", () => {
  assert.equal(
    resolveChapterExpectationFromPlan({
      purpose: "章节目标",
      summary: "章节摘要",
    }),
    "章节目标",
  );
  assert.equal(
    resolveChapterExpectationFromPlan({
      purpose: null,
      summary: "章节摘要",
    }),
    "章节摘要",
  );
});
