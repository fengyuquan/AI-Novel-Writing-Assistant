export const BATCH_ALLOWED_MODELS = ["NovelWorkflowTask", "GenerationJob", "AgentRun"] as const;

export type BatchAllowedModel = (typeof BATCH_ALLOWED_MODELS)[number];

export type BatchAction = "update_status" | "delete_matching";

/** Status values that batch update is allowed to write (Prisma enum-safe). */
export const BATCH_SAFE_TARGET_STATUSES = [
  "cancelled",
  "failed",
  "succeeded",
  "queued",
] as const;

export const BATCH_DEFAULT_MAX_ROWS = 200;
export const BATCH_HARD_MAX_ROWS = 500;

export function isBatchAllowedModel(modelName: string): modelName is BatchAllowedModel {
  return (BATCH_ALLOWED_MODELS as readonly string[]).includes(modelName);
}

export function isSafeBatchTargetStatus(status: string): boolean {
  return (BATCH_SAFE_TARGET_STATUSES as readonly string[]).includes(status);
}
