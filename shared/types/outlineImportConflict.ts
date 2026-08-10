export type OutlineImportConflictCategory =
  | "character"
  | "world"
  | "volume_strategy"
  | "beat_sheet";

export type OutlineImportConflictSeverity = "blocking" | "warning";

export type OutlineImportConflictChoice =
  | "keep_setting"
  | "keep_outline"
  | "defer";

export type OutlineImportSettingRef = {
  type: OutlineImportConflictCategory;
  id?: string | null;
  label: string;
  excerpt: string;
};

export type OutlineImportOutlineRef = {
  volumeTitle?: string | null;
  chapterOrder?: number | null;
  chapterTitle?: string | null;
  excerpt: string;
};

export type OutlineImportConflictItem = {
  conflictId: string;
  category: OutlineImportConflictCategory;
  severity: OutlineImportConflictSeverity;
  title: string;
  summary: string;
  settingRef: OutlineImportSettingRef;
  outlineRef: OutlineImportOutlineRef;
  recommendedChoice: OutlineImportConflictChoice;
  userChoice?: OutlineImportConflictChoice | null;
};

export type OutlineImportConflictAnalysisResult = {
  conflicts: OutlineImportConflictItem[];
  analyzedAt: string;
  settingSnapshotSummary: {
    characterCount: number;
    hasWorld: boolean;
    hasStrategyPlan: boolean;
    beatSheetCount: number;
  };
};

export type OutlineImportPendingAlignmentItem = {
  conflictId: string;
  category: OutlineImportConflictCategory;
  title: string;
  summary: string;
  settingLabel: string;
  chapterTitle?: string | null;
  chapterOrder?: number | null;
  choice: Extract<OutlineImportConflictChoice, "keep_outline" | "defer">;
  createdAt: string;
};

export const OUTLINE_IMPORT_CONFLICT_CHOICE_LABELS: Record<OutlineImportConflictChoice, string> = {
  keep_setting: "跟设定",
  keep_outline: "跟大纲",
  defer: "稍后处理",
};

export const OUTLINE_IMPORT_CONFLICT_CATEGORY_LABELS: Record<OutlineImportConflictCategory, string> = {
  character: "角色",
  world: "世界观",
  volume_strategy: "卷战略",
  beat_sheet: "节奏板",
};
