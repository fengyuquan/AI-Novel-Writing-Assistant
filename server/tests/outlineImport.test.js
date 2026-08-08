import test from "node:test";
import assert from "node:assert/strict";
import {
  mergeImportedOutlineIntoVolumes,
  parseChapterOutlineMarkdown,
} from "@ai-novel/shared/utils/outlineImport";
import { applyOutlineImportConflictChoices } from "@ai-novel/shared/utils/outlineImportConflictApply";

test("parseChapterOutlineMarkdown reads template chapters and labels", () => {
  const parsed = parseChapterOutlineMarkdown(`# 第1卷 开端

## 第1章 夜市夺印
摘要：主角在夜市失手夺印
必写：印上有家族徽记
禁写：不要提前揭穿幕后黑手

## 第2章 雨巷追逃
雨中脱身，第一次感到被盯上
`);

  assert.equal(parsed.confidence, "high");
  assert.equal(parsed.hasVolumeMarkers, true);
  assert.equal(parsed.chapterCount, 2);
  assert.equal(parsed.volumes[0].title, "开端");
  assert.equal(parsed.volumes[0].chapters[0].title, "夜市夺印");
  assert.match(parsed.volumes[0].chapters[0].summary, /夜市/);
  assert.match(parsed.volumes[0].chapters[0].purpose ?? "", /家族徽记/);
  assert.match(parsed.volumes[0].chapters[0].mustAvoid ?? "", /幕后黑手/);
  assert.equal(parsed.volumes[0].chapters[1].title, "雨巷追逃");
});

test("parseChapterOutlineMarkdown accepts numbered headings without volume markers", () => {
  const parsed = parseChapterOutlineMarkdown(`## 1. 初见
摘要：两人在码头相遇

## 2. 误认
摘要：身份被错认
`);
  assert.equal(parsed.confidence, "high");
  assert.equal(parsed.hasVolumeMarkers, false);
  assert.equal(parsed.chapterCount, 2);
});

test("parseChapterOutlineMarkdown marks freeform list as low confidence", () => {
  const parsed = parseChapterOutlineMarkdown(`第一章随便写点
第二章继续写
这里没有标准标题`);
  assert.equal(parsed.confidence, "low");
  assert.ok(parsed.chapterCount === 0 || parsed.issues.length > 0);
});

test("parseChapterOutlineMarkdown keeps bold chapter titles and labeled fields verbatim", () => {
  const parsed = parseChapterOutlineMarkdown(`### 第一卷：开端（第1-100章）

## 核心机制与世界观设定
这不是章节

**第1章：距离本书太监，还有五章**
*   **章节摘要**：楚天打铁皮猪时看到陨石警告。
*   **章节目标**：建立高维数据面板概念。
*   **章节任务单**：
    1. 写出套路开局。
    2. 抛出陨石警告。

**第2章：给老子水！走马灯是这么用的！**
*   **章节摘要**：打猪花了一整章。
`);

  assert.equal(parsed.confidence, "high");
  assert.equal(parsed.hasVolumeMarkers, true);
  assert.equal(parsed.chapterCount, 2);
  assert.equal(parsed.volumes[0].title, "开端（第1-100章）");
  assert.equal(parsed.volumes[0].chapters[0].title, "距离本书太监，还有五章");
  assert.equal(parsed.volumes[0].chapters[0].summary, "楚天打铁皮猪时看到陨石警告。");
  assert.equal(parsed.volumes[0].chapters[0].purpose, "建立高维数据面板概念。");
  assert.match(parsed.volumes[0].chapters[0].taskSheet ?? "", /写出套路开局/);
  assert.match(parsed.volumes[0].chapters[0].taskSheet ?? "", /抛出陨石警告/);
  assert.equal(parsed.volumes[0].chapters[1].title, "给老子水！走马灯是这么用的！");
  assert.doesNotMatch(
    parsed.volumes[0].chapters.map((item) => item.title).join("|"),
    /核心机制|第一卷/,
  );
});

test("mergeImportedOutlineIntoVolumes creates volume shells from empty workspace", () => {
  const parsed = parseChapterOutlineMarkdown(`# 第1卷 开端

## 第1章 夜市夺印
摘要：夺印

## 第2章 雨巷追逃
摘要：脱身
`);
  const merged = mergeImportedOutlineIntoVolumes([], parsed, {
    novelId: "novel-new",
    now: "2026-08-08T00:00:00.000Z",
  });
  assert.equal(merged.length, 1);
  assert.equal(merged[0].novelId, "novel-new");
  assert.equal(merged[0].title, "开端");
  assert.equal(merged[0].chapters.length, 2);
  assert.equal(merged[0].chapters[0].title, "夜市夺印");
  assert.equal(merged[0].chapters[1].chapterOrder, 2);
});

