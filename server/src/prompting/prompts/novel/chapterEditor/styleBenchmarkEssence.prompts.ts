import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { PromptAsset } from "../../../core/promptTypes";
import { NOVEL_PROMPT_BUDGETS } from "../promptBudgetProfiles";
import {
  chapterEditorStyleBenchmarkEssenceSchema,
  chapterEditorStyleBenchmarkSegmentRewriteSchema,
  chapterEditorStyleBenchmarkUnifySchema,
  type ChapterEditorStyleBenchmarkEssenceParsed,
  type ChapterEditorStyleBenchmarkSegmentRewriteParsed,
  type ChapterEditorStyleBenchmarkUnifyParsed,
} from "./styleBenchmark.promptSchemas";

export interface ChapterEditorStyleBenchmarkEssencePromptInput {
  referenceTitle: string;
  styleContractText: string;
  referenceSamples: string;
}

export interface ChapterEditorStyleBenchmarkSegmentRewritePromptInput {
  novelTitle: string;
  chapterTitle: string;
  referenceTitle: string;
  segmentIndex: number;
  segmentCount: number;
  segmentText: string;
  previousBenchmarkTail?: string | null;
  essenceJson: string;
  focusGaps?: string[];
}

export interface ChapterEditorStyleBenchmarkUnifyPromptInput {
  novelTitle: string;
  chapterTitle: string;
  referenceTitle: string;
  userContent: string;
  draftBenchmarkContent: string;
  essenceJson: string;
  focusGaps?: string[];
}

function formatEssenceJsonForPrompt(essence: ChapterEditorStyleBenchmarkEssenceParsed): string {
  return JSON.stringify(essence, null, 2);
}

export { formatEssenceJsonForPrompt };

const ESSENCE_EXAMPLE: ChapterEditorStyleBenchmarkEssenceParsed = {
  voiceRules: ["叙述贴近现场，少事后总结。", "句子偏短，动作先于解释。"],
  dialogueRules: ["对话干脆，少完整解释动机。", "冲突时用短句顶撞推进。"],
  pacingRules: ["开场先给压力信号，再补背景。", "信息分批抛出，避免一段说完。"],
  sensoryRules: ["优先声音与动作细节。", "心理描写点到为止。"],
  forbidPatterns: ["大段说明书式设定讲解。", "空泛命运/宿命旁白。"],
  fingerprintLines: [
    "先压后讲：先给外部压力，再补必要信息。",
    "对话像刀子：短、冲、少解释。",
    "一段一事：每段只推进一个现场动作。",
  ],
  sampleAnchors: [
    {
      quote: "门外已经响起急促脚步。",
      why: "开场用声音压力，而不是先交代来人身份。",
    },
  ],
  confidence: "high",
  gaps: [],
};

export const chapterEditorStyleBenchmarkEssencePrompt: PromptAsset<
  ChapterEditorStyleBenchmarkEssencePromptInput,
  ChapterEditorStyleBenchmarkEssenceParsed
