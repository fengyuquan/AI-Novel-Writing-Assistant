import {
  parseChapterOutlineMarkdown,
  type ParsedChapterOutline,
} from "@ai-novel/shared/utils/outlineImport";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import { prisma } from "../../../db/prisma";
import { runStructuredPrompt } from "../../../prompting/core/promptRunner";
import { volumeOutlineImportPrompt } from "../../../prompting/prompts/novel/volume/outlineImport.prompts";

export type OutlineImportMode = "auto" | "template" | "ai";

export type OutlineImportResult = {
  parsed: ParsedChapterOutline;
  usedAi: boolean;
  warnings: string[];
};

function toParsedFromAi(output: {
  volumes: Array<{
    title: string;
    chapters: Array<{
      title: string;
      summary: string;
      purpose?: string | null;
      mustAvoid?: string | null;
      taskSheet?: string | null;
    }>;
  }>;
}): ParsedChapterOutline {
  const volumes = output.volumes.map((volume) => ({
    title: volume.title.trim() || "第1卷",
    chapters: volume.chapters.map((chapter) => ({
      title: chapter.title.trim(),
      summary: chapter.summary.trim() || chapter.title.trim(),
      purpose: chapter.purpose?.trim() || null,
      mustAvoid: chapter.mustAvoid?.trim() || null,
      taskSheet: chapter.taskSheet?.trim() || null,
    })),
  }));
  const chapterCount = volumes.reduce((sum, volume) => sum + volume.chapters.length, 0);
  return {
    volumes,
    confidence: "high",
    issues: [],
    chapterCount,
    hasVolumeMarkers: volumes.length > 1
      || volumes.some((volume) => /第\s*\d+\s*卷|卷/.test(volume.title)),
  };
}

export class OutlineImportService {
  async parseOutlineText(input: {
    text: string;
    mode?: OutlineImportMode;
    novelId?: string;
    novelTitle?: string | null;
    novelDescription?: string | null;
    provider?: LLMProvider;
    model?: string;
    temperature?: number;
  }): Promise<OutlineImportResult> {
    const mode: OutlineImportMode = input.mode ?? "auto";
    const warnings: string[] = [];
    const templateParsed = parseChapterOutlineMarkdown(input.text ?? "");

    if (mode === "template") {
      if (templateParsed.chapterCount < 1) {
        throw new Error(templateParsed.issues[0] || "模板未能识别任何章节。");
      }
      return {
        parsed: templateParsed,
        usedAi: false,
        warnings: templateParsed.issues,
      };
    }

    const shouldUseAi = mode === "ai"
      || templateParsed.confidence === "low"
      || templateParsed.chapterCount < 1;

    if (!shouldUseAi) {
      return {
        parsed: templateParsed,
        usedAi: false,
        warnings: templateParsed.issues,
      };
    }

    if (mode === "auto" && templateParsed.chapterCount < 1) {
      warnings.push("模板未能稳定识别章节，已改用 AI 整理。");
    } else if (mode === "auto") {
      warnings.push("模板置信度不足，已改用 AI 整理。");
    }

    const generated = await runStructuredPrompt({
      asset: volumeOutlineImportPrompt,
      promptInput: {
        novelTitle: input.novelTitle?.trim() || "未命名",
        novelDescription: input.novelDescription ?? "",
        rawText: input.text,
        parseIssues: templateParsed.issues,
      },
      contextBlocks: [],
      options: {
        provider: input.provider,
        model: input.model,
        temperature: input.temperature ?? 0.2,
        maxTokens: 4_800,
        novelId: input.novelId,
        stage: "structured_outline",
        itemKey: "outline_import",
        scope: "outline_import",
        entrypoint: "volume_outline_import",
      },
    });

    const parsed = toParsedFromAi(generated.output);
    if (parsed.chapterCount < 1) {
      throw new Error("AI 未能整理出可用章节清单。");
    }

    return {
      parsed,
      usedAi: true,
      warnings,
    };
  }

  async importOutline(
    novelId: string,
    input: {
      text: string;
      mode?: OutlineImportMode;
      provider?: LLMProvider;
      model?: string;
      temperature?: number;
    },
  ): Promise<OutlineImportResult> {
    const novel = await prisma.novel.findUnique({
      where: { id: novelId },
      select: { id: true, title: true, description: true },
    });
    if (!novel) {
      throw new Error("小说不存在。");
    }

    return this.parseOutlineText({
      text: input.text,
      mode: input.mode,
      novelId,
      novelTitle: novel.title,
      novelDescription: novel.description,
      provider: input.provider,
      model: input.model,
      temperature: input.temperature,
    });
  }
}

export const outlineImportService = new OutlineImportService();
