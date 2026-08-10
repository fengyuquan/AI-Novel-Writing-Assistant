import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import type { PromptAsset } from "../../../core/promptTypes";
import { NOVEL_PROMPT_BUDGETS } from "../promptBudgetProfiles";

export interface VolumeOutlineImportPromptInput {
  novelTitle?: string | null;
  novelDescription?: string | null;
  rawText: string;
  parseIssues?: string[];
}

const importedChapterSchema = z.object({
  title: z.string().trim().min(1).max(200),
  summary: z.string().trim().min(1).max(8000),
  purpose: z.string().trim().max(4000).optional().nullable(),
  mustAvoid: z.string().trim().max(4000).optional().nullable(),
  taskSheet: z.string().trim().max(8000).optional().nullable(),
}).strict();

const importedVolumeSchema = z.object({
  title: z.string().trim().min(1).max(200),
  chapters: z.array(importedChapterSchema).min(1).max(800),
}).strict();

export const volumeOutlineImportSchema = z.object({
  volumes: z.array(importedVolumeSchema).min(1).max(40),
}).strict();

export type VolumeOutlineImportOutput = z.output<typeof volumeOutlineImportSchema>;

export const volumeOutlineImportPrompt: PromptAsset<
  VolumeOutlineImportPromptInput,
  VolumeOutlineImportOutput
> = {
  id: "novel.volume.outline_import",
  version: "v2",
  taskType: "planner",
  mode: "structured",
  language: "zh",
  contextPolicy: {
    maxTokensBudget: NOVEL_PROMPT_BUDGETS.volumeOutlineImport,
    requiredGroups: [],
    preferredGroups: [],
    dropOrder: [],
  },
  outputSchema: volumeOutlineImportSchema,
  repairPolicy: { maxAttempts: 1 },
  semanticRetryPolicy: { maxAttempts: 1 },
  management: { productPrompt: true, editModes: ["readonly"] },
  render: (input) => [
    new SystemMessage([
      "你是网文章节大纲格式整理助手。",
      "唯一任务：把用户大纲原文拆成可写入系统的 JSON 章节清单。",
      "",
      "【最高优先级：内容零改写】",
      "1. 禁止改写、润色、压缩、扩写、概括或替换任何剧情表述。",
      "2. title / summary / purpose / mustAvoid / taskSheet 必须尽量使用原文原句原标点；只允许去掉 Markdown 装饰符号（如 #、*、列表符号）和明显的字段标签前缀（如「章节摘要：」）。",
      "3. 禁止发明原文没有的情节、角色、结局、伏笔或任务。",
      "4. 禁止把多章合并成一章，也禁止把一章拆成多章，除非原文已经明确写成多章。",
      "5. 若某字段原文没有对应内容，填 null，不要编造。",
      "",
      "【格式整理规则】",
      "1. 识别单章标题：如「第1章：…」「## 第1章 …」「**第1章：…**」。",
      "2. 不要把「第1-3章」「第一阶段」「核心机制」「卷核心目标」等区间/阶段/设定标题当成单章。",
      "3. 「章节摘要」→ summary；「章节目标/必写」→ purpose；「禁写」→ mustAvoid；「章节任务单」及其条目 → taskSheet。",
      "4. 若原文已分卷（第N卷），按卷输出；否则只输出一个卷，title 用「第1卷」。",
      "5. 只输出严格 JSON，不要 Markdown、注释或解释。",
      "JSON 形状：{\"volumes\":[{\"title\":\"...\",\"chapters\":[{\"title\":\"...\",\"summary\":\"...\",\"purpose\":null,\"mustAvoid\":null,\"taskSheet\":null}]}]}",
    ].join("\n")),
    new HumanMessage([
      `作品标题：${input.novelTitle?.trim() || "未命名"}`,
      `作品简介：${input.novelDescription?.trim() || "无"}`,
      input.parseIssues?.length
        ? `模板解析提示：${input.parseIssues.join("；")}`
        : "模板解析提示：无",
      "",
      "待整理大纲原文（请原样抽取，不要改写内容）：",
      input.rawText,
    ].join("\n")),
  ],
  postValidate: (output) => {
    const chapterCount = output.volumes.reduce((sum, volume) => sum + volume.chapters.length, 0);
    if (chapterCount < 1) {
      throw new Error("整理结果没有任何章节。");
    }
    return output;
  },
};
