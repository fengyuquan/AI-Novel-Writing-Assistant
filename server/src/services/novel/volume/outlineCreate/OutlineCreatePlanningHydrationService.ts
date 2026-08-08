import type { LLMProvider } from "@ai-novel/shared/types/llm";
import type { OutlineCreateBootstrapDraft } from "@ai-novel/shared/types/outlineCreateBootstrap";
import type { ParsedChapterOutline } from "@ai-novel/shared/utils/outlineImport";
import {
  buildOutlineBookContractDraft,
  buildOutlineStoryInput,
} from "@ai-novel/shared/utils/outlinePlanningBootstrap";
import { BookContractService } from "../../BookContractService";
import { StoryMacroPlanService } from "../../storyMacro/StoryMacroPlanService";

export type OutlinePlanningHydrationResult = {
  warnings: string[];
  hasStoryMacro: boolean;
  hasBookContract: boolean;
};

/**
 * Hydrate story-macro + book-contract layers after outline chapters are saved.
 * Volume strategy / beat sheets are written with the chapter import itself.
 *
 * Services are constructed lazily to avoid CJS circular-import startup crashes
 * (`X is not a constructor`) when this module is pulled in via novel volume facades.
 */
export class OutlineCreatePlanningHydrationService {
  private storyMacroService: StoryMacroPlanService | null = null;
  private bookContractService: BookContractService | null = null;

  private getStoryMacroService(): StoryMacroPlanService {
    if (!this.storyMacroService) {
      this.storyMacroService = new StoryMacroPlanService();
    }
    return this.storyMacroService;
  }

  private getBookContractService(): BookContractService {
    if (!this.bookContractService) {
      this.bookContractService = new BookContractService();
    }
    return this.bookContractService;
  }

  async hydrate(input: {
    novelId: string;
    parsed: ParsedChapterOutline;
    bootstrap: OutlineCreateBootstrapDraft;
    provider?: LLMProvider;
    model?: string;
    temperature?: number;
  }): Promise<OutlinePlanningHydrationResult> {
    const warnings: string[] = [];
    let hasStoryMacro = false;
    let hasBookContract = false;

    const storyInput = buildOutlineStoryInput({
      bootstrap: input.bootstrap,
      parsed: input.parsed,
    });

    if (storyInput.trim()) {
      try {
        const plan = await this.getStoryMacroService().decompose(input.novelId, storyInput, {
          provider: input.provider,
          model: input.model,
          temperature: input.temperature ?? 0.25,
        });
        hasStoryMacro = Boolean(plan.decomposition);
        try {
          await this.getStoryMacroService().buildConstraintEngine(input.novelId);
        } catch (error) {
          warnings.push(
            `故事约束引擎未建成：${error instanceof Error ? error.message : "未知错误"}。可到宏观规划页再生成。`,
          );
        }
      } catch (error) {
        warnings.push(
          `故事宏观规划未生成：${error instanceof Error ? error.message : "未知错误"}。可到宏观规划页用导入简介重新拆解。`,
        );
      }
    } else {
      warnings.push("缺少可用于宏观规划的故事输入，已跳过故事引擎生成。");
    }

    try {
      await this.getBookContractService().upsert(
        input.novelId,
        buildOutlineBookContractDraft({
          bootstrap: input.bootstrap,
          parsed: input.parsed,
        }),
      );
      hasBookContract = true;
    } catch (error) {
      warnings.push(
        `书级合约未写入：${error instanceof Error ? error.message : "未知错误"}。`,
      );
    }

    return {
      warnings,
      hasStoryMacro,
      hasBookContract,
    };
  }
}

let outlineCreatePlanningHydrationServiceSingleton: OutlineCreatePlanningHydrationService | null = null;

export function getOutlineCreatePlanningHydrationService(): OutlineCreatePlanningHydrationService {
  if (!outlineCreatePlanningHydrationServiceSingleton) {
    outlineCreatePlanningHydrationServiceSingleton = new OutlineCreatePlanningHydrationService();
  }
  return outlineCreatePlanningHydrationServiceSingleton;
}

/** @deprecated Prefer getOutlineCreatePlanningHydrationService() for lazy init. */
export const outlineCreatePlanningHydrationService = {
  hydrate(...args: Parameters<OutlineCreatePlanningHydrationService["hydrate"]>) {
    return getOutlineCreatePlanningHydrationService().hydrate(...args);
  },
};
