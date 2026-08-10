export interface StatusPreset {
  id: string;
  label: string;
  /** Exact status match, or list for `in`. Empty means clear filter. */
  values: string[];
}

/** Align with Prisma enums: NovelWorkflowTaskStatus / PipelineJobStatus. */
const PRESETS: Record<string, StatusPreset[]> = {
  NovelWorkflowTask: [
    { id: "all", label: "全部", values: [] },
    { id: "failed", label: "失败/等待审批", values: ["failed", "waiting_approval"] },
    { id: "running", label: "队列/运行中", values: ["queued", "running"] },
    { id: "succeeded", label: "成功", values: ["succeeded"] },
    { id: "cancelled", label: "已取消", values: ["cancelled"] },
  ],
  GenerationJob: [
    { id: "all", label: "全部", values: [] },
    { id: "failed", label: "失败", values: ["failed"] },
    { id: "running", label: "队列/运行中", values: ["queued", "running"] },
    { id: "succeeded", label: "成功", values: ["succeeded"] },
    { id: "cancelled", label: "已取消", values: ["cancelled"] },
  ],
  AgentRun: [
    { id: "all", label: "全部", values: [] },
    { id: "failed", label: "失败/等待审批", values: ["failed", "waiting_approval"] },
    { id: "running", label: "队列/运行中", values: ["queued", "running"] },
    { id: "succeeded", label: "成功", values: ["succeeded"] },
    { id: "cancelled", label: "已取消", values: ["cancelled"] },
  ],
};

export function getStatusPresets(modelName: string): StatusPreset[] {
  return PRESETS[modelName] ?? [];
}

export function buildStatusWhere(preset: StatusPreset | undefined): Record<string, unknown> | undefined {
  if (!preset || preset.values.length === 0) {
    return undefined;
  }
  if (preset.values.length === 1) {
    return { status: preset.values[0] };
  }
  return { status: { in: preset.values } };
}
