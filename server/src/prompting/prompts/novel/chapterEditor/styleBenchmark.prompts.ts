import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { PromptAsset } from "../../../core/promptTypes";
import { NOVEL_PROMPT_BUDGETS } from "../promptBudgetProfiles";
import {
  chapterEditorStyleBenchmarkCompareSchema,
  chapterEditorStyleBenchmarkRewriteSchema,
  type ChapterEditorStyleBenchmarkCompareParsed,
  type ChapterEditorStyleBenchmarkRewriteParsed,
} from "./styleBenchmark.promptSchemas";

export interface ChapterEditorStyleBenchmarkRewritePromptInput {
  novelTitle: string;
  chapterTitle: string;
  userContent: string;
  referenceTitle: string;
  styleContractText: string;
  referenceSamples: string;
  goalSummary?: string | null;
  chapterSummary?: string | null;
}

export interface ChapterEditorStyleBenchmarkComparePromptInput {
  novelTitle: string;
  chapterTitle: string;
  userContent: string;
  benchmarkContent: string;
  referenceTitle: string;
}

const REWRITE_EXAMPLE: ChapterEditorStyleBenchmarkRewriteParsed = {
  benchmarkContent: "晨光还没爬上屋檐，门外已经响起急促脚步。\n\n林修把剑按回鞘里，声音很轻：“先别慌，把门开了。”",
  styleNotes: "节奏偏短句推进，对话干脆，少解释多现场动作。",
  plotFidelityNotes: "保留了清晨来人、拔剑收剑与开门应对，未增删关键情节。",
};

const COMPARE_EXAMPLE: ChapterEditorStyleBenchmarkCompareParsed = {
  summary: "范本稿在开场压迫感与对话节奏上更强；你的稿信息更清楚，但现场感弱一些。",
  overallWinner: "benchmark",
  segments: [
    {
      segmentIndex: 0,
      beatLabel: "开场压迫",
      userExcerpt: "早上有人敲门，林修走过去开门。",
      benchmarkExcerpt: "晨光还没爬上屋檐，门外已经响起急促脚步。",
      winner: "benchmark",
      whyBetter: "先给时间与声音压力，读者更快进场。",
      howToImproveWeaker: "开场先写一个具体感官细节，再落到开门动作。",
    },
  ],
};

export const chapterEditorStyleBenchmarkRewritePrompt: PromptAsset<
  ChapterEditorStyleBenchmarkRewritePromptInput,
  ChapterEditorStyleBenchmarkRewriteParsed
> = {
  id: "novel.chapter_editor.style_benchmark_rewrite",
  version: "v1",
  taskType: "writer",
  mode: "structured",
  language: "zh",
  management: {
    productPrompt: true,
    editModes: ["slots", "readonly"],
  },
  contextPolicy: {
    maxTokensBudget: NOVEL_PROMPT_BUDGETS.chapterEditorStyleBenchmarkRewrite,
  },
  contextRequirements: [
    { group: "style_contract", priority: 95, sourceHint: "Reference style contract for imitation." },
    { group: "chapter_mission", priority: 70, sourceHint: "Keep chapter goal intact." },
  ],
  slots: [
    {
      kind: "replace" as const,
      key: "chapterEditor.styleBenchmarkRewrite.focus",
      label: "范本仿写侧重",
      description: "对照仿写时更优先模仿哪些手感。",
      default: "优先模仿句式长短、对话味道、信息抛出节奏与现场感；剧情点与人物关系必须与用户稿一致。",
      maxLength: 600,
    },
  ],
  outputSchema: chapterEditorStyleBenchmarkRewriteSchema,
  structuredOutputHint: {
    example: REWRITE_EXAMPLE,
    note: "benchmarkContent 必须是完整章节正文；不得改写剧情主线。",
  },
  repairPolicy: {
    maxAttempts: 1,
  },
  render: (input, context) => {
    const focus = context.slots?.text("chapterEditor.styleBenchmarkRewrite.focus")
      ?? "优先模仿句式长短、对话味道、信息抛出节奏与现场感；剧情点与人物关系必须与用户稿一致。";
    return [
      new SystemMessage([
        "你是中文长篇小说「范本对照仿写」助手，服务对象是写作新手。",
        "任务：按学习范本的叙事手感，重写用户本章正文，得到一份仅供对照学习的范本稿。",
        "",
        "只输出一个合法 JSON 对象，不要输出 Markdown、解释或额外文本。",
        "",
        "硬约束：",
        "1. " + focus,
        "2. 必须保持用户稿的情节推进、人物身份关系、关键信息与结果不变。",
        "3. 不得引入新主角、新反转、新设定，也不得删掉用户稿里的关键事件。",
        "4. 只换写法手感：句式、节奏、对话味道、感官细节、叙述距离。",
        "5. 输出是对照学习稿，不是替用户交稿；不要加写作教学旁白。",
        "",
        "字段要求：",
        "1. benchmarkContent：完整对照正文，使用空行分段。",
        "2. styleNotes：用一句到三句说明你主要模仿了什么手感。",
        "3. plotFidelityNotes：说明你如何保持剧情一致、有无取舍。",
        "",
        "输出必须严格符合 chapterEditorStyleBenchmarkRewriteSchema。",
      ].join("\n")),
      new HumanMessage([
        `小说：${input.novelTitle}`,
        `章节：${input.chapterTitle}`,
        `学习范本：${input.referenceTitle}`,
        "",
        "本章目标：",
        input.goalSummary?.trim() || "无",
        "",
        "章节摘要：",
        input.chapterSummary?.trim() || "无",
        "",
        "范本写法合同：",
        input.styleContractText.trim() || "无结构化写法合同，请主要依据样章手感。",
        "",
        "范本样章片段：",
        input.referenceSamples.trim() || "无",
        "",
        "用户本章正文（必须保持剧情）：",
        input.userContent,
      ].join("\n")),
    ];
  },
};

