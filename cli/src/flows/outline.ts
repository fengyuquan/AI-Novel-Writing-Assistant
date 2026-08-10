import { DIRECTOR_WORKFLOW_STEP_IDS } from "@ai-novel/shared/types/directorWorkflowStepCatalogData";
import type { DirectorTaskSnapshot } from "@ai-novel/shared/types/directorRuntime";
import type { StoryMacroPlan } from "@ai-novel/shared/types/storyMacro";
import type { NovelCliApi } from "../api.js";
import type { CliSession } from "../session.js";
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
import { waitForDirectorCommandResult, waitUntilDirectorSettled } from "./waitCommand.js";

const PLANNING_STEP_CHOICES = [
  { value: DIRECTOR_WORKFLOW_STEP_IDS.planning.story_macro, label: "故事宏观规划", hint: "主线、卖点、冲突、推进回路" },
  { value: DIRECTOR_WORKFLOW_STEP_IDS.planning.book_contract, label: "书级合约", hint: "开书承诺与约束" },
  { value: DIRECTOR_WORKFLOW_STEP_IDS.planning.volume_strategy, label: "卷战略", hint: "怎么分卷推进" },
  { value: DIRECTOR_WORKFLOW_STEP_IDS.planning.structured_outline, label: "节奏 / 拆章", hint: "卷内节奏与章节清单" },
  { value: DIRECTOR_WORKFLOW_STEP_IDS.planning.world_setup, label: "世界观准备", hint: "世界边界与规则" },
  { value: DIRECTOR_WORKFLOW_STEP_IDS.planning.character_setup, label: "角色准备", hint: "阵容与关系" },
] as const;

export async function reviseOutlineFlow(
  api: NovelCliApi,
  session: CliSession,
  pollIntervalMs: number,
): Promise<void> {
  if (!(await requireNovel(session))) {
    return;
  }

  let running = true;
  while (running) {
    printBlank();
    printTitle("修改故事规划");
    printInfo("你可以先看当前大纲，再用一句话告诉 AI 怎么改；改完可继续自动导演。");

    const action = await choose("你想做什么？", [
      { value: "summary", label: "看看现在的故事大纲摘要", hint: "宏观规划 + 文字大纲" },
      { value: "improve", label: "用一句话让 AI 完善当前步骤", hint: "推荐：自然语言反馈" },
      { value: "regenerate", label: "按反馈整步重做", hint: "当前规划步骤重新生成" },
      { value: "outline_text", label: "只改文字大纲预览", hint: "不走导演步骤，直接优化 outline" },
      { value: "accept", label: "确认没问题，继续写书", hint: "接受当前结果并继续导演" },
      { value: "back", label: "返回主菜单" },
    ]);

    switch (action) {
      case "summary":
        await showOutlineSummary(api, session);
        break;
      case "improve":
        await calibrateWithFeedback(api, session, pollIntervalMs, "improve");
        break;
      case "regenerate":
        await calibrateWithFeedback(api, session, pollIntervalMs, "regenerate");
        break;
      case "outline_text":
        await optimizeFreeformOutline(api, session);
        break;
      case "accept":
        await acceptAndContinue(api, session, pollIntervalMs);
        break;
      case "back":
        running = false;
        break;
      default:
        break;
    }
  }
}

async function ensureDirectorTaskId(api: NovelCliApi, session: CliSession): Promise<string | null> {
  if (session.directorTaskId) {
    return session.directorTaskId;
  }
  if (!session.novelId) {
    return null;
  }
  try {
    const automation = (await api.getDirectorBookAutomation(session.novelId)).data;
    const taskId = automation?.projection?.latestTask?.id ?? null;
    if (taskId) {
      session.directorTaskId = taskId;
    }
    return taskId;
  } catch {
    return null;
  }
}

export async function showOutlineSummary(api: NovelCliApi, session: CliSession): Promise<void> {
  if (!session.novelId) {
    return;
  }

  printTitle("当前故事规划摘要");

  try {
    const macro = (await api.getStoryMacro(session.novelId)).data;
    printStoryMacroSummary(macro);
  } catch (error) {
    printWarn(error instanceof Error ? error.message : "还没有故事宏观规划。");
  }

  try {
    const novel = (await api.getNovel(session.novelId)).data;
    const outline = resolveNovelOutline(novel);
    printBlank();
    printInfo("文字大纲：");
    if (outline) {
      printInfo(outline.slice(0, 1000));
      if (outline.length > 1000) {
        printInfo("…（后续略，完整内容可在网页端查看）");
      }
    } else {
      printWarn("还没有独立的文字大纲。可先跑自动导演，或用“只改文字大纲预览”。");
    }
  } catch {
    printWarn("读取小说大纲失败。");
  }

  const taskId = await ensureDirectorTaskId(api, session);
  if (taskId) {
    const snapshot = (await api.getDirectorTaskSnapshot(taskId)).data?.snapshot;
    printBlank();
    printDirectorSnapshot(snapshot);
  }
}

