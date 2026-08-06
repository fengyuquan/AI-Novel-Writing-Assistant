import type { DirectorCandidate, DirectorCandidateBatch } from "@ai-novel/shared/types/novelDirector";
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
import { waitForCandidateBatch, waitUntilDirectorSettled } from "./waitCommand.js";

export async function runAutoDirectorFlow(
  api: NovelCliApi,
  session: CliSession,
  pollIntervalMs: number,
): Promise<void> {
  if (!(await requireNovel(session))) {
    return;
  }

  printTitle("自动导演");
  printInfo("这里会走和网页端相同的后端导演链路：生成方向 → 你选择方案 → 继续规划与生产。");

  const idea = await ask("用一句话描述你想写的故事灵感");
  if (!idea.trim()) {
    printWarn("灵感不能为空。");
    return;
  }

  printProgress("正在提交自动导演任务…");
  const accepted = (await api.generateDirectorCandidates({
    idea: idea.trim(),
    novelId: session.novelId ?? undefined,
    workflowTaskId: session.directorTaskId ?? undefined,
  })).data;

  if (!accepted?.commandId || !accepted.taskId) {
    printWarn("自动导演任务没有被受理。");
    return;
  }

  session.directorTaskId = accepted.taskId;
  printSuccess(`导演任务已创建：${accepted.taskId}`);
  printInfo("正在等待候选方向生成，这可能需要一两分钟…");

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
      ["核心冲突", candidate.coreConflict],
      ["为什么适合", candidate.whyItFits],
      ["目标章数", String(candidate.targetChapterCount)],
    ]);
  }

  const selectedId = await choose(
    "选择一套方案继续",
    [
      ...batch.candidates.map((candidate) => ({
        value: candidate.id,
        label: candidate.workingTitle,
        hint: candidate.logline.slice(0, 40),
      })),
      { value: "__cancel", label: "先不确认，稍后再说" },
    ],
  );

  if (selectedId === "__cancel") {
    printInfo("已保留导演任务。之后可在“查看进度 / 继续导演”里继续。");
    return;
  }

  const candidate = batch.candidates.find((item) => item.id === selectedId);
  if (!candidate) {
    printWarn("未找到选中的方案。");
    return;
  }

  const withTitle = await maybePickTitle(candidate);
  const shouldConfirm = await confirm(`确认采用《${withTitle.workingTitle}》并继续开书准备吗？`, true);
  if (!shouldConfirm) {
    printInfo("已取消确认。");
    return;
  }

  printProgress("正在确认方案并继续自动导演…");
  const confirmAccepted = (await api.confirmDirectorCandidate(session.directorTaskId!, {
    idea: batch.idea || idea.trim(),
    batchId: batch.id,
    round: batch.round,
    candidate: withTitle,
    workflowTaskId: session.directorTaskId ?? undefined,
  })).data;

  if (!confirmAccepted?.commandId) {
    printWarn("确认方案命令未受理。");
    return;
  }

  await waitUntilDirectorSettled(api, session.directorTaskId!, pollIntervalMs);
  const snapshot = (await api.getDirectorTaskSnapshot(session.directorTaskId!)).data?.snapshot;
  printDirectorSnapshot(snapshot);

  if (snapshot?.dashboardView?.requiresUserAction || snapshot?.displayState.requiresUserAction) {
    const next = await choose("导演正在等你操作，下一步？", [
      { value: "continue", label: "继续执行" },
      { value: "approve", label: "批准关卡" },
      { value: "later", label: "稍后再说" },
    ]);
    if (next === "continue") {
      await api.continueDirector(session.directorTaskId!);
      await waitUntilDirectorSettled(api, session.directorTaskId!, pollIntervalMs);
      printDirectorSnapshot((await api.getDirectorTaskSnapshot(session.directorTaskId!)).data?.snapshot);
    } else if (next === "approve") {
      await api.approveDirectorGate(session.directorTaskId!);
      await waitUntilDirectorSettled(api, session.directorTaskId!, pollIntervalMs);
      printDirectorSnapshot((await api.getDirectorTaskSnapshot(session.directorTaskId!)).data?.snapshot);
    }
  }

  printSuccess("本轮自动导演交互完成。网页端也能看到同一本书和同一任务。");
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

export function summarizeBatch(batch: DirectorCandidateBatch): string {
  return `${batch.roundLabel || `第 ${batch.round} 轮`} · ${batch.candidates.length} 套方案`;
}
