import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import type { PromptAsset } from "../../../core/promptTypes";
import { NOVEL_PROMPT_BUDGETS } from "../promptBudgetProfiles";

export interface VolumeOutlineImportConflictPromptInput {
  novelTitle?: string | null;
  outlineJson: string;
  charactersJson: string;
  worldJson: string;
  strategyJson: string;
  beatSheetsJson: string;
}

const choiceSchema = z.enum(["keep_setting", "keep_outline", "defer"]);
const categorySchema = z.enum(["character", "world", "volume_strategy", "beat_sheet"]);
const severitySchema = z.enum(["blocking", "warning"]);

const conflictItemSchema = z.object({
  conflictId: z.string().trim().min(1).max(80),
  category: categorySchema,
  severity: severitySchema,
  title: z.string().trim().min(1).max(120),
  summary: z.string().trim().min(1).max(800),
  settingRef: z.object({
    type: categorySchema,
    id: z.string().trim().max(120).optional().nullable(),
    label: z.string().trim().min(1).max(120),
    excerpt: z.string().trim().min(1).max(800),
  }).strict(),
  outlineRef: z.object({
    volumeTitle: z.string().trim().max(120).optional().nullable(),
    chapterOrder: z.number().int().min(1).max(5000).optional().nullable(),
    chapterTitle: z.string().trim().max(200).optional().nullable(),
    excerpt: z.string().trim().min(1).max(800),
  }).strict(),
  recommendedChoice: choiceSchema,
}).strict();

export const volumeOutlineImportConflictSchema = z.object({
  conflicts: z.array(conflictItemSchema).max(80),
}).strict();

export type VolumeOutlineImportConflictOutput = z.output<typeof volumeOutlineImportConflictSchema>;

export const volumeOutlineImportConflictPrompt: PromptAsset<
  VolumeOutlineImportConflictPromptInput,
  VolumeOutlineImportConflictOutput
> = {
  id: "novel.volume.outline_import_conflict",
  version: "v1",
  taskType: "planner",
  mode: "structured",
  language: "zh",
  contextPolicy: {
    maxTokensBudget: NOVEL_PROMPT_BUDGETS.volumeOutlineImportConflict,
    requiredGroups: [],
    preferredGroups: [],
    dropOrder: [],
  },
  outputSchema: volumeOutlineImportConflictSchema,
  repairPolicy: { maxAttempts: 1 },
  semanticRetryPolicy: { maxAttempts: 1 },
  management: { productPrompt: true, editModes: ["readonly"] },
  render: (input) => [
    new SystemMessage([
      "你是小说设定一致性检查助手。",
      "任务：比较「即将导入的章节大纲」与本书既有设定（角色、世界观、卷战略、节奏板），找出真正会互相打架的冲突。",
      "",
      "【必须用语义理解判断】",
      "不要用关键词机械匹配。只有当大纲推进会否定、违背或明显无法并存于既有设定时，才输出冲突。",
      "风格差异、表述详略、未展开细节，不算冲突。",
      "",
      "【比较范围】",
      "1. character：角色身份、性别、核心关系、硬性能力/禁区等硬事实。",
      "2. world：世界规则、力量体系、不可违背的世界观约束。",
      "3. volume_strategy：卷战略承诺、阶段回报、主线升级节奏是否被大纲明显推翻。",
      "4. beat_sheet：节奏板阶段职能是否与大纲大段推进明显对立。",
      "",
      "【推荐选择】",
      "recommendedChoice 只能是 keep_setting / keep_outline / defer。",
      "- 角色硬事实、世界硬规则冲突：优先 keep_setting。",
      "- 卷战略/节奏板与用户主动导入大纲的节奏冲突：优先 keep_outline。",
      "- 不确定或可后置处理：defer。",
      "",
      "【输出要求】",
      "只输出严格 JSON。无冲突时返回 {\"conflicts\":[]}。",
      "每条冲突必须包含冲突双方摘录；title/summary 用新手能懂的短句。",
      "conflictId 使用稳定短字符串，如 c1、c2。",
    ].join("\n")),
    new HumanMessage([
      `作品标题：${input.novelTitle?.trim() || "未命名"}`,
      "",
      "导入大纲（JSON）：",
      input.outlineJson,
      "",
      "角色设定（JSON）：",
      input.charactersJson,
      "",
      "世界观设定（JSON）：",
      input.worldJson,
      "",
      "卷战略（JSON）：",
      input.strategyJson,
      "",
      "节奏板（JSON）：",
      input.beatSheetsJson,
    ].join("\n")),
  ],
  postValidate: (output) => output,
};