function printStoryMacroSummary(macro: StoryMacroPlan | null | undefined): void {
  if (!macro) {
    printWarn("本书还没有故事宏观规划。确认导演方案后会生成。");
    return;
  }

  const decomposition = macro.decomposition;
  const expansion = macro.expansion;
  printKeyValues([
    ["故事输入", clip(macro.storyInput, 120)],
    ["卖点", clip(decomposition?.selling_point, 120)],
    ["核心冲突", clip(decomposition?.core_conflict, 120)],
    ["主钩子", clip(decomposition?.main_hook, 120)],
    ["推进回路", clip(decomposition?.progression_loop, 120)],
    ["成长路径", clip(decomposition?.growth_path, 120)],
    ["结局味道", clip(decomposition?.ending_flavor, 80)],
    ["关键兑现", clip(decomposition?.major_payoffs?.join("；"), 120)],
    ["扩展前提", clip(expansion?.expanded_premise, 120)],
    ["主角内核", clip(expansion?.protagonist_core, 120)],
  ].filter((row) => row[1] && row[1] !== "-") as Array<[string, string]>);

  if (macro.constraints?.length) {
    printInfo("硬约束：");
    for (const item of macro.constraints.slice(0, 6)) {
      printInfo(`  · ${item}`);
    }
  }
  if (macro.issues?.length) {
    printWarn("当前问题：");
    for (const issue of macro.issues.slice(0, 5)) {
      printInfo(`  · ${issue.message}`);
    }
  }
}

async function calibrateWithFeedback(
  api: NovelCliApi,
  session: CliSession,
  pollIntervalMs: number,
  action: "improve" | "regenerate",
): Promise<void> {
  const taskId = await ensureDirectorTaskId(api, session);
  if (!taskId) {
    printWarn("还没有自动导演任务。请先“启动自动导演”并确认方案。");
    return;
  }

  const snapshot = (await api.getDirectorTaskSnapshot(taskId)).data?.snapshot;
  printDirectorSnapshot(snapshot);

  const stepId = await resolveCalibrationStepId(snapshot);
  if (!stepId) {
    return;
  }

  const instruction = await ask(
    action === "improve"
      ? "用一句话告诉 AI 怎么改（可留空，让它自行完善）"
      : "重做时有什么要求？（可留空）",
  );

  printProgress(`正在${action === "improve" ? "完善" : "重做"}步骤 ${stepId}…`);
  const accepted = (await api.calibrateDirectorStep(taskId, {
    stepId,
    action,
    instruction: instruction.trim() || null,
  })).data;

  if (!accepted?.commandId) {
    printWarn("校准命令未受理。");
    return;
  }

  await waitForDirectorCommandResult(api, accepted.commandId, {
    pollIntervalMs,
    label: action === "improve" ? "AI 正在按你的反馈完善规划" : "AI 正在重做当前规划步骤",
    allowEmptyResult: true,
  });
  await waitUntilDirectorSettled(api, taskId, pollIntervalMs);

  printSuccess("规划已更新。建议先看看摘要，满意后再“确认没问题，继续写书”。");
  await showOutlineSummary(api, session);

  const shouldAccept = await confirm("现在就接受修改并继续自动导演吗？", false);
  if (shouldAccept) {
    await acceptAndContinue(api, session, pollIntervalMs);
  }
}

async function resolveCalibrationStepId(
  snapshot: DirectorTaskSnapshot | null | undefined,
): Promise<string | null> {
  const fromItemKey = snapshot?.task.currentItemKey?.trim();
  if (fromItemKey && fromItemKey.includes(".")) {
    const useCurrent = await confirm(`使用当前步骤「${snapshot?.task.currentItemLabel || fromItemKey}」吗？`, true);
    if (useCurrent) {
      return fromItemKey;
    }
  }

  const stage = snapshot?.dashboardView?.stageKey || snapshot?.displayState?.stageKey || snapshot?.task.currentStage;
  const mapped = mapStageToStepId(stage);
  if (mapped) {
    const useMapped = await confirm(`按当前阶段推荐步骤「${labelForStep(mapped)}」吗？`, true);
    if (useMapped) {
      return mapped;
    }
  }

  return choose("选择要修改的规划步骤", [
    ...PLANNING_STEP_CHOICES.map((item) => ({
      value: item.value,
      label: item.label,
      hint: item.hint,
    })),
    { value: "__cancel", label: "取消" },
  ]).then((value) => (value === "__cancel" ? null : value));
}

