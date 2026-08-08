import { mergeImportedOutlineIntoVolumes } from "@ai-novel/shared/utils/outlineImport";
import type { ParsedChapterOutline } from "@ai-novel/shared/utils/outlineImport";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import type { OutlineCreateBootstrapDraft } from "@ai-novel/shared/types/outlineCreateBootstrap";
import { runStructuredPrompt } from "../../../prompting/core/promptRunner";
import { fromOutlineBootstrapPrompt } from "../../../prompting/prompts/novel/create/fromOutlineBootstrap.prompts";
import { novelCreateResourceRecommendationService } from "../NovelCreateResourceRecommendationService";
import { NovelCoreService } from "../NovelCoreService";
import { NovelVolumeService } from "./NovelVolumeService";
import { outlineImportService, type OutlineImportMode } from "./OutlineImportService";
import { NovelWorldInstanceService } from "../worldContext/NovelWorldInstanceService";
import { WorldService } from "../../world/WorldService";
import { NovelWorkflowService } from "../workflow/NovelWorkflowService";

function safeJson(value: unknown, maxChars = 14_000): string {
  try {
    const text = JSON.stringify(value, null, 2) ?? "null";
    if (text.length <= maxChars) {
      return text;
    }
    return `${text.slice(0, maxChars)}\n…(截断)`;
  } catch {
    return "null";
  }
}

function slimOutlineForBootstrap(parsed: ParsedChapterOutline) {
  return {
    hasVolumeMarkers: parsed.hasVolumeMarkers,
    chapterCount: parsed.chapterCount,
    volumes: parsed.volumes.map((volume) => ({
      title: volume.title,
      chapters: volume.chapters.slice(0, 80).map((chapter, index) => ({
        chapterOrder: index + 1,
        title: chapter.title,
        summary: chapter.summary.slice(0, 400),
        purpose: chapter.purpose?.slice(0, 240) ?? null,
        taskSheet: chapter.taskSheet?.slice(0, 300) ?? null,
      })),
    })),
  };
}

function normalizeBootstrapDraft(draft: OutlineCreateBootstrapDraft): OutlineCreateBootstrapDraft {
  const title = draft.title.trim() || "未命名小说";
  const characters = (draft.characters ?? [])
    .map((character) => ({
      name: character.name.trim(),
      role: character.role.trim() || "配角",
      personality: character.personality.trim() || "待补充",
      background: character.background.trim() || "待补充",
      appearance: character.appearance?.trim() || null,
      development: character.development?.trim() || null,
      selected: character.selected !== false,
    }))
    .filter((character) => character.name.length > 0);

  const worldSource = draft.worldDraft?.sourceText?.trim() ?? "";
  const worldDraft = worldSource
    ? {
        title: draft.worldDraft?.title?.trim() || `${title}世界`,
        coverSummary: draft.worldDraft?.coverSummary?.trim() || "从大纲抽取的世界观草稿",
        sourceText: worldSource,
      }
    : null;

  return {
    title,
    description: draft.description.trim(),
    targetAudience: draft.targetAudience.trim(),
    commercialTags: (draft.commercialTags ?? []).map((tag) => tag.trim()).filter(Boolean).slice(0, 6),
    bookSellingPoint: draft.bookSellingPoint.trim(),
    competingFeel: draft.competingFeel.trim(),
    first30ChapterPromise: draft.first30ChapterPromise.trim(),
    characters,
    worldDraft,
  };
}

export type OutlineCreatePreviewResult = {
  parsed: ParsedChapterOutline;
  bootstrap: OutlineCreateBootstrapDraft;
  usedAiForParse: boolean;
  warnings: string[];
};

export type OutlineCreateConfirmResult = {
  novel: Awaited<ReturnType<NovelCoreService["createNovel"]>>;
  workflowTaskId: string | null;
  createdCharacterCount: number;
  hasWorld: boolean;
  warnings: string[];
};

export class OutlineCreateBootstrapService {
  private readonly core = new NovelCoreService();
  private readonly volumeService = new NovelVolumeService();
  private readonly worldService = new WorldService();
  private readonly novelWorldService = new NovelWorldInstanceService();
  private readonly workflowService = new NovelWorkflowService();

  async preview(input: {
    text: string;
    mode?: OutlineImportMode;
    provider?: LLMProvider;
    model?: string;
    temperature?: number;
  }): Promise<OutlineCreatePreviewResult> {
    const warnings: string[] = [];
    const parseResult = await outlineImportService.parseOutlineText({
      text: input.text,
      mode: input.mode,
      provider: input.provider,
      model: input.model,
      temperature: input.temperature,
    });
    warnings.push(...parseResult.warnings);

    if (parseResult.parsed.chapterCount < 1) {
      throw new Error("未能识别任何章节，请先完善大纲后再开书。");
    }

    const generated = await runStructuredPrompt({
      asset: fromOutlineBootstrapPrompt,
      promptInput: {
        outlineJson: safeJson(slimOutlineForBootstrap(parseResult.parsed)),
        rawTextExcerpt: (input.text ?? "").slice(0, 12_000),
      },
      contextBlocks: [],
      options: {
        provider: input.provider,
        model: input.model,
        temperature: input.temperature ?? 0.2,
        maxTokens: 5_200,
        stage: "setup",
        itemKey: "create_from_outline_bootstrap",
        scope: "create_from_outline",
        entrypoint: "create_from_outline_preview",
      },
    });

    const bootstrap = normalizeBootstrapDraft({
      ...generated.output,
      characters: generated.output.characters.map((character) => ({
        ...character,
        selected: true,
      })),
    });

    if (!bootstrap.worldDraft) {
      warnings.push("大纲里世界设定较少，开书时将跳过世界观草稿。");
    }
    if (bootstrap.characters.length === 0) {
      warnings.push("未能抽出明确角色，开书后可到角色页再补。");
    }

    return {
      parsed: parseResult.parsed,
      bootstrap,
      usedAiForParse: parseResult.usedAi,
      warnings,
    };
  }

