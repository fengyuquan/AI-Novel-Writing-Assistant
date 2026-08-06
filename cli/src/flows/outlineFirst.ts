import fs from "node:fs";
import path from "node:path";
import type { DirectorTaskSnapshot } from "@ai-novel/shared/types/directorRuntime";
import type { DirectorCandidate } from "@ai-novel/shared/types/novelDirector";
import type { Chapter } from "@ai-novel/shared/types/novel";
import type { NovelCliApi } from "../api.js";
import type { CliSession } from "../session.js";
import {
  DEFAULT_OUTLINE_FIRST_PROFILE,
  getCliProfilePath,
  loadCliProfile,
  updateOutlineFirstProfile,
  type OutlineFirstProfile,
} from "../profile.js";
import { ask, choose, confirm } from "../lib/prompt.js";
import {
  printBlank,
  printInfo,
  printKeyValues,
  printProgress,
  printSuccess,
  printTitle,
  printWarn,
} from "../lib/print.js";
import { requireNovel } from "./novels.js";
import { printDirectorSnapshot } from "./progress.js";
import { waitForCandidateBatch, waitUntilDirectorSettled } from "./waitCommand.js";

export async function outlineFirstMenu(
  api: NovelCliApi,
  session: CliSession,
  pollIntervalMs: number,
): Promise<void> {
  let running = true;
  while (running) {
    const profile = loadCliProfile().outlineFirst;
    printBlank();
    printTitle("大纲优先开书");
    printInfo("先生成每章标题与详细大纲，不写正文；设置可保存，下次直接复用。");
    printKeyValues([
      ["期望章数", String(profile.estimatedChapterCount)],
      ["每章字数不少于", `${profile.minChapterWords} 字`],
      ["配置文件", getCliProfilePath()],
    ]);

    const action = await choose("选择操作", [
      {
        value: "run",
        label: "用已保存设置开始大纲优先开书",
        hint: `${profile.estimatedChapterCount} 章 · 每章 ≥ ${profile.minChapterWords} 字`,
      },
      { value: "settings", label: "修改并保存设置", hint: "章数 / 每章字数" },
      { value: "export", label: "导出当前书的章节大纲", hint: "Markdown" },
      { value: "back", label: "返回主菜单" },
    ]);

    switch (action) {
      case "run":
        await runOutlineFirstDirector(api, session, pollIntervalMs, profile);
        break;
      case "settings":
        await editOutlineFirstSettings();
        break;
      case "export":
        await exportChapterOutlines(api, session);
        break;
      case "back":
        running = false;
        break;
      default:
        break;
    }
  }
}

async function editOutlineFirstSettings(): Promise<void> {
  const current = loadCliProfile().outlineFirst;
  printTitle("大纲优先设置");
  const chapterCountRaw = await ask("期望总章数", String(current.estimatedChapterCount));
  const wordsRaw = await ask("每章默认字数不少于", String(current.minChapterWords));
  const prefer = await confirm("下次主菜单优先提示“大纲优先开书”吗？", current.preferOutlineFirst);

  const saved = updateOutlineFirstProfile({
    estimatedChapterCount: Number(chapterCountRaw),
    minChapterWords: Number(wordsRaw),
    preferOutlineFirst: prefer,
  });

  printSuccess("设置已保存，下次可直接选用。");
  printKeyValues([
    ["期望章数", String(saved.estimatedChapterCount)],
    ["每章字数不少于", `${saved.minChapterWords} 字`],
    ["路径", getCliProfilePath()],
  ]);
}

