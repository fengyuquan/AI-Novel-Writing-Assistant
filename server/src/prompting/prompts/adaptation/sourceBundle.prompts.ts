/**
 * 改编共享层 SourceBundle 解析 Prompt
 * （供 adaptation/source/* Adapter 使用；路径不含 drama/comic，避免解耦守卫误伤）
 */
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import type { PromptAsset } from "../../core/promptTypes";

const sourceFactSchema = z.object({
  text: z.string().trim().min(1),
  category: z.enum(["completed", "revealed", "state_changed"]).default("completed"),
});

const sourceCharacterSchema = z.object({
  name: z.string().trim().min(1),
  gender: z.enum(["male", "female", "other", "unknown"]).optional(),
  persona: z.string().trim().optional(),
  relations: z.string().trim().optional(),
  visualHint: z.string().trim().optional(),
  sourceCharacterRef: z.string().trim().optional(),
});

const sourceBeatSchema = z.object({
  order: z.number().int().min(1),
  summary: z.string().trim().min(1),
  sourceChapterStart: z.number().int().min(1).optional(),
  sourceChapterEnd: z.number().int().min(1).optional(),
});

const quotedLineSchema = z.object({
  speaker: z.string().trim().max(60).optional(),
  text: z.string().trim().min(1).max(500),
});

export const adaptationSourceBundleOutputSchema = z.object({
  synopsis: z.string().trim().min(1).max(2000),
  beats: z.array(sourceBeatSchema).min(1).max(80),
  characters: z.array(sourceCharacterSchema).min(1).max(40),
  worldNotes: z.string().trim().max(2000).optional(),
  hardFacts: z.array(sourceFactSchema).max(40).optional(),
  quotedLines: z.array(quotedLineSchema).max(60).optional(),
  rawText: z.string().trim().optional(),
});

export type AdaptationSourceBundleOutput = z.infer<typeof adaptationSourceBundleOutputSchema>;

export interface AdaptationTextImportSourcePromptInput {
  title: string;
  rawText: string;
  /** faithful：新闻/报道保真；creative：可概括改编 */
  adaptationMode?: "faithful" | "creative";
}

export const adaptationTextImportSourcePrompt: PromptAsset<
  AdaptationTextImportSourcePromptInput,
  AdaptationSourceBundleOutput
> = {
  id: "adaptation.source.text_bundle",
  version: "v1",
  taskType: "outline_planning",
  mode: "structured",
  language: "zh",
  contextPolicy: { maxTokensBudget: 9000 },
  outputSchema: adaptationSourceBundleOutputSchema,
  render(input) {
    const faithful = (input.adaptationMode ?? "faithful") === "faithful";
    return [
      new SystemMessage(
        faithful
          ? [
              "你是新闻/纪实文本的漫画改编素材解析员。",
              "任务：把导入原文解析为与来源无关的 SourceBundle，供后续分话与分格使用。",
              "硬约束：",
              "1. 不得编造原文没有的事件、动机、对话、数字、结论或因果关系。",
              "2. synopsis 只能概括原文已陈述内容，不得加戏剧冲突或悬念。",
              "3. beats 按原文事件发生顺序切片，每拍对应一段真实推进，禁止虚构卡点。",
              "4. hardFacts 收录时间、地点、人物身份、关键数字与已陈述结论。",
              "5. quotedLines 收录原文引语（引号内或明确归因的说话内容），text 必须是原文连续子串。",
              "6. characters 只列原文出现的人物；visualHint 只能基于原文外貌/身份描写，未知则省略。",
              "只输出符合 schema 的 JSON，不要 Markdown。",
            ].join("\n")
          : [
              "你是漫画改编策划，负责把导入文本解析成 SourceBundle。",
              "保留核心人物、冲突、硬事实和可改编节拍；可适度压缩叙述，但不得引入原文没有的硬事实。",
              "只输出符合 schema 的 JSON，不要 Markdown。",
            ].join("\n"),
      ),
      new HumanMessage(
        [
          `【标题】${input.title}`,
          `【改编模式】${faithful ? "保真（新闻/纪实）" : "创意改编"}`,
          "",
          `【导入文本】\n${input.rawText.slice(0, 24000)}`,
          "",
          "请输出 SourceBundle：synopsis、beats、characters、worldNotes、hardFacts、quotedLines。",
          "rawText 字段可省略（系统会另行保留原文）。",
        ].join("\n"),
      ),
    ];
  },
};

export interface AdaptationOriginalSourcePromptInput {
  title: string;
  inspiration: string;
}

export const adaptationOriginalSourcePrompt: PromptAsset<
  AdaptationOriginalSourcePromptInput,
  AdaptationSourceBundleOutput
> = {
  id: "adaptation.source.original_bundle",
  version: "v1",
  taskType: "outline_planning",
  mode: "structured",
  language: "zh",
  contextPolicy: { maxTokensBudget: 5000 },
  outputSchema: adaptationSourceBundleOutputSchema,
  render(input) {
    return [
      new SystemMessage(
        [
          "你是漫画策划，负责把原创灵感整理为可进入漫画产线的标准内容包 SourceBundle。",
          "用结构化理解补齐主线、角色、关键节拍和硬事实。",
          "只输出符合 schema 的 JSON，不要 Markdown。",
        ].join("\n"),
      ),
      new HumanMessage(
        [
          `【标题】${input.title}`,
          `【灵感】${input.inspiration}`,
          "",
          "请生成 SourceBundle：synopsis、beats、characters、worldNotes、hardFacts。",
          "beats 用 8-24 个情节节拍表达，适合竖屏漫画分话。",
        ].join("\n"),
      ),
    ];
  },
};