export const chapterEditorStyleBenchmarkComparePrompt: PromptAsset<
  ChapterEditorStyleBenchmarkComparePromptInput,
  ChapterEditorStyleBenchmarkCompareParsed
> = {
  id: "novel.chapter_editor.style_benchmark_compare",
  version: "v1",
  taskType: "critical_review",
  mode: "structured",
  language: "zh",
  management: {
    productPrompt: true,
    editModes: ["slots", "readonly"],
  },
  contextPolicy: {
    maxTokensBudget: NOVEL_PROMPT_BUDGETS.chapterEditorStyleBenchmarkCompare,
  },
  contextRequirements: [
    { group: "chapter_mission", priority: 60, sourceHint: "Chapter goal for fair comparison." },
  ],
  slots: [
    {
      kind: "replace" as const,
      key: "chapterEditor.styleBenchmarkCompare.focus",
      label: "对照点评侧重",
      description: "逐段点评时更关注哪些写作维度。",
      default: "按情节小节对齐后比较现场感、节奏、对话、信息密度与情绪推进；对新手说清楚可执行改法。",
      maxLength: 600,
    },
  ],
  outputSchema: chapterEditorStyleBenchmarkCompareSchema,
  structuredOutputHint: {
    example: COMPARE_EXAMPLE,
    note: "先按情节小节对齐再点评；excerpt 必须来自对应正文可定位摘录。",
  },
  repairPolicy: {
    maxAttempts: 1,
  },
  render: (input, context) => {
    const focus = context.slots?.text("chapterEditor.styleBenchmarkCompare.focus")
      ?? "按情节小节对齐后比较现场感、节奏、对话、信息密度与情绪推进；对新手说清楚可执行改法。";
    return [
      new SystemMessage([
        "你是中文长篇小说「范本对照点评」助手，服务对象是写作新手。",
        "任务：把用户稿与范本对照稿按情节小节对齐，逐段比较谁更好，并给出可执行改进。",
        "",
        "只输出一个合法 JSON 对象，不要输出 Markdown、解释或额外文本。",
        "",
        "点评原则：",
        "1. " + focus,
        "2. 先对齐同一情节节拍，再比较写法；不要机械按行号硬切。",
        "3. 允许判定用户更好、范本更好或打平；不要无脑吹捧范本。",
        "4. 摘录必须来自对应正文真实连续片段，方便编辑器定位。",
        "5. 通常输出 4-12 个节拍；太短章节可更少，但至少 1 段。",
        "6. howToImproveWeaker 必须告诉新手怎么改，具体可执行。",
        "",
        "字段要求：",
        "1. summary：整体谁更强、差在哪。",
        "2. overallWinner：user / benchmark / tie。",
        "3. segments[]：按阅读顺序的节拍对照。",
        "",
        "输出必须严格符合 chapterEditorStyleBenchmarkCompareSchema。",
      ].join("\n")),
      new HumanMessage([
        `小说：${input.novelTitle}`,
        `章节：${input.chapterTitle}`,
        `学习范本：${input.referenceTitle}`,
        "",
        "用户稿：",
        input.userContent,
        "",
        "范本对照稿：",
        input.benchmarkContent,
      ].join("\n")),
    ];
  },
};
