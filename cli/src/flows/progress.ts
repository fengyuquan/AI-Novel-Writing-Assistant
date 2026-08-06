import type { DirectorTaskSnapshot } from "@ai-novel/shared/types/directorRuntime";
import type { NovelCliApi } from "../api.js";
import type { CliSession } from "../session.js";
import { shortId } from "../session.js";
import {
  printInfo,
  printKeyValues,
  printProgress,
  printTitle,
  printWarn,
} from "../lib/print.js";
import { choose, confirm } from "../lib/prompt.js";
import { requireNovel } from "./novels.js";
import { waitUntilDirectorSettled } from "./waitCommand.js";

export function printDirectorSnapshot(snapshot: DirectorTaskSnapshot | null | undefined): void {
  if (!snapshot) {
    printWarn("暂无导演任务快照。");
    return;
  }

  const dashboard = snapshot.dashboardView;
  printTitle("自动导演进度");
  printKeyValues([
    ["任务", shortId(snapshot.task.id)],
    ["状态", dashboard?.statusLabel || snapshot.task.status],
    ["阶段", dashboard?.stageLabel || snapshot.displayState.stageLabel || "-"],
    ["模式", dashboard?.mode || "-"],
    ["进度", typeof dashboard?.progressPercent === "number" ? `${Math.round(dashboard.progressPercent)}%` : "-"],
    ["当前动作", dashboard?.currentAction || snapshot.activeStep?.label || "-"],
    ["需要你操作", dashboard?.requiresUserAction || snapshot.displayState.requiresUserAction ? "是" : "否"],
  ]);

  if (dashboard?.headline || snapshot.displayState.headline) {
    printInfo(dashboard?.headline || snapshot.displayState.headline);
  }
  if (dashboard?.description) {
    printInfo(dashboard.description);
  }
  if (dashboard?.userActionReason) {
    printWarn(dashboard.userActionReason);
  }

  if (dashboard?.steps?.length) {
    printInfo("阶段步骤：");
    for (const step of dashboard.steps.slice(0, 8)) {
      const mark = step.status === "completed" ? "✓" : step.status === "running" ? "…" : "·";
      printInfo(`  ${mark} ${step.label}`);
    }
  }

  if (snapshot.recentEvents?.length) {
    printInfo("最近事件：");
    for (const event of snapshot.recentEvents.slice(-5)) {
      printProgress(`${event.type}${event.summary ? ` · ${event.summary}` : ""}`);
    }
  }
}

export async function showDirectorProgress(api: NovelCliApi, session: CliSession): Promise<void> {
  if (!(await requireNovel(session))) {
    return;
  }

  let taskId = session.directorTaskId;
  if (!taskId && session.novelId) {
    try {
      const automation = (await api.getDirectorBookAutomation(session.novelId)).data;
      taskId = automation?.projection?.latestTask?.id ?? null;
      if (taskId) {
        session.directorTaskId = taskId;
      }
    } catch {
      // fall through
    }
  }

  if (!taskId) {
    printWarn("当前小说还没有自动导演任务。可先“启动自动导演”。");
    return;
  }

  const snapshot = (await api.getDirectorTaskSnapshot(taskId)).data?.snapshot;
  printDirectorSnapshot(snapshot);

  if (session.novelId) {
    try {
      const automation = (await api.getDirectorBookAutomation(session.novelId)).data?.projection;
      if (automation) {
        printTitle("书级自动导演");
        printKeyValues([
          ["显示状态", String(automation.displayState || "-")],
          ["标题", automation.userHeadline || automation.headline || "-"],
          ["当前", automation.currentLabel || automation.currentStage || "-"],
          ["下一步", automation.nextActionLabel || "-"],
        ]);
      }
    } catch {
      // optional
    }
  }
}

