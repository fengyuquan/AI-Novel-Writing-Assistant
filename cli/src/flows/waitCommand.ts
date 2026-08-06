import type { CandidateCommandResult, NovelCliApi } from "../api.js";
import { printProgress, printWarn } from "../lib/print.js";
import { sleep } from "../lib/prompt.js";

export async function waitForDirectorCommandResult<T>(
  api: NovelCliApi,
  commandId: string,
  options: {
    pollIntervalMs: number;
    label?: string;
    maxAttempts?: number;
  },
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? 120;
  const label = options.label ?? "任务执行中";

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const response = await api.getDirectorCommandResult<T>(commandId);
    const payload = response.data;
    const status = payload?.status ?? "unknown";

    if (attempt === 1 || attempt % 3 === 0) {
      printProgress(`${label}（${status}，第 ${attempt} 次检查）`);
    }

    if (status === "succeeded" && payload?.result != null) {
      return payload.result;
    }
    if (status === "failed" || status === "cancelled" || status === "stale") {
      throw new Error(payload?.errorMessage || `导演命令失败：${status}`);
    }

    await sleep(options.pollIntervalMs);
  }

  throw new Error("等待导演命令超时。可到网页端运行记录查看进度，或稍后再试。");
}

export async function waitForCandidateBatch(
  api: NovelCliApi,
  commandId: string,
  pollIntervalMs: number,
): Promise<CandidateCommandResult> {
  const result = await waitForDirectorCommandResult<CandidateCommandResult>(api, commandId, {
    pollIntervalMs,
    label: "正在生成整本方向候选",
  });
  if (!result?.batch?.candidates?.length) {
    throw new Error("自动导演没有返回可用方案。");
  }
  return result;
}

export async function waitUntilDirectorSettled(
  api: NovelCliApi,
  taskId: string,
  pollIntervalMs: number,
): Promise<void> {
  for (let attempt = 1; attempt <= 90; attempt += 1) {
    const response = await api.getDirectorTaskSnapshot(taskId);
    const snapshot = response.data?.snapshot;
    const dashboard = snapshot?.dashboardView;
    const mode = dashboard?.mode ?? "idle";
    const headline = dashboard?.headline || snapshot?.displayState?.headline || snapshot?.activeStep?.label || "进行中";
    const percent = dashboard?.progressPercent;

    printProgress(
      `导演进度：${headline}`
      + (typeof percent === "number" ? `（${Math.round(percent)}%）` : "")
      + ` [${mode}]`,
    );

    if (mode === "waiting_user" || mode === "failed" || mode === "completed" || mode === "idle") {
      return;
    }
    if (!snapshot?.displayState?.isLiveRunning && mode !== "queued" && mode !== "running" && mode !== "recovering") {
      return;
    }

    await sleep(pollIntervalMs);
  }

  printWarn("导演任务仍在运行。你可以稍后在“查看进度”里继续跟踪。");
}