> = {
  id: "novel.chapter_editor.style_benchmark_essence",
  version: "v1",
  taskType: "critical_review",
  mode: "structured",
  language: "zh",
  management: {
    productPrompt: true,
    editModes: ["slots", "readonly"],
  },
  contextPolicy: {
    maxTokensBudget: NOVEL_PROMPT_BUDGETS.chapterEditorStyleBenchmarkEssence,
  },
  contextRequirements: [
    { group: "style_contract", priority: 95, sourceHint: "Optional existing style contract." },
  ],
  slots: [
    {
      kind: "replace" as const,
      key: "chapterEditor.styleBenchmarkEssence.focus",
      label: "精髓抽取侧重",
      description: "从范文中优先提炼哪些可迁移手感。",
      default: "优先抽取可迁移到任意章节的声口、对话、节奏、镜头与忌用写法；指纹要具体可执行，不要写空泛形容词。",
      maxLength: 600,
    },
  ],
  outputSchema: chapterEditorStyleBenchmarkEssenceSchema,
  structuredOutputHint: {
    example: ESSENCE_EXAMPLE,
    note: "sampleAnchors.quote 必须来自输入样章的连续原文；fingerprintLines 必须可执行。",
  },
  repairPolicy: {
    maxAttempts: 1,
  },
  render: (input, context) => {
    const focus = context.slots?.text("chapterEditor.styleBenchmarkEssence.focus")
      ?? "优先抽取可迁移到任意章节的声口、对话、节奏、镜头与忌用写法；指纹要具体可执行，不要写空泛形容词。";
    return [
      new SystemMessage([
        "你是中文小说「范文精髓抽取」助手，服务写作新手的对照学习。",
        "任务：从学习范本的写法合同与样章中，提炼一份可迁移的精髓卡。",
        "",
        "只输出一个合法 JSON 对象，不要输出 Markdown、解释或额外文本。",
        "",
        "抽取原则：",
        "1. " + focus,
        "2. fingerprintLines 必须是 3-5 条可执行规则，新手看了就能改自己的稿。",
        "3. sampleAnchors.quote 必须是输入样章里的真实连续短摘录，并说明它体现了哪条手感。",
        "4. 不要总结剧情主题、世界观或人物弧光；只提炼写法手感。",
        "5. 样章不足时降低 confidence，并把不确定点写入 gaps。",
        "",
        "输出必须严格符合 chapterEditorStyleBenchmarkEssenceSchema。",
      ].join("\n")),
      new HumanMessage([
        `学习范本：${input.referenceTitle}`,
        "",
        "范本写法合同：",
        input.styleContractText.trim() || "无",
        "",
        "范本样章：",
        input.referenceSamples.trim() || "无",
      ].join("\n")),
    ];
  },
};

export const chapterEditorStyleBenchmarkSegmentRewritePrompt: PromptAsset<
  ChapterEditorStyleBenchmarkSegmentRewritePromptInput,
  ChapterEditorStyleBenchmarkSegmentRewriteParsed
> = {
  id: "novel.chapter_editor.style_benchmark_segment_rewrite",
  version: "v1",
  taskType: "writer",
  mode: "structured",
  language: "zh",
  management: {
    productPrompt: true,
    editModes: ["slots", "readonly"],
  },
  contextPolicy: {
    maxTokensBudget: NOVEL_PROMPT_BUDGETS.chapterEditorStyleBenchmarkSegmentRewrite,
  },
  contextRequirements: [
    { group: "style_contract", priority: 95, sourceHint: "Essence card drives imitation." },
  ],
  slots: [
    {
      kind: "replace" as const,
      key: "chapterEditor.styleBenchmarkSegmentRewrite.focus",
      label: "分段仿写侧重",
      description: "分段对照仿写时更优先保证什么。",
      default: "本段完整执行精髓卡指纹；保持本段情节与人物不变；衔接上一段已写范文的语气。",
      maxLength: 600,
    },
  ],
  outputSchema: chapterEditorStyleBenchmarkSegmentRewriteSchema,
  structuredOutputHint: {
    example: {
      segmentContent: "门外脚步越来越近。林修把剑按回鞘里，低声说：“先别慌。”",
      styleNotes: "本段执行了先压后讲与短对话。",
      plotFidelityNotes: "保留来人压力与安抚开门意图。",
    },
    note: "segmentContent 只写本段，不要重写整章。",
  },
  repairPolicy: {
    maxAttempts: 1,
  },
  render: (input, context) => {
    const focus = context.slots?.text("chapterEditor.styleBenchmarkSegmentRewrite.focus")
      ?? "本段完整执行精髓卡指纹；保持本段情节与人物不变；衔接上一段已写范文的语气。";
    const gaps = (input.focusGaps ?? []).filter(Boolean);
    return [
      new SystemMessage([
        "你是中文长篇小说「范本分段对照仿写」助手。",
        "任务：按精髓卡手感重写用户本章的一个情节段，供对照学习。",
        "",
        "只输出一个合法 JSON 对象。",
        "",
        "硬约束：",
        "1. " + focus,
        "2. 不得改本段情节结果、人物身份关系与关键信息。",
        "3. 不得引入新主角、新反转、新设定。",
        "4. 必须执行精髓卡中的 fingerprintLines；若有重点补齐清单，优先补齐。",
        gaps.length > 0 ? `5. 本轮重点补齐：${gaps.join("；")}` : "5. 保持与前后段可自然衔接。",
        "",
        "输出必须严格符合 chapterEditorStyleBenchmarkSegmentRewriteSchema。",
      ].join("\n")),
      new HumanMessage([
        `小说：${input.novelTitle}`,
        `章节：${input.chapterTitle}`,
        `学习范本：${input.referenceTitle}`,
        `本段：${input.segmentIndex + 1}/${input.segmentCount}`,
        "",
        "精髓卡 JSON：",
        input.essenceJson,
        "",
        "上一段范文结尾（衔接用，可为空）：",
        input.previousBenchmarkTail?.trim() || "无",
        "",
        "用户本段正文（必须保持剧情）：",
        input.segmentText,
      ].join("\n")),
    ];
  },
};