async function runOutlineFirstDirector(
  api: NovelCliApi,
  session: CliSession,
  pollIntervalMs: number,
  profile: OutlineFirstProfile,
): Promise<void> {
  if (!(await requireNovel(session))) {
    return;
  }

  printTitle("大纲优先 · 自动导演");
  printInfo("本流程会：确认方向 → 生成卷章规划与每章详细大纲 → 停在开写前，不生成正文。");
  printWarn(`目标 ${profile.estimatedChapterCount} 章时，细化大纲可能较久，请保持终端运行。`);

  await api.updateNovel(session.novelId!, {
    estimatedChapterCount: profile.estimatedChapterCount,
    defaultChapterLength: profile.minChapterWords,
  });

  const idea = await ask("用一句话描述你想写的故事灵感");
  if (!idea.trim()) {
    printWarn("灵感不能为空。");
    return;
  }

  const planningHint = [
    `本书目标约 ${profile.estimatedChapterCount} 章，每章正文不少于 ${profile.minChapterWords} 字。`,
    "本次只做到“章节标题 + 详细大纲”，不要生成章节正文。",
    "每章详细大纲必须包含：章节标题、必须写的内容、不能写的内容，以及其他写作约束（字数、冲突强度、章末钩子、场景边界等）。",
  ].join("");

  printProgress("正在提交大纲优先导演任务…");
  const accepted = (await api.generateDirectorCandidates({
    idea: `${idea.trim()}\n\n【大纲优先要求】${planningHint}`,
    novelId: session.novelId ?? undefined,
    workflowTaskId: session.directorTaskId ?? undefined,
    estimatedChapterCount: profile.estimatedChapterCount,
    defaultChapterLength: profile.minChapterWords,
  })).data;

  if (!accepted?.commandId || !accepted.taskId) {
    printWarn("自动导演任务没有被受理。");
    return;
  }

  session.directorTaskId = accepted.taskId;
  printSuccess(`导演任务已创建：${accepted.taskId}`);

  const result = await waitForCandidateBatch(api, accepted.commandId, pollIntervalMs);
  if (result.workflowTaskId) {
    session.directorTaskId = result.workflowTaskId;
  }

  const batch = result.batch;
  printBlank();
  printTitle(`候选方向 · ${batch.roundLabel || `第 ${batch.round} 轮`}`);
  for (const [index, candidate] of batch.candidates.entries()) {
    printBlank();
    printInfo(`${index + 1}. ${candidate.workingTitle}`);
    printKeyValues([
      ["一句话", candidate.logline],
      ["卖点", candidate.sellingPoint],
      ["目标章数(候选)", String(candidate.targetChapterCount)],
      ["将采用章数", String(profile.estimatedChapterCount)],
      ["每章字数", String(profile.minChapterWords)],
    ]);
  }

  const selectedId = await choose(
    "选择一套方案继续（将生成详细大纲，不写正文）",
    [
      ...batch.candidates.map((candidate) => ({
        value: candidate.id,
        label: candidate.workingTitle,
        hint: candidate.logline.slice(0, 40),
      })),
      { value: "__cancel", label: "先不确认" },
    ],
  );
  if (selectedId === "__cancel") {
    return;
  }

  const candidate = batch.candidates.find((item) => item.id === selectedId);
  if (!candidate) {
    printWarn("未找到选中的方案。");
    return;
  }

  const withTitle = await maybePickTitle(candidate);
  // 强制候选章数对齐用户设置，避免后续规划漂回 80 章
  const alignedCandidate: DirectorCandidate = {
    ...withTitle,
    targetChapterCount: profile.estimatedChapterCount,
  };

  const ok = await confirm(
    `确认《${alignedCandidate.workingTitle}》，按 ${profile.estimatedChapterCount} 章 / 每章 ≥ ${profile.minChapterWords} 字生成大纲吗？`,
    true,
  );
  if (!ok) {
    return;
  }

  printProgress("正在确认方案并生成卷章规划与详细大纲…");
  const confirmAccepted = (await api.confirmDirectorCandidate(session.directorTaskId!, {
    idea: `${batch.idea || idea.trim()}\n\n【大纲优先要求】${planningHint}`,
    batchId: batch.id,
    round: batch.round,
    candidate: alignedCandidate,
    workflowTaskId: session.directorTaskId ?? undefined,
    estimatedChapterCount: profile.estimatedChapterCount,
    defaultChapterLength: profile.minChapterWords,
    stepCalibrationInstruction: planningHint,
  })).data;

  if (!confirmAccepted?.commandId) {
    printWarn("确认方案命令未受理。");
    return;
  }

  // 800 章细化可能很长：放宽轮询次数，并在到达开写交接点时停止
  await waitUntilDirectorSettled(api, session.directorTaskId!, pollIntervalMs, {
    maxAttempts: 3600,
    stopCheckpointTypes: ["production_experience_required", "step_review_required"],
  });

  const snapshot = (await api.getDirectorTaskSnapshot(session.directorTaskId!)).data?.snapshot ?? null;
  printDirectorSnapshot(snapshot);
  printSuccess("大纲优先阶段已停在“开写前”。当前不应生成章节正文。");

  let currentSnapshot = snapshot;
  while (snapshotNeedsAdvanceForOutline(currentSnapshot)) {
    const next = await choose("规划还在等待你操作，下一步？", [
      { value: "continue", label: "继续完善大纲", hint: "不进入正文写作" },
      { value: "approve", label: "批准当前关卡" },
      { value: "export", label: "先导出已有大纲" },
      { value: "stop", label: "先到这里" },
    ]);
    if (next === "stop") {
      break;
    }
    if (next === "export") {
      await exportChapterOutlines(api, session);
      continue;
    }
    if (next === "approve") {
      await api.approveDirectorGate(session.directorTaskId!);
    } else {
      await api.continueDirector(session.directorTaskId!);
    }
    await waitUntilDirectorSettled(api, session.directorTaskId!, pollIntervalMs, {
      maxAttempts: 3600,
      stopCheckpointTypes: ["production_experience_required", "step_review_required"],
    });
    currentSnapshot = (await api.getDirectorTaskSnapshot(session.directorTaskId!)).data?.snapshot ?? null;
    printDirectorSnapshot(currentSnapshot);
  }

  const shouldExport = await confirm("现在导出一份章节大纲 Markdown 吗？", true);
  if (shouldExport) {
    await exportChapterOutlines(api, session);
  }

  printInfo("之后可用“修改故事规划”继续用自然语言改大纲；准备写正文时再到网页端选择生产方式。");
}

