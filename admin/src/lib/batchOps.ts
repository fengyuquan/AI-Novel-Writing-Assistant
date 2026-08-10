import type { BatchAction } from "@/lib/api";

export const BATCH_MODELS = ["NovelWorkflowTask", "GenerationJob", "AgentRun"] as const;

export function supportsBatchOps(modelName: string): boolean {
  return (BATCH_MODELS as readonly string[]).includes(modelName);
}

export interface BatchPreset {
  id: string;
  label: string;
  action: BatchAction;
  setStatus?: string;
  /** Extra where merged on top of current list filters. */
  whereExtra?: Record<string, unknown>;
  description: string;
}

function failureStatuses(modelName: string): string[] {
  if (modelName === "GenerationJob") return ["failed"];
  return ["failed", "waiting_approval"];
}

function runningStatuses(_modelName: string): string[] {
  return ["queued", "running"];
}

export function getBatchPresets(modelName: string): BatchPreset[] {
  if (!supportsBatchOps(modelName)) return [];
  return [
    {
      id: "cancel-failed",
      label: "失败 → cancelled",
      action: "update_status",
      setStatus: "cancelled",
      whereExtra: { status: { in: failureStatuses(modelName) } },
      description: "把失败类任务标记为 cancelled，便于清理队列噪音。",
    },
    {
      id: "mark-failed",
      label: "运行中 → failed",
      action: "update_status",
      setStatus: "failed",
      whereExtra: { status: { in: runningStatuses(modelName) } },
      description: "把卡住的队列/运行中任务标为 failed（请确认它们确实已死）。",
    },
    {
      id: "delete-failed",
      label: "删除失败/已取消",
      action: "delete_matching",
      whereExtra: { status: { in: [...failureStatuses(modelName), "cancelled"] } },
      description: "删除失败/取消类记录。高风险，需输入 BATCH 确认。",
    },
  ];
}