test("mergeImportedOutlineIntoVolumes replaces chapters and keeps volume shell", () => {
  const existing = [{
    id: "vol-1",
    novelId: "novel-1",
    sortOrder: 1,
    title: "旧卷名",
    summary: "保留摘要",
    openingHook: "钩子",
    mainPromise: "",
    primaryPressureSource: "",
    coreSellingPoint: "",
    escalationMode: "",
    protagonistChange: "",
    midVolumeRisk: "",
    climax: "",
    payoffType: "",
    nextVolumeHook: "",
    resetPoint: "",
    openPayoffs: ["旧伏笔"],
    status: "draft",
    sourceVersionId: null,
    chapters: [{
      id: "old-ch",
      volumeId: "vol-1",
      chapterId: "exec-1",
      chapterOrder: 1,
      title: "旧章",
      summary: "旧",
      payoffRefs: [],
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    }],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  }];

  const parsed = parseChapterOutlineMarkdown(`## 第1章 新开局
摘要：新剧情
`);
  const merged = mergeImportedOutlineIntoVolumes(existing, parsed, {
    novelId: "novel-1",
    now: "2026-08-08T00:00:00.000Z",
  });

  assert.equal(merged.length, 1);
  assert.equal(merged[0].id, "vol-1");
  assert.equal(merged[0].summary, "保留摘要");
  assert.deepEqual(merged[0].openPayoffs, ["旧伏笔"]);
  assert.equal(merged[0].chapters.length, 1);
  assert.equal(merged[0].chapters[0].title, "新开局");
  assert.equal(merged[0].chapters[0].chapterId, null);
  assert.equal(merged[0].chapters[0].conflictLevelSource, "user");
});

test("applyOutlineImportConflictChoices appends mustAvoid and collects pending alignments", () => {
  const volumes = [{
    id: "vol-1",
    novelId: "novel-1",
    sortOrder: 1,
    title: "开端",
    summary: "",
    openingHook: "",
    mainPromise: "",
    primaryPressureSource: "",
    coreSellingPoint: "",
    escalationMode: "",
    protagonistChange: "",
    midVolumeRisk: "",
    climax: "",
    payoffType: "",
    nextVolumeHook: "",
    resetPoint: "",
    openPayoffs: [],
    status: "draft",
    sourceVersionId: null,
    chapters: [{
      id: "ch-1",
      volumeId: "vol-1",
      chapterId: null,
      chapterOrder: 1,
      title: "夜市夺印",
      summary: "夺印成功",
      mustAvoid: null,
      payoffRefs: [],
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    }, {
      id: "ch-2",
      volumeId: "vol-1",
      chapterId: null,
      chapterOrder: 2,
      title: "雨巷追逃",
      summary: "脱身",
      mustAvoid: "勿提前揭秘",
      payoffRefs: [],
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    }],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  }];

  const conflicts = [{
    conflictId: "c1",
    category: "character",
    severity: "blocking",
    title: "主角身份冲突",
    summary: "大纲写主角是孤儿，角色卡写有家族。",
    settingRef: {
      type: "character",
      id: "char-1",
      label: "主角",
      excerpt: "有显赫家族",
    },
    outlineRef: {
      volumeTitle: "开端",
      chapterOrder: 1,
      chapterTitle: "夜市夺印",
      excerpt: "孤儿出身",
    },
    recommendedChoice: "keep_setting",
  }, {
    conflictId: "c2",
    category: "world",
    severity: "warning",
    title: "世界规则冲突",
    summary: "大纲出现禁术，世界规则禁止。",
    settingRef: {
      type: "world",
      label: "禁术规则",
      excerpt: "禁术不可出现",
    },
    outlineRef: {
      chapterOrder: 2,
      chapterTitle: "雨巷追逃",
      excerpt: "使用禁术脱身",
    },
    recommendedChoice: "keep_outline",
  }];

  const result = applyOutlineImportConflictChoices({
    volumes,
    conflicts,
    choices: {
      c1: "keep_setting",
      c2: "keep_outline",
    },
    now: "2026-08-08T12:00:00.000Z",
  });

  assert.match(result.volumes[0].chapters[0].mustAvoid ?? "", /须符合既有设定（主角）/);
  assert.equal(result.volumes[0].chapters[0].summary, "夺印成功");
  assert.equal(result.volumes[0].chapters[1].mustAvoid, "勿提前揭秘");
  assert.equal(result.pendingAlignments.length, 1);
  assert.equal(result.pendingAlignments[0].conflictId, "c2");
  assert.equal(result.pendingAlignments[0].choice, "keep_outline");
});