function snapshotNeedsAdvanceForOutline(snapshot: DirectorTaskSnapshot | null | undefined): boolean {
  if (!snapshot) {
    return false;
  }
  if (snapshot.task.checkpointType === "production_experience_required") {
    return false;
  }
  return Boolean(
    (snapshot.dashboardView?.requiresUserAction || snapshot.displayState?.requiresUserAction)
    && snapshot.dashboardView?.mode !== "completed"
    && snapshot.dashboardView?.mode !== "failed",
  );
}

export async function exportChapterOutlines(api: NovelCliApi, session: CliSession): Promise<void> {
  if (!(await requireNovel(session))) {
    return;
  }

  printProgress("正在汇总章节大纲…");
  const chapters = (await api.listChapters(session.novelId!)).data ?? [];
  if (!Array.isArray(chapters) || chapters.length === 0) {
    printWarn("还没有章节记录。请先跑完大纲优先导演，或到网页端生成节奏/拆章。");
    return;
  }

  const sorted = [...chapters].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const novel = (await api.getNovel(session.novelId!)).data;
  const title = session.novelTitle
    || (novel && typeof novel === "object" && "title" in novel ? String((novel as { title?: string }).title ?? "未命名小说") : "未命名小说");

  const markdown = buildChapterOutlineMarkdown(title, sorted);
  const defaultName = sanitizeFileName(`${title}-章节大纲.md`);
  const output = await ask("导出文件路径", path.resolve(process.cwd(), defaultName));
  fs.writeFileSync(output, markdown, "utf8");
  printSuccess(`已导出 ${sorted.length} 章大纲：${output}`);

  const incomplete = sorted.filter((chapter) => !hasDetailedOutline(chapter)).length;
  if (incomplete > 0) {
    printWarn(`其中约 ${incomplete} 章详细约束还不完整。可继续导演细化，或到网页端补全后再导出。`);
  }
}

