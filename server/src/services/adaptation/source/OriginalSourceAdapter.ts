/**
 * 原创灵感内容源适配器（original）
 */
import { runStructuredPrompt } from "../../../prompting/core/promptRunner";
import { adaptationOriginalSourcePrompt } from "../../../prompting/prompts/adaptation/sourceBundle.prompts";
import type { SourceBundle, SourceRef } from "../contracts/sourceBundle";
import type { SourceContentPort } from "./SourceContentPort";

export class OriginalSourceAdapter implements SourceContentPort {
  readonly sourceType = "original" as const;

  async loadBundle(ref: SourceRef): Promise<SourceBundle> {
    const inspiration = ref.inspiration?.trim() || ref.rawText?.trim();
    if (!inspiration) {
      throw new Error("original 内容源缺少灵感或题材输入。");
    }
    const result = await runStructuredPrompt({
      asset: adaptationOriginalSourcePrompt,
      promptInput: {
        title: ref.ref || "原创漫画项目",
        inspiration,
      },
      options: { temperature: 0.7 },
    });
    return result.output;
  }
}

export const originalSourceAdapter = new OriginalSourceAdapter();
