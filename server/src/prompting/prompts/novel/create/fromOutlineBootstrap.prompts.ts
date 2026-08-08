import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import type { PromptAsset } from "../../../core/promptTypes";
import { NOVEL_PROMPT_BUDGETS } from "../promptBudgetProfiles";

export interface FromOutlineBootstrapPromptInput {
  outlineJson: string;
  rawTextExcerpt: string;
}

const characterDraftSchema = z.object({
  name: z.string().trim().min(1).max(80),
  role: z.string().trim().min(1).max(80),
  personality: z.string().trim().min(1).max(800),
  background: z.string().trim().min(1).max(1200),
  appearance: z.string().trim().max(400).optional().nullable(),
  development: z.string().trim().max(800).optional().nullable(),
}).strict();

const worldDraftSchema = z.object({
  title: z.string().trim().min(1).max(80),
  coverSummary: z.string().trim().min(1).max(300),
  sourceText: z.string().trim().min(1).max(8_000),
}).strict();

export const fromOutlineBootstrapSchema = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(4_000),
  targetAudience: z.string().trim().min(1).max(400),
  commercialTags: z.array(z.string().trim().min(1).max(20)).min(3).max(6),
  bookSellingPoint: z.string().trim().min(1).max(400),
  competingFeel: z.string().trim().min(1).max(400),
  first30ChapterPromise: z.string().trim().min(1).max(800),
  characters: z.array(characterDraftSchema).max(24),
  worldDraft: worldDraftSchema.nullable(),
}).strict();

export type FromOutlineBootstrapOutput = z.output<typeof fromOutlineBootstrapSchema>;

export const fromOutlineBootstrapPrompt: PromptAsset<
  FromOutlineBootstrapPromptInput,
  FromOutlineBootstrapOutput
> = {
  id: "novel.create.from_outline_bootstrap",
  version: "v1",
  taskType: "planner",
  mode: "structured",
  language: "zh",
  contextPolicy: {
    maxTokensBudget: NOVEL_PROMPT_BUDGETS.createFromOutlineBootstrap,
    requiredGroups: [],
    preferredGroups: [],
    dropOrder: [],
  },
  outputSchema: fromOutlineBootstrapSchema,
  repairPolicy: { maxAttempts: 1 },
  semanticRetryPolicy: { maxAttempts: 1 },
  management: { productPrompt: true, editModes: ["readonly"] },
  render: (input) => [
    new SystemMessage([
      "你是小说开书助手。任务：根据用户粘贴的章节大纲，抽出开书所需的基础信息、角色草稿和世界观草稿。",
      "",
      "【硬规则】",
      "1. 只做抽取与整理字段，不要改写大纲中的章节剧情清单本身。",
      "2. 书名优先采用大纲中已出现的书名/作品名；若没有，用大纲核心冲突起一个简短可用书名。",
      "3. description 用 2-6 句概括全书主线与卖点，依据大纲，不要编造大纲未出现的重大设定。",
      "4. characters 只收录大纲中明确或高度可推断的主要人物；次要路人不要硬凑。role 用中文职能，如主角/女主/反派/配角。",
      "5. worldDraft：若大纲含世界规则/力量体系/时代背景，填写 title、coverSummary，并把规则原文尽量放进 sourceText；若几乎没有世界观信息，worldDraft 返回 null。",
      "6. commercialTags 给 3-6 个短标签；targetAudience / bookSellingPoint / competingFeel / first30ChapterPromise 面向新手作者，用白话。",
      "7. 只输出严格 JSON。",
    ].join("\n")),
    new HumanMessage([
      "已解析的章节大纲（JSON）：",
      input.outlineJson,
      "",
      "原始大纲摘录：",
      input.rawTextExcerpt,
    ].join("\n")),
  ],
  postValidate: (output) => output,
};