function buildChapterOutlineMarkdown(novelTitle: string, chapters: Chapter[]): string {
  const lines: string[] = [
    `# ${novelTitle} · 章节大纲`,
    "",
    `> 导出时间：${new Date().toISOString()}`,
    `> 章数：${chapters.length}`,
    "",
    "说明：本文件只包含章节标题与详细大纲约束，不包含正文。",
    "",
  ];

  for (const chapter of chapters) {
    const detail = extractChapterOutlineDetail(chapter);
    lines.push(`## 第 ${chapter.order} 章 ${chapter.title || "未命名"}`);
    lines.push("");
    lines.push("### 3.1 章节标题");
    lines.push(chapter.title || "未命名");
    lines.push("");
    lines.push("### 3.2 必须写的内容");
    lines.push(detail.mustWrite.length ? detail.mustWrite.map((item) => `- ${item}`).join("\n") : "- （待补全）");
    lines.push("");
    lines.push("### 3.3 不能写的内容");
    lines.push(detail.mustNotWrite.length ? detail.mustNotWrite.map((item) => `- ${item}`).join("\n") : "- （待补全）");
    lines.push("");
    lines.push("### 其他写作约束");
    if (detail.otherConstraints.length) {
      for (const item of detail.otherConstraints) {
        lines.push(`- ${item}`);
      }
    } else {
      lines.push("- （待补全）");
    }
    if (detail.rawTaskSheet) {
      lines.push("");
      lines.push("### 任务单原文");
      lines.push("```");
      lines.push(detail.rawTaskSheet.slice(0, 4000));
      lines.push("```");
    }
    lines.push("");
  }

  return `${lines.join("\n").trim()}\n`;
}

function extractChapterOutlineDetail(chapter: Chapter): {
  mustWrite: string[];
  mustNotWrite: string[];
  otherConstraints: string[];
  rawTaskSheet: string;
} {
  const mustWrite: string[] = [];
  const mustNotWrite: string[] = [];
  const otherConstraints: string[] = [];

  if (chapter.expectation?.trim()) {
    mustWrite.push(`本章期望：${chapter.expectation.trim()}`);
  }
  if (chapter.mustAvoid?.trim()) {
    mustNotWrite.push(...splitLines(chapter.mustAvoid));
  }
  if (typeof chapter.targetWordCount === "number" && chapter.targetWordCount > 0) {
    otherConstraints.push(`目标字数：不少于 ${chapter.targetWordCount} 字`);
  }
  if (typeof chapter.conflictLevel === "number") {
    otherConstraints.push(`冲突强度：${chapter.conflictLevel}`);
  }
  if (typeof chapter.revealLevel === "number") {
    otherConstraints.push(`信息披露强度：${chapter.revealLevel}`);
  }
  if (chapter.hook?.trim()) {
    otherConstraints.push(`章末钩子：${chapter.hook.trim()}`);
  }
  if (chapter.styleContract?.trim()) {
    otherConstraints.push(`写法约束：${chapter.styleContract.trim()}`);
  }

  const scenes = parseJsonArray(chapter.sceneCards);
  for (const scene of scenes) {
    const title = readString(scene, ["title", "name"]) || "场景";
    const mustAdvance = readStringArray(scene, ["mustAdvance", "mustAdvanceItems"]);
    const forbidden = readStringArray(scene, ["forbiddenExpansion", "forbiddenExpansions", "mustAvoid"]);
    const mustPreserve = readStringArray(scene, ["mustPreserve"]);
    if (mustAdvance.length) {
      mustWrite.push(...mustAdvance.map((item) => `[${title}] ${item}`));
    }
    if (forbidden.length) {
      mustNotWrite.push(...forbidden.map((item) => `[${title}] ${item}`));
    }
    if (mustPreserve.length) {
      otherConstraints.push(...mustPreserve.map((item) => `[${title}] 必须保留：${item}`));
    }
  }

  const taskSheet = chapter.taskSheet?.trim() || "";
  const taskObj = parseJsonObject(taskSheet);
  if (taskObj) {
    const purpose = readString(taskObj, ["purpose", "objective", "goal", "章节目标"]);
    if (purpose) {
      mustWrite.push(`章节目标：${purpose}`);
    }
    const must = readStringArray(taskObj, ["mustWrite", "mustAdvance", "必须写的内容", "必写"]);
    const avoid = readStringArray(taskObj, ["mustAvoid", "mustNotWrite", "不能写的内容", "禁止事项"]);
    mustWrite.push(...must);
    mustNotWrite.push(...avoid);
  } else if (taskSheet) {
    // 非 JSON 任务单：尽量整段作为必须写参考
    mustWrite.push(`任务单：${taskSheet.slice(0, 500)}`);
  }

  return {
    mustWrite: unique(mustWrite),
    mustNotWrite: unique(mustNotWrite),
    otherConstraints: unique(otherConstraints),
    rawTaskSheet: taskSheet,
  };
}

