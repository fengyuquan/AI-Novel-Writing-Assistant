import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { PromptAsset } from "../../../core/promptTypes";
import { NOVEL_PROMPT_BUDGETS } from "../promptBudgetProfiles";
import {
  chapterImageStoryPackOutputSchema,
  type ChapterImageStoryPackParsed,
} from "./imageStoryPack.promptSchemas";

export interface ChapterImageStoryPackPromptInput {
  novelTitle: string;
  chapterTitle: string;
  chapterOrder: number;
  content: string;
  charactersDigest: string;
}

const EXAMPLE: ChapterImageStoryPackParsed = {
  summary: "本章从误会爆发到当面对质，镜头聚焦表情与关键对白。",
  shots: [
    {
      order: 1,
      action: "女主在雨中推开办公室门，目光冷硬。",
      visualPrompt:
        "竖屏近景，林晚推门而入：黑色长直发、冷白皮、深色风衣；冷雨背景与办公室暖光对比，电影感。",
      dialogue: "林晚：你以为我还会信你？",
      location: "公司办公室门口",
      shotSize: "近景",
      durationSec: 3,
      characterRefs: ["林晚"],
    },
  ],
};

export const chapterImageStoryPackPrompt: PromptAsset<
  ChapterImageStoryPackPromptInput,
  ChapterImageStoryPackParsed
> = {
  id: "novel.chapter_editor.image_story_pack",
  version: "v2",
  taskType: "outline_planning",
  mode: "structured",
  language: "zh",
  management: {
    productPrompt: true,
    editModes: ["slots", "readonly"],
  },
  contextPolicy: {
    maxTokensBudget: NOVEL_PROMPT_BUDGETS.chapterEditorImageStoryPack,
  },
  slots: [
    {
      kind: "replace" as const,
      key: "chapterEditor.imageStoryPack.focus",
      label: "本章切图侧重",
      description: "调整按本章拆镜头时更关注冲突、对白还是情绪。",
      default: "优先拆冲突推进与关键对白镜头，少做空镜与环境铺陈；每镜画面要能单独读懂情节。",
      maxLength: 500,
    },
  ],
  outputSchema: chapterImageStoryPackOutputSchema,
  structuredOutputHint: {
    example: EXAMPLE,
    note: [
      "shots 按剧情顺序编号。",
      "visualPrompt 必须写入出场角色的固定外形锚点，保证跨镜人物一致。",
      "dialogue 只能是角色说出口的短对白（可带说话人），禁止旁白/叙述/画外音；没有对白则省略。",
    ].join(""),
  },
  repairPolicy: {
    maxAttempts: 1,
  },
  render: (input, context) => {
    const focus = context.slots?.text("chapterEditor.imageStoryPack.focus")
      ?? "优先拆冲突推进与关键对白镜头，少做空镜与环境铺陈；每镜画面要能单独读懂情节。";
    return [
      new SystemMessage([
        "你是竖屏图文剧情分镜师。根据小说单章正文，拆成一组可按顺序出图的镜头。",
        "目标不是拍视频，而是让外部出图模型按顺序生成静帧，组成本章剧情。",
        "要求：",
        "- 画幅按 9:16 竖屏构思；",
        "- 通常 8-20 镜，最短不少于 4 镜，最多 28 镜；",
        "- 每镜必须有 visualPrompt（中文，具体、可出图）和 action；",
        "- 人物一致性（最高优先级）：同一角色在所有镜头必须同一张脸、同一发型、同一服装主色与标志细节；",
        "- visualPrompt 里凡出现角色，必须把【角色视觉锚点】中的外形原文写进去，不能只写角色名；",
        "- characterRefs 必须填写本镜出场角色名，且与锚点名单一致；",
        "- dialogue 规则：只允许「角色说出口的短对白」，建议格式「角色名：短句」，每镜最多 1-2 句、尽量不超过 30 字；",
        "- dialogue 禁止：旁白、画外音、叙述句、场景说明、作者解说、长段内心独白；没有出口对白就省略 dialogue；",
        `- 侧重：${focus}`,
        "只输出符合 schema 的 JSON。",
      ].join("\n")),
      new HumanMessage([
        `【小说】${input.novelTitle}`,
        `【章节】第 ${input.chapterOrder} 章 · ${input.chapterTitle}`,
        `【角色视觉锚点｜跨镜必须逐字沿用】\n${input.charactersDigest}`,
        `【本章正文】\n${input.content}`,
      ].join("\n\n")),
    ];
  },
};
