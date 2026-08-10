import type { DirectorCandidate, DirectorCandidateBatch } from "@ai-novel/shared/types/novelDirector";
import type { NovelCliApi } from "../api.js";
import { ask, choose } from "../lib/prompt.js";
import {
  printBlank,
  printInfo,
  printKeyValues,
  printProgress,
  printTitle,
  printWarn,
} from "../lib/print.js";
import { waitForCandidateBatch } from "./waitCommand.js";

export type CandidatePickResult =
  | { action: "selected"; batch: DirectorCandidateBatch; candidate: DirectorCandidate }
  | { action: "cancel"; batch: DirectorCandidateBatch };

function printCandidateBatch(
  batch: DirectorCandidateBatch,
  extraRows?: (candidate: DirectorCandidate) => Array<[string, string]>,
): void {
  printBlank();
  printTitle(`候选方向 · ${batch.roundLabel || `第 ${batch.round} 轮`} · ${batch.candidates.length} 套`);
  for (const [index, candidate] of batch.candidates.entries()) {
    printBlank();
    printInfo(`${index + 1}. ${candidate.workingTitle}`);
    printKeyValues([
      ["一句话", candidate.logline],
      ["卖点", candidate.sellingPoint],
      ["核心冲突", candidate.coreConflict],
      ["为什么适合", candidate.whyItFits],
      ["目标章数", String(candidate.targetChapterCount)],
      ...(extraRows?.(candidate) ?? []),
    ]);
  }
}

/**
 * 展示当前批次方案，支持选用 / 输入提示词再生成 / 取消。
 * 不满意时可反复 refine，上一轮批次会作为 previousBatches 传给后端。
 */
export async function pickOrRefineCandidates(input: {
  api: NovelCliApi;
  taskId: string;
  idea: string;
  initialBatch: DirectorCandidateBatch;
  pollIntervalMs: number;
  chooseTitle?: string;
  extraCandidateRows?: (candidate: DirectorCandidate) => Array<[string, string]>;
  refineExtras?: {
    estimatedChapterCount?: number;
    defaultChapterLength?: number;
  };
}): Promise<CandidatePickResult> {
  let batch = input.initialBatch;
  const previousBatches: DirectorCandidateBatch[] = [];

  while (true) {
    printCandidateBatch(batch, input.extraCandidateRows);

    const selectedId = await choose(
      input.chooseTitle ?? "选择一套方案继续",
      [
        ...batch.candidates.map((candidate) => ({
          value: candidate.id,
          label: candidate.workingTitle,
          hint: candidate.logline.slice(0, 40),
        })),
        {
          value: "__refine",
          label: "都不满意，输入提示词再生成 5 套",
          hint: "告诉 AI 你想改什么",
        },
        { value: "__cancel", label: "先不确认，稍后再说" },
      ],
    );

    if (selectedId === "__cancel") {
      return { action: "cancel", batch };
    }

    if (selectedId === "__refine") {
      const feedback = await ask("用自然语言说明这几套哪里不满意、下一轮更想看到什么");
      if (!feedback.trim()) {
        printWarn("提示词不能为空。");
        continue;
      }
      if (feedback.trim().length > 500) {
        printWarn("提示词最长 500 字，请缩短后再试。");
        continue;
      }

      previousBatches.push(batch);
      printProgress("正在按你的意见重新生成方案…");
      const accepted = (await input.api.refineDirectorCandidates(input.taskId, {
        idea: batch.idea || input.idea,
        previousBatches: [...previousBatches],
        feedback: feedback.trim(),
        workflowTaskId: input.taskId,
        estimatedChapterCount: input.refineExtras?.estimatedChapterCount,
        defaultChapterLength: input.refineExtras?.defaultChapterLength,
      })).data;

      if (!accepted?.commandId) {
        printWarn("重新生成命令未受理。");
        continue;
      }

      const result = await waitForCandidateBatch(input.api, accepted.commandId, input.pollIntervalMs);
      batch = result.batch;
      continue;
    }

    const candidate = batch.candidates.find((item) => item.id === selectedId);
    if (!candidate) {
      printWarn("未找到选中的方案。");
      continue;
    }

    return { action: "selected", batch, candidate };
  }
}

export async function maybePickTitle(candidate: DirectorCandidate): Promise<DirectorCandidate> {
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