function hasDetailedOutline(chapter: Chapter): boolean {
  const detail = extractChapterOutlineDetail(chapter);
  return detail.mustWrite.length > 0 && detail.mustNotWrite.length > 0;
}

async function maybePickTitle(candidate: DirectorCandidate): Promise<DirectorCandidate> {
  const options = candidate.titleOptions ?? [];
  if (options.length === 0) {
    return candidate;
  }
  printBlank();
  printInfo("这套方案还有书名候选：");
  const title = await choose(
    "选择书名（或保留当前工作标题）",
    [
      { value: candidate.workingTitle, label: candidate.workingTitle, hint: "当前工作标题" },
      ...options.map((option) => ({
        value: option.title,
        label: option.title,
        hint: option.reason?.slice(0, 36),
      })),
    ],
  );
  if (title === candidate.workingTitle) {
    return candidate;
  }
  const selectedIndex = options.findIndex((item) => item.title === title);
  const reordered = selectedIndex <= 0
    ? options
    : [options[selectedIndex]!, ...options.filter((_, index) => index !== selectedIndex)];
  return {
    ...candidate,
    workingTitle: title,
    titleOptions: reordered,
  };
}

function splitLines(text: string): string[] {
  return text
    .split(/\r?\n|；|;|。/)
    .map((item) => item.replace(/^[-*•\d.、\s]+/, "").trim())
    .filter(Boolean);
}

function parseJsonArray(raw: string | null | undefined): Array<Record<string, unknown>> {
  if (!raw?.trim()) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object");
    }
  } catch {
    return [];
  }
  return [];
}

function parseJsonObject(raw: string): Record<string, unknown> | null {
  if (!raw.trim().startsWith("{")) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return null;
  }
  return null;
}

function readString(record: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

function readStringArray(record: Record<string, unknown>, keys: string[]): string[] {
  for (const key of keys) {
    const value = record[key];
    if (Array.isArray(value)) {
      return value.map((item) => String(item).trim()).filter(Boolean);
    }
    if (typeof value === "string" && value.trim()) {
      return splitLines(value);
    }
  }
  return [];
}

function unique(items: string[]): string[] {
  return [...new Set(items.map((item) => item.trim()).filter(Boolean))];
}

function sanitizeFileName(name: string): string {
  return name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").slice(0, 120);
}

export function describeOutlineFirstShortcut(): string {
  const profile = loadCliProfile().outlineFirst;
  if (!profile.preferOutlineFirst) {
    return "章数/字数可保存复用";
  }
  return `默认 ${profile.estimatedChapterCount} 章 · ≥${profile.minChapterWords}字`;
}

export { DEFAULT_OUTLINE_FIRST_PROFILE };