function mapStageToStepId(stage: string | null | undefined): string | null {
  if (!stage) {
    return null;
  }
  const normalized = stage.trim();
  const planning = DIRECTOR_WORKFLOW_STEP_IDS.planning;
  const table: Record<string, string> = {
    story_planning: planning.story_macro,
    story_macro: planning.story_macro,
    book_contract: planning.book_contract,
    world_setup: planning.world_setup,
    character_setup: planning.character_setup,
    volume_strategy: planning.volume_strategy,
    structured_outline: planning.structured_outline,
  };
  return table[normalized] ?? null;
}

function labelForStep(stepId: string): string {
  return PLANNING_STEP_CHOICES.find((item) => item.value === stepId)?.label ?? stepId;
}

async function optimizeFreeformOutline(api: NovelCliApi, session: CliSession): Promise<void> {
  if (!session.novelId) {
    return;
  }

  const novelPayload = (await api.getNovel(session.novelId)).data;
  const currentDraft = resolveNovelOutline(novelPayload);

  if (!currentDraft) {
    printWarn("当前没有文字大纲可优化。你可以先粘贴一段大纲草稿：");
  } else {
    printInfo("当前文字大纲预览：");
    printInfo(currentDraft.slice(0, 600));
  }

  const draft = currentDraft || await ask("粘贴你想优化的大纲草稿");
  if (!draft.trim()) {
    printWarn("没有可优化的内容。");
    return;
  }

  const instruction = await ask("用一句话说明要怎么改", "冲突更强，主线更清晰，少一点空泛设定");
  if (!instruction.trim()) {
    printWarn("请至少给一句修改要求。");
    return;
  }

  printProgress("正在生成优化预览…");
  const preview = (await api.optimizeOutlinePreview(session.novelId, {
    currentDraft: draft,
    instruction: instruction.trim(),
    mode: "full",
  })).data?.optimizedDraft?.trim();

  if (!preview) {
    printWarn("没有得到优化结果。");
    return;
  }

  printTitle("优化预览");
  printInfo(preview.slice(0, 1200));
  if (preview.length > 1200) {
    printInfo("…");
  }

  const shouldSave = await confirm("把这份优化结果保存为本书文字大纲吗？", true);
  if (!shouldSave) {
    printInfo("已放弃保存。");
    return;
  }

  await api.updateNovel(session.novelId, { outline: preview });
  printSuccess("文字大纲已保存。网页端会看到同一份大纲。");
}

async function acceptAndContinue(
  api: NovelCliApi,
  session: CliSession,
  pollIntervalMs: number,
): Promise<void> {
  const taskId = await ensureDirectorTaskId(api, session);
  if (!taskId) {
    printWarn("没有可继续的导演任务。");
    return;
  }

  const mode = await choose("确认后怎么继续？", [
    { value: "accept", label: "接受当前修改并继续", hint: "accept_manual_changes_and_continue" },
    { value: "continue", label: "直接继续导演", hint: "continue" },
    { value: "approve", label: "批准关卡后继续", hint: "approve_gate" },
    { value: "back", label: "返回" },
  ]);

  if (mode === "back") {
    return;
  }

  const accepted = mode === "accept"
    ? (await api.acceptManualChangesAndContinue(taskId)).data
    : mode === "approve"
      ? (await api.approveDirectorGate(taskId)).data
      : (await api.continueDirector(taskId)).data;

  if (!accepted?.commandId) {
    printWarn("命令未受理。");
    return;
  }

  printProgress(`已提交 ${accepted.commandType}，正在跟踪进度…`);
  await waitUntilDirectorSettled(api, taskId, pollIntervalMs);
  printDirectorSnapshot((await api.getDirectorTaskSnapshot(taskId)).data?.snapshot);
  printSuccess("已继续自动导演。");
}

function clip(value: string | null | undefined, max: number): string {
  const text = value?.trim();
  if (!text) {
    return "-";
  }
  return text.length <= max ? text : `${text.slice(0, max)}…`;
}

function resolveNovelOutline(payload: unknown): string {
  if (!payload || typeof payload !== "object") {
    return "";
  }
  const record = payload as Record<string, unknown>;
  if (typeof record.outline === "string" && record.outline.trim()) {
    return record.outline.trim();
  }
  const nested = record.novel;
  if (nested && typeof nested === "object") {
    const outline = (nested as Record<string, unknown>).outline;
    if (typeof outline === "string" && outline.trim()) {
      return outline.trim();
    }
  }
  return "";
}