export async function showTaskOverview(api: NovelCliApi): Promise<void> {
  printTitle("运行记录概览");
  const overview = (await api.getTaskOverview()).data;
  if (!overview) {
    printWarn("暂无任务概览。");
    return;
  }

  printKeyValues([
    ["排队中", String(overview.queuedCount)],
    ["执行中", String(overview.runningCount)],
    ["失败", String(overview.failedCount)],
    ["已取消", String(overview.cancelledCount)],
    ["待审批", String(overview.waitingApprovalCount)],
    ["可恢复", String(overview.recoveryCandidateCount)],
  ]);

  const list = (await api.listTasks(10)).data;
  if (list?.items?.length) {
    printInfo("最近任务：");
    for (const item of list.items.slice(0, 10)) {
      printInfo(`  · ${item.title} [${item.status}]`);
    }
  }
}

export async function watchLlmLiveBriefly(api: NovelCliApi, session: CliSession): Promise<void> {
  if (!session.directorTaskId) {
    printWarn("没有导演任务可订阅 AI 实况。");
    return;
  }

  const shouldWatch = await confirm("订阅约 20 秒 AI 实况输出吗？", true);
  if (!shouldWatch) {
    return;
  }

  printTitle("AI 实况");
  printInfo("正在监听模型输出（约 20 秒）…");

  try {
    const stream = api.streamLlmLive(session.directorTaskId);
    const started = Date.now();
    for await (const frame of stream) {
      if (Date.now() - started > 20_000) {
        break;
      }
      if (frame.type === "ping") {
        continue;
      }
      if (frame.type === "snapshot") {
        for (const sessionSnap of frame.sessions.slice(0, 3)) {
          printProgress(`${sessionSnap.context.label} · ${sessionSnap.phaseMessage || sessionSnap.phase}`);
          if (sessionSnap.preview) {
            printInfo(sessionSnap.preview.slice(0, 160));
          }
        }
        continue;
      }
      if (frame.type === "event") {
        const event = frame.event;
        if (event.type === "output_delta" && event.content) {
          process.stdout.write(event.content);
        } else if (event.type === "phase_changed") {
          printProgress(`${event.phase}${event.message ? ` · ${event.message}` : ""}`);
        } else if (event.type === "session_started") {
          printProgress(`开始：${event.context.label}`);
        } else if (event.type === "session_completed") {
          printProgress(`完成（${event.totalChars} 字）`);
          process.stdout.write("\n");
        } else if (event.type === "session_failed") {
          printWarn(event.message);
        }
      }
    }
    process.stdout.write("\n");
  } catch (error) {
    printWarn(error instanceof Error ? error.message : String(error));
  }
}

export async function resumeDirectorActions(
  api: NovelCliApi,
  session: CliSession,
  pollIntervalMs: number,
): Promise<void> {
  if (!session.directorTaskId) {
    printWarn("没有可继续的导演任务。");
    return;
  }

  const snapshot = (await api.getDirectorTaskSnapshot(session.directorTaskId)).data?.snapshot;
  printDirectorSnapshot(snapshot);

  const action = await choose("下一步", [
    { value: "continue", label: "继续执行", hint: "发送 continue 命令" },
    { value: "approve", label: "批准当前关卡", hint: "发送 approve_gate" },
    { value: "live", label: "看一会 AI 实况" },
    { value: "back", label: "返回" },
  ]);

  if (action === "back") {
    return;
  }
  if (action === "live") {
    await watchLlmLiveBriefly(api, session);
    return;
  }

  const accepted = action === "approve"
    ? (await api.approveDirectorGate(session.directorTaskId)).data
    : (await api.continueDirector(session.directorTaskId)).data;

  if (!accepted?.commandId) {
    printWarn("命令未受理。");
    return;
  }

  printProgress(`已提交命令 ${accepted.commandType}，正在跟踪进度…`);
  await waitUntilDirectorSettled(api, session.directorTaskId, pollIntervalMs);
  const next = (await api.getDirectorTaskSnapshot(session.directorTaskId)).data?.snapshot;
  printDirectorSnapshot(next);
}