export const chapterEditorStyleBenchmarkUnifyPrompt: PromptAsset<
  ChapterEditorStyleBenchmarkUnifyPromptInput,
  ChapterEditorStyleBenchmarkUnifyParsed
> = {
  id: "novel.chapter_editor.style_benchmark_unify",
  version: "v1",
  taskType: "writer",
  mode: "structured",
  language: "zh",
  management: {
    productPrompt: true,
    editModes: ["slots", "readonly"],
  },
  contextPolicy: {
    maxTokensBudget: NOVEL_PROMPT_BUDGETS.chapterEditorStyleBenchmarkUnify,
  },
  contextRequirements: [
    { group: "style_contract", priority: 95, sourceHint: "Essence card for voice unify." },
  ],
  slots: [
    {
      kind: "replace" as const,
      key: "chapterEditor.styleBenchmarkUnify.focus",
      label: "声口统一侧重",
      description: "分段拼章后统一润色时更优先保证什么。",
      default: "只统一声口与衔接，不改情节；补齐未覆盖指纹；删掉段与段之间的语气断裂。",
      maxLength: 600,
    },
  ],
  outputSchema: chapterEditorStyleBenchmarkUnifySchema,
  structuredOutputHint: {
    example: {
      benchmarkContent: "门外脚步越来越近。\n\n林修把剑按回鞘里，低声说：“先别慌。”",
      styleNotes: "统一了短句节奏与对话干脆度。",
      plotFidelityNotes: "未增删关键事件。",
      essenceCompliance: {
        covered: ["先压后讲：先给外部压力，再补必要信息。"],
        missed: [],
        notes: "指纹基本覆盖。",
      },
    },
    note: "不得改剧情；essenceCompliance.missed 写真实未覆盖指纹。",
  },
  repairPolicy: {
    maxAttempts: 1,
  },
  render: (input, context) => {
    const focus = context.slots?.text("chapterEditor.styleBenchmarkUnify.focus")
      ?? "只统一声口与衔接，不改情节；补齐未覆盖指纹；删掉段与段之间的语气断裂。";
    const gaps = (input.focusGaps ?? []).filter(Boolean);
    return [
      new SystemMessage([
        "你是中文长篇小说「范本对照稿声口统一」助手。",
        "任务：把分段仿写拼成的对照稿统一成同一范文手感，并报告指纹覆盖情况。",
        "",
        "只输出一个合法 JSON 对象。",
        "",
        "硬约束：",
        "1. " + focus,
        "2. 以用户本章正文为剧情真相，不得增删关键事件。",
        "3. essenceCompliance.covered/missed 必须对照精髓卡 fingerprintLines。",
        gaps.length > 0 ? `4. 本轮重点补齐：${gaps.join("；")}` : "4. 优先消灭段间语气断裂。",
        "",
        "输出必须严格符合 chapterEditorStyleBenchmarkUnifySchema。",
      ].join("\n")),
      new HumanMessage([
        `小说：${input.novelTitle}`,
        `章节：${input.chapterTitle}`,
        `学习范本：${input.referenceTitle}`,
        "",
        "精髓卡 JSON：",
        input.essenceJson,
        "",
        "用户本章正文（剧情真相）：",
        input.userContent,
        "",
        "分段拼成的对照稿草稿：",
        input.draftBenchmarkContent,
      ].join("\n")),
    ];
  },
};
