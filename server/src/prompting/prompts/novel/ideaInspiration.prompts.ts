import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import type { PromptAsset } from "../../core/promptTypes";
import {
  createDirectorIdeaInspirationSchema,
  directorIdeaInspirationSchema,
} from "./ideaInspiration.promptSchemas";

export interface DirectorIdeaInspirationPromptInput {
  contextSummary: string;
  count?: number;
}

export function createDirectorIdeaInspirationPrompt(
  count = 5,
): PromptAsset<
  DirectorIdeaInspirationPromptInput,
  z.infer<ReturnType<typeof createDirectorIdeaInspirationSchema>>
> {
  const safeCount = Math.max(1, Math.floor(count));
  return {
    id: "novel.director.idea_inspiration",
    version: "v2",
    taskType: "planner",
    mode: "structured",
    language: "zh",
    contextPolicy: {
      maxTokensBudget: 0,
    },
    repairPolicy: {
      maxAttempts: 1,
    },
    semanticRetryPolicy: {
      maxAttempts: 1,
    },
    outputSchema: createDirectorIdeaInspirationSchema(safeCount),
    render: (input) => [
      new SystemMessage([
        "你是中文网文开书灵感助手，服务对象是面对空白输入框不知道写什么的新手作者。",
        `你的任务只生成 ${safeCount} 条可参考的起始想法纯文本，不做小说规划，不生成标题，不生成角色表，不生成大纲。`,
        "",
        "核心目标：",
        "你生成的不是完整故事简介，而是能让用户立刻产生“这个开局我想写”的开书种子。",
        "每条 text 都应该像第一章之前的一句话开书入口：主角是谁、开局发生了什么、这个事件为什么会改变他的命运。",
        "",
        "好的起始想法必须同时具备：",
        "1. 主角身份清楚：读者能立刻知道这是一个什么人。",
        "2. 开局处境明确：主角现在遇到了什么麻烦、羞辱、危机、秘密或机会。",
        "3. 核心变量突出：出现一个能推动整本书的金手指、秘密、规则、关系、身份或目标。",
        "4. 可连续展开：不是一句设定介绍，而是能自然延伸出第一章事件。",
        "5. 商业网文感强：有情绪、有反差、有期待，不要写成抽象概念说明。",
        "",
        `${safeCount} 条想法必须方向明显不同，优先覆盖这些切入角度中的多种：`,
        "1. 爽点强钩子：强调反差、冲突、打脸、危机、第一章抓人事件。",
        "2. 人物成长线：强调主角困境、欲望、关系压力和长期成长。",
        "3. 设定奇观线：强调世界规则、系统机制、异能或职业机制。",
        "4. 关系牵引线：强调误会、契约、搭档、亲情、师徒或宿敌拉扯。",
        "5. 悬念追查线：强调谜团、失踪、伪装身份或隐藏真相。",
        "若条数多于 5，继续在以上角度上做出清晰差异，不要换皮重复。",
        "",
        "写法要求：",
        "1. 每条 text 必须是 60-120 个中文字符左右的一小段纯文本想法。",
        "2. text 要能直接作为用户起始想法参考，但不能说“根据你的信息”。",
        "3. text 不要写成故事梗概，不要总结主角一生，不要承诺结局。",
        "4. text 尽量包含具体场景、具体身份、具体冲突，不要只写抽象设定。",
        "5. 不要使用 Markdown，不要编号，不要输出解释。",
        "",
        "禁止写法：",
        "1. 不要使用“本书讲述”“围绕着”“逐渐成长”“最终成为”“踏上旅程”等空泛简介句。",
        "2. 不要多条都使用废柴、重生、系统、退婚、家族羞辱等同一套入口。",
        "3. 不要只替换题材皮肤，主角类型、矛盾入口或设定机制必须有明显差异。",
        "",
        "tags 要求：",
        "1. tags 是给 UI 展示的短标签，每条 2-4 个。",
        "2. tags 应优先使用具体标签，例如：废柴杂役、当众翻盘、丹炉残魂、时间回溯、边境小吏、规则漏洞。",
        "3. 尽量避免过泛标签，例如：热血、成长、逆袭、冒险。",
        "",
        "输出必须是 JSON 对象，不要输出额外说明。",
      ].join("\n")),

      new HumanMessage([
        "当前开书上下文如下。",
        "你可以参考，但如果信息不足，请用更适合新手起步的稳妥商业网文方向补足。",
        "补足时优先选择清晰、好写、第一章容易展开的方向，而不是复杂宏大设定。",
        "",
        input.contextSummary || "暂无明确上下文。",
      ].join("\n")),
    ],
    postValidate: (output) => {
      return {
        ideas: output.ideas.map((idea) => ({
          angle: idea.angle.trim(),
          text: idea.text.trim(),
          tags: idea.tags.map((tag) => tag.trim()).filter(Boolean),
        })),
      };
    },
  };
}

export const directorIdeaInspirationPrompt = createDirectorIdeaInspirationPrompt(5);

// Keep schema export available for typing in registry tooling.
void directorIdeaInspirationSchema;
