import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import type { PromptAsset } from "../../../core/promptTypes";
import { NOVEL_PROMPT_BUDGETS } from "../promptBudgetProfiles";

export interface FromOutlineBootstrapPromptInput {
  outlineJson: string;
  rawTextExcerpt: string;
  /** Deterministic preamble hints lifted from labeled outline sections. */
  bootstrapHintsJson: string;
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
  version: "v2",
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
      "2. 书名优先采用大纲中已出现的书名/作品名（见 bootstrapHints.title）；若没有，用大纲核心冲突起一个简短可用书名。",
      "3. description 用 2-6 句概括全书主线与卖点，依据大纲，不要编造大纲未出现的重大设定。可参考 descriptionSeed。",
      "4. characters 必须尽量覆盖大纲明确出现的主要人物（含主角与关键配角/反派）；次要路人不要硬凑。role 用中文职能，如主角/女主/反派/配角。personality/background 依据大纲已有信息填写，信息不足时用简短“待补充”式说明，但人物条目本身不能空。",
      "5. worldDraft：若大纲含世界规则/力量体系/时代背景（常见于「世界观设定」「核心机制」小节），必须填写 title、coverSummary，并把规则原文尽量放进 sourceText（可直接整理 bootstrapHints.worldSourceText）；仅当几乎没有世界观信息时，worldDraft 才返回 null。",
      "6. first30ChapterPromise 优先概括「前30章 / 核心承诺」小节；没有独立小节时，根据前几章摘要归纳开局要兑现的承诺。",
      "7. commercialTags 给 3-6 个短标签；targetAudience / bookSellingPoint / competingFeel 面向新手作者，用白话，禁止留空。",
      "8. 只输出严格 JSON。",
    ].join("\n")),
    new HumanMessage([
      "已解析的章节大纲（JSON）：",
      input.outlineJson,
      "",
      "大纲前序确定性线索（JSON，优先采信其中的书名/世界观原文/前30章承诺/角色名）：",
      input.bootstrapHintsJson,
      "",
      "原始大纲摘录：",
      input.rawTextExcerpt,
    ].join("\n")),
  ],
  postValidate: (output) => output,
};