  async create(input: {
    parsed: ParsedChapterOutline;
    bootstrap: OutlineCreateBootstrapDraft;
    provider?: LLMProvider;
    model?: string;
    temperature?: number;
  }): Promise<OutlineCreateConfirmResult> {
    if (!input.parsed || input.parsed.chapterCount < 1) {
      throw new Error("请先提供可开书的章节大纲。");
    }

    const bootstrap = normalizeBootstrapDraft(input.bootstrap);
    if (!bootstrap.title.trim()) {
      throw new Error("请填写书名。");
    }

    const warnings: string[] = [];
    const foundation = await novelCreateResourceRecommendationService.resolveRequired({
      title: bootstrap.title,
      description: bootstrap.description,
      targetAudience: bootstrap.targetAudience,
      bookSellingPoint: bootstrap.bookSellingPoint,
      competingFeel: bootstrap.competingFeel,
      first30ChapterPromise: bootstrap.first30ChapterPromise,
      commercialTags: bootstrap.commercialTags,
      provider: input.provider,
      model: input.model,
      temperature: input.temperature,
    });

    const seedPayload = {
      source: "create_from_outline",
      basicForm: {
        title: bootstrap.title,
        description: bootstrap.description,
        targetAudience: bootstrap.targetAudience,
        bookSellingPoint: bootstrap.bookSellingPoint,
        competingFeel: bootstrap.competingFeel,
        first30ChapterPromise: bootstrap.first30ChapterPromise,
        commercialTags: bootstrap.commercialTags,
      },
    };

    const workflowBefore = await this.workflowService.bootstrapTask({
      lane: "manual_create",
      title: bootstrap.title,
      seedPayload,
    });

    const novel = await this.core.createNovel({
      title: bootstrap.title,
      description: bootstrap.description,
      targetAudience: bootstrap.targetAudience || undefined,
      bookSellingPoint: bootstrap.bookSellingPoint || undefined,
      competingFeel: bootstrap.competingFeel || undefined,
      first30ChapterPromise: bootstrap.first30ChapterPromise || undefined,
      commercialTags: bootstrap.commercialTags.length > 0 ? bootstrap.commercialTags : undefined,
      genreId: foundation.genreId,
      primaryStoryModeId: foundation.primaryStoryModeId,
      secondaryStoryModeId: foundation.secondaryStoryModeId,
      writingMode: "original",
      estimatedChapterCount: input.parsed.chapterCount,
      outlineStatus: "in_progress",
      projectStatus: "in_progress",
    });

    const workflowAfter = await this.workflowService.bootstrapTask({
      workflowTaskId: workflowBefore.id,
      novelId: novel.id,
      lane: "manual_create",
      title: novel.title,
      seedPayload,
    });

    const volumes = mergeImportedOutlineIntoVolumes([], input.parsed, {
      novelId: novel.id,
    });

    await this.volumeService.updateVolumes(novel.id, {
      volumes,
      beatSheets: [],
      rebalanceDecisions: [],
      syncToChapterExecution: true,
    });

    let createdCharacterCount = 0;
    const selectedCharacters = bootstrap.characters.filter((character) => character.selected !== false);
    for (const character of selectedCharacters) {
      try {
        await this.core.createCharacter(novel.id, {
          name: character.name,
          role: character.role || "配角",
          personality: character.personality,
          background: character.background,
          appearance: character.appearance ?? undefined,
          development: character.development ?? undefined,
        });
        createdCharacterCount += 1;
      } catch (error) {
        warnings.push(
          `角色「${character.name}」创建失败：${error instanceof Error ? error.message : "未知错误"}`,
        );
      }
    }

    let hasWorld = false;
    if (bootstrap.worldDraft?.sourceText.trim()) {
      try {
        const world = await this.worldService.importWorld({
          format: "text",
          content: bootstrap.worldDraft.sourceText,
          name: bootstrap.worldDraft.title,
          provider: input.provider,
          model: input.model,
        });
        await this.novelWorldService.importFromWorldLibrary({
          novelId: novel.id,
          worldId: world.id,
          syncEnabled: false,
          syncDirection: "none",
        });
        hasWorld = true;
      } catch (error) {
        warnings.push(
          `世界观草稿未能写入：${error instanceof Error ? error.message : "未知错误"}。可到世界页再补。`,
        );
      }
    }

    return {
      novel,
      workflowTaskId: workflowAfter?.id ?? workflowBefore?.id ?? null,
      createdCharacterCount,
      hasWorld,
      warnings,
    };
  }
}

export const outlineCreateBootstrapService = new OutlineCreateBootstrapService();
