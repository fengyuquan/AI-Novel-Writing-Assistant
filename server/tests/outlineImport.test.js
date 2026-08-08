import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  mergeImportedOutlineIntoVolumes,
  parseChapterOutlineMarkdown,
} from "@ai-novel/shared/utils/outlineImport";
import { applyOutlineImportConflictChoices } from "@ai-novel/shared/utils/outlineImportConflictApply";
import { extractOutlineBootstrapHints } from "@ai-novel/shared/utils/outlineBootstrapHints";
import { buildOutlineStrategyAndBeatSheets } from "@ai-novel/shared/utils/outlinePlanningBootstrap";
import { shouldEnforceExecutionContractSyncGate } from "@ai-novel/shared/types/chapterTaskSheetQuality";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sampleOutlinePath = path.join(repoRoot, "大纲.md");

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

test("outline task notes merge into shells that skip execution-contract sync gate", () => {
  const parsed = parseChapterOutlineMarkdown(`### 第一阶段：开端（第1-2章）

**第1章：距离本书太监，还有五章**
*   **章节摘要**：楚天打铁皮猪时看到陨石警告。
*   **章节目标**：建立高维数据面板概念。
*   **章节任务单**：
    1. 写出套路开局。
    2. 抛出陨石警告。

**第2章：给老子水！走马灯是这么用的！**
*   **章节摘要**：打猪花了一整章。
*   **章节目标**：展示水字数神通。
*   **章节任务单**：
    1. 引入师妹视角。
`);
  const merged = mergeImportedOutlineIntoVolumes([], parsed, { novelId: "novel-outline" });
  assert.equal(parsed.chapterCount, 2);
  assert.ok(merged[0].chapters[0].taskSheet?.includes("套路开局"));
  assert.equal(merged[0].chapters[0].sceneCards, null);
  for (const chapter of merged[0].chapters) {
    assert.equal(
      shouldEnforceExecutionContractSyncGate(chapter),
      false,
      `chapter ${chapter.chapterOrder} must not hard-block sync`,
    );
  }
});

test("repo 大纲.md parses and stays syncable as planning shells", { skip: !existsSync(sampleOutlinePath) }, () => {
  const text = readFileSync(sampleOutlinePath, "utf8");
  const parsed = parseChapterOutlineMarkdown(text);
  assert.equal(parsed.confidence, "high");
  assert.ok(parsed.chapterCount >= 30, `expected >=30 chapters, got ${parsed.chapterCount}`);
  assert.equal(parsed.volumes.length, 1, "empty long-line volumes should be dropped");
  assert.ok(parsed.issues.some((item) => item.includes("没有具体章节的卷标题")));
  const merged = mergeImportedOutlineIntoVolumes([], parsed, { novelId: "novel-from-outline-md" });
  const chapters = merged.flatMap((volume) => volume.chapters);
  assert.equal(chapters.length, parsed.chapterCount);
  assert.ok(chapters.every((chapter) => chapter.sceneCards == null || !String(chapter.sceneCards).trim()));
  assert.ok(chapters.every((chapter) => !shouldEnforceExecutionContractSyncGate(chapter)));
  assert.match(chapters[0].title, /太监|五章/);
  assert.ok(chapters[0].taskSheet?.trim());

  const hints = extractOutlineBootstrapHints(text);
  assert.equal(hints.title, "我这本小说的字数快不够了");
  assert.ok(hints.worldSourceText?.includes("高维面板") || hints.worldSourceText?.includes("追读"));
  assert.ok(hints.first30ChapterPromise?.includes("滑稽") || hints.first30ChapterPromise?.includes("倒计时"));
  assert.ok(hints.characterNameHints.includes("楚天"));
});

test("extractOutlineBootstrapHints lifts labeled preamble sections", () => {
  const hints = extractOutlineBootstrapHints(`# 《测试长书》大纲

这是一份为新手准备的双轨设定说明，用来验证开书草稿抽取。

## 核心机制与世界观设定
* 表层：东方玄幻
* 隐藏：追读面板决定天道

## 前30章精准落地计划：开局承诺
核心体验是滑稽求生与悬念拉升。

**第1章：开局**
*   **章节摘要**：主角出场。
`);
  assert.equal(hints.title, "测试长书");
  assert.match(hints.worldSourceText ?? "", /追读面板/);
  assert.match(hints.first30ChapterPromise ?? "", /滑稽求生/);
});

test("parseChapterOutlineMarkdown drops empty long-line volumes", () => {
  const parsed = parseChapterOutlineMarkdown(`### 第一卷：开端（第1-100章）
* 卷核心目标：活下去

### 第二卷：中盘（第101-200章）
* 卷核心目标：上架

**第1章：开场**
*   **章节摘要**：开始。
`);
  assert.equal(parsed.chapterCount, 1);
  assert.equal(parsed.volumes.length, 1);
  assert.match(parsed.volumes[0].title, /开端/);
});

test("parseChapterOutlineMarkdown attaches stage labels for beat grouping", () => {
  const parsed = parseChapterOutlineMarkdown(`### 第一阶段：开局求生（第1-2章）

**第1章：开场**
*   **章节摘要**：危机出现。

**第2章：应对**
*   **章节摘要**：初步摸清机制。

### 第二阶段：阴谋升级（第3-3章）

**第3章：反转**
*   **章节摘要**：更大阴谋。
`);
  assert.equal(parsed.chapterCount, 3);
  assert.match(parsed.volumes[0].chapters[0].stageLabel ?? "", /开局求生/);
  assert.match(parsed.volumes[0].chapters[1].stageLabel ?? "", /开局求生/);
  assert.match(parsed.volumes[0].chapters[2].stageLabel ?? "", /阴谋升级/);
});

test("buildOutlineStrategyAndBeatSheets fills strategy skeleton and chapter beatKeys", () => {
  const parsed = parseChapterOutlineMarkdown(`### 第一阶段：开局

**第1章：夜市**
*   **章节摘要**：夺印。
*   **章节目标**：建立危机。

**第2章：追逃**
*   **章节摘要**：脱身。
`);
  const merged = mergeImportedOutlineIntoVolumes([], parsed, { novelId: "novel-plan" });
  const planned = buildOutlineStrategyAndBeatSheets({
    volumes: merged,
    parsed,
    bootstrap: {
      title: "测试书",
      description: "一本测试小说",
      targetAudience: "爽文读者",
      commercialTags: ["玄幻", "元小说", "搞笑"],
      bookSellingPoint: "打破第四面墙",
      competingFeel: "类似某爆款",
      first30ChapterPromise: "五章内建立追读危机",
      characters: [{ name: "楚天", role: "主角", personality: "机灵", background: "宗门弟子", selected: true }],
      worldDraft: null,
    },
  });

  assert.equal(planned.strategyPlan.recommendedVolumeCount, 1);
  assert.ok(planned.volumes[0].openingHook?.trim());
  assert.ok(planned.volumes[0].mainPromise?.trim());
  assert.ok(planned.volumes[0].climax?.trim());
  assert.equal(planned.beatSheets.length, 1);
  assert.equal(planned.beatSheets[0].beats.length, 6);
  assert.deepEqual(
    planned.beatSheets[0].beats.map((beat) => beat.key),
    ["open_hook", "first_escalation", "midpoint_turn", "pressure_lock", "climax", "end_hook"],
  );
  assert.ok(planned.volumes[0].chapters.every((chapter) => Boolean(chapter.beatKey?.trim())));
  assert.ok(planned.beatSheets[0].beats.every((beat) => beat.mustDeliver.length > 0));
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
