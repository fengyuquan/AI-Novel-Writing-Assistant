/** Sensitive scalar fields that must be masked in list/detail responses. */
const SENSITIVE_FIELDS = new Set<string>(["APIKey.key"]);

/** Models that are always editable when admin is enabled. Empty = all models. */
const MODEL_DENYLIST = new Set<string>([]);

export const PINNED_MODELS = [
  "Novel",
  "Chapter",
  "Character",
  "NovelWorkflowTask",
  "APIKey",
  "AppSetting",
  "GenerationJob",
] as const;

/** Preferred child models when drilling into a Novel. */
export const PINNED_NOVEL_CHILDREN = [
  "Chapter",
  "Character",
  "NovelWorkflowTask",
  "GenerationJob",
  "VolumePlan",
  "VolumeChapterPlan",
  "NovelBible",
  "NovelSnapshot",
  "CreativeHubThread",
  "AgentRun",
  "QualityReport",
  "StoryMacroPlan",
  "BookContract",
] as const;

/**
 * Dangerous / high-volume runtime tables: readable by default, writes require unlock.
 * Pattern match covers future similarly named models.
 */
export const READONLY_MODEL_NAMES = [
  "KnowledgeChunk",
  "RagIndexJob",
  "RagRetrievalTrace",
  "NovelSideEffectJob",
  "DirectorRuntimeInstance",
  "DirectorRuntimeCommand",
  "DirectorRuntimeExecution",
  "DirectorRuntimeCheckpoint",
  "DirectorRuntimeEvent",
  "DirectorLlmUsageRecord",
  "DirectorArtifact",
  "DirectorArtifactDependency",
  "ChapterArtifactSyncCheckpoint",
  "CharacterMindSnapshot",
  "StoryStateSnapshot",
  "WorldSnapshot",
  "NovelSnapshot",
  "BookAnalysisCharacterAppearanceSnapshot",
] as const;

const READONLY_NAME_PATTERN = /(Chunk|Embedding|Runtime|Snapshot|Trace|SideEffect|LlmUsage|ArtifactSync)/i;

export function isAdminEnabled(): boolean {
  return Boolean(process.env.ADMIN_TOKEN?.trim());
}

export function getAdminToken(): string | null {
  const token = process.env.ADMIN_TOKEN?.trim();
  return token || null;
}

export function isValidAdminToken(candidate: string | undefined | null): boolean {
  const expected = getAdminToken();
  if (!expected || !candidate) {
    return false;
  }
  return candidate === expected;
}

export function isModelAllowed(modelName: string): boolean {
  return !MODEL_DENYLIST.has(modelName);
}

export function isReadOnlyModel(modelName: string): boolean {
  if ((READONLY_MODEL_NAMES as readonly string[]).includes(modelName)) {
    return true;
  }
  return READONLY_NAME_PATTERN.test(modelName);
}

export function isWriteAllowed(modelName: string, writeUnlocked: boolean): boolean {
  return !isReadOnlyModel(modelName) || writeUnlocked;
}

export function isSensitiveField(modelName: string, fieldName: string): boolean {
  return SENSITIVE_FIELDS.has(`${modelName}.${fieldName}`);
}

export function maskSensitiveValue(value: unknown): string | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  return "********";
}

export function toPrismaClientKey(modelName: string): string {
  if (!modelName || typeof modelName !== "string") {
    throw new Error("Invalid model name.");
  }
  return modelName.charAt(0).toLowerCase() + modelName.slice(1);
}

export function isAutoManagedField(fieldName: string): boolean {
  return fieldName === "createdAt" || fieldName === "updatedAt";
}
