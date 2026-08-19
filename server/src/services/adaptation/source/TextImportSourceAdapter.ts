/**
 * 文本导入内容源适配器（text_import）
 * 产出 SourceBundle；保真模式默认开启，适合新闻/报道原文。
 */
import { runStructuredPrompt } from "../../../prompting/core/promptRunner";
import { adaptationTextImportSourcePrompt } from "../../../prompting/prompts/adaptation/sourceBundle.prompts";
import type { SourceBundle, SourceRef } from "../contracts/sourceBundle";
import type { SourceContentPort } from "./SourceContentPort";

export type AdaptationMode = "faithful" | "creative";

function resolveAdaptationMode(ref: SourceRef): AdaptationMode {
  if (ref.adaptationMode === "creative" || ref.adaptationMode === "faithful") {
    return ref.adaptationMode;
  }
  return "faithful";
}

export class TextImportSourceAdapter implements SourceContentPort {
  readonly sourceType = "text_import" as const;

  async loadBundle(ref: SourceRef): Promise<SourceBundle> {
    const rawText = ref.rawText?.trim();
    if (!rawText) {
      throw new Error("text_import 内容源缺少导入文本。");
    }
    const adaptationMode = resolveAdaptationMode(ref);
    const result = await runStructuredPrompt({
      asset: adaptationTextImportSourcePrompt,
      promptInput: {
        title: ref.ref || "文本导入漫画项目",
        rawText,
        adaptationMode,
      },
      options: { temperature: adaptationMode === "faithful" ? 0.2 : 0.4 },
    });
    return {
      ...result.output,
      rawText,
    };
  }

  async loadChapterText(ref: SourceRef, _start: number, _end: number): Promise<string> {
    return ref.rawText?.trim() ?? "";
  }
}

export const textImportSourceAdapter = new TextImportSourceAdapter();
