import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { PromptAsset } from "../../../core/promptTypes";
import { NOVEL_PROMPT_BUDGETS } from "../promptBudgetProfiles";
import {
  chapterEditorAiWritingDetectSchema,
  type ChapterEditorAiWritingDetectParsed,
} from "./aiWritingDetect.promptSchemas";

export interface ChapterEditorAiWritingDetectPromptInput {
  novelTitle: string;
  chapterTitle: string;
  content: string;
  styleSummary?: string | null;
}

const EXAMPLE: ChapterEditorAiWritingDetectParsed = {
  riskScore: 62,
  naturalnessScore: 48,
  summary: "中段解释腔和模板化排比偏多，读起来像在总结而不是现场推进。",
  issues: [
    {
      severity: "high",
      code: "ai_expository_summary",
      description: "用说明句交代处境，缺少人物具体动作与感官。",
      evidence: "他忽然意识到，这一切不过是命运给他安排的又一次考验。",
      fixSuggestion: "改成当下动作或对话，让压力落在具体事件上，少用抽象总结。",
    },
    {
      severity: "medium",
      code: "ai_template_parallelism",
      description: "连续排比造成机械感，情绪显得空。",
      evidence: "他不怕疼，不怕输，更不怕被误解。",
      fixSuggestion: "只保留最关键的一点，换成一个具体反应或细节。",
    },
  ],
};

export const chapterEditorAiWritingDetectPrompt: PromptAsset<
  ChapterEditorAiWritingDetectPromptInput,
  ChapterEditorAiWritingDetectParsed
> = {
  id: "novel.chapter_editor.ai_writing_detect",
  version: "v1",
  taskType: "critical_review",
  mode: "structured",
  language: "zh",
  management: {
    productPrompt: true,
    editModes: ["slots", "readonly"],
  },
  contextPolicy: {
    maxTokensBudget: NOVEL_PROMPT_BUDGETS.chapterEditorAiWritingDetect,
  },
  contextRequirements: [
    { group: "style_contract", priority: 90, sourceHint: "Anti-AI and style guidance if available." },
    { group: "chapter_mission", priority: 70, sourceHint: "Chapter goal for tone fit." },
  ],
  slots: [
    {
      kind: "replace" as const,
      key: "chapterEditor.aiWritingDetect.focus",
      label: "AI写法检测侧重",
      description: "调整检测时更关注哪些像 AI 的写法问题。",
      default: "优先抓解释腔、模板排比、空泛升华、机械情绪和说明书口吻；不要把正常网文爽点误判成 AI。",
      maxLength: 600,
    },
  ],
  outputSchema: chapterEditorAiWritingDetectSchema,
  structuredOutputHint: {
    example: EXAMPLE,
    note: "evidence 必须是正文里可定位的连续短摘录；issues 通常 3-8 条，没有问题则返回空数组。",
  },
  repairPolicy: {
    maxAttempts: 1,
  },
  render: (input, context) => {
    const focus = context.slots?.text("chapterEditor.aiWritingDetect.focus")
      ?? "优先抓解释腔、模板排比、空泛升华、机械情绪和说明书口吻；不要把正常网文爽点误判成 AI。";
    return [
      new SystemMessage([
        "你是中文长篇小说「AI 写法检测」助手，服务对象是写作新手。",
        "任务：找出正文里读起来像 AI / 模板 / 说明书的地方，并给出可执行修改建议。",
        "",
        "只输出一个合法 JSON 对象，不要输出 Markdown、解释或额外文本。",
        "",
        "检测原则：",
        "1. " + focus,
        "2. 只根据给定正文判断，不得脑补未出现的情节。",
        "3. 不要把正常网文表达、口语、爽点节奏一律判成 AI。",
        "4. 同类问题可合并为一条高价值 issue，不要机械拆碎。",
        "5. 长章节通常输出 3-8 条问题；无明显问题则 issues 为空数组。",
        "",
        "字段要求：",
        "1. riskScore：0-100，越高表示 AI 痕迹越重。",
        "2. naturalnessScore：0-100，越高表示越像真人写作。",
        "3. summary：用一句人话概括整体判断与主要风险。",
        "4. issues[].code：稳定短码，如 ai_expository_summary、ai_template_parallelism、ai_empty_emotion。",
        "5. issues[].evidence：必须包含正文真实出现过的连续短摘录（建议 8-40 字），方便编辑器定位。",
        "6. issues[].fixSuggestion：告诉新手怎么改，具体可执行，不要空泛说“优化表达”。",
        "",
        "输出必须严格符合 chapterEditorAiWritingDetectSchema。",
      ].join("\n")),
      new HumanMessage([
        `小说：${input.novelTitle}`,
        `章节：${input.chapterTitle}`,
        "",
        "当前写法提示：",
        input.styleSummary?.trim() || "无",
        "",
        "正文：",
        input.content,
      ].join("\n")),
    ];
  },
};
