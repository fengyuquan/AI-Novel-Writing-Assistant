import type { NovelCliApi } from "../api.js";
import type { CliSession } from "../session.js";
import { ask, choose, confirm } from "../lib/prompt.js";
import {
  printInfo,
  printProgress,
  printSuccess,
  printTitle,
  printWarn,
} from "../lib/print.js";
import { maybePickTitle, pickOrRefineCandidates, summarizeBatch } from "./candidates.js";
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
  printInfo("每一轮会给出 5 套方向；都不满意时可以输入提示词再生成。");

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

  const pick = await pickOrRefineCandidates({
    api,
    taskId: session.directorTaskId!,
    idea: idea.trim(),
    initialBatch: result.batch,
    pollIntervalMs,
  });

  if (pick.action === "cancel") {
    printInfo("已保留导演任务。之后可在“查看进度 / 继续导演”里继续。");
    return;
  }

  const { batch, candidate } = pick;
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

export { summarizeBatch };
