import { mergeImportedOutlineIntoVolumes } from "@ai-novel/shared/utils/outlineImport";
import type { ParsedChapterOutline } from "@ai-novel/shared/utils/outlineImport";
import {
  extractOutlineBootstrapHints,
  type OutlineBootstrapHints,
} from "@ai-novel/shared/utils/outlineBootstrapHints";
import { buildOutlineStrategyAndBeatSheets } from "@ai-novel/shared/utils/outlinePlanningBootstrap";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import type { OutlineCreateBootstrapDraft } from "@ai-novel/shared/types/outlineCreateBootstrap";
import { runStructuredPrompt } from "../../../prompting/core/promptRunner";
import { fromOutlineBootstrapPrompt } from "../../../prompting/prompts/novel/create/fromOutlineBootstrap.prompts";
import { novelCreateResourceRecommendationService } from "../NovelCreateResourceRecommendationService";
import { NovelCoreService } from "../NovelCoreService";
import { NovelVolumeService } from "./NovelVolumeService";
import { outlineImportService, type OutlineImportMode } from "./OutlineImportService";
import { getOutlineCreatePlanningHydrationService } from "./outlineCreate/OutlineCreatePlanningHydrationService";
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

function firstChapterPromiseFallback(parsed: ParsedChapterOutline): string | null {
  const chapters = parsed.volumes.flatMap((volume) => volume.chapters).slice(0, 5);
  if (chapters.length === 0) {
    return null;
  }
  return chapters
    .map((chapter, index) => {
      const detail = chapter.purpose?.trim() || chapter.summary.trim();
      return `第${index + 1}章《${chapter.title}》：${detail.slice(0, 80)}`;
    })
    .join("；")
    .slice(0, 800);
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

/**
 * Fill empty bootstrap fields from deterministic outline preamble hints.
 * Does not override non-empty AI fields except weak placeholder titles.
 */
function mergeBootstrapWithHints(
  draft: OutlineCreateBootstrapDraft,
  hints: OutlineBootstrapHints,
  parsed: ParsedChapterOutline,
): OutlineCreateBootstrapDraft {
  const weakTitle = !draft.title.trim() || draft.title.trim() === "未命名小说";
  const title = weakTitle && hints.title ? hints.title : draft.title;

  let worldDraft = draft.worldDraft;
  if (!worldDraft?.sourceText?.trim() && hints.worldSourceText?.trim()) {
    worldDraft = {
      title: `${title.trim() || hints.title || "本书"}世界`,
      coverSummary: "从大纲「世界观/核心机制」段落整理的设定草稿",
      sourceText: hints.worldSourceText.trim().slice(0, 8_000),
    };
  }

  let characters = draft.characters;
  if (characters.length === 0 && hints.characterNameHints.length > 0) {
    characters = hints.characterNameHints.map((name, index) => ({
      name,
      role: index === 0 ? "主角" : "配角",
      personality: "待补充（来自大纲线索，开书后可再细化）",
      background: "待补充（来自大纲线索，开书后可再细化）",
      appearance: null,
      development: null,
      selected: true,
    }));
  }

  const first30ChapterPromise = draft.first30ChapterPromise.trim()
    || hints.first30ChapterPromise?.trim().slice(0, 800)
    || firstChapterPromiseFallback(parsed)
    || "";

  const description = draft.description.trim()
    || hints.descriptionSeed?.trim().slice(0, 4_000)
    || "";

  return normalizeBootstrapDraft({
    ...draft,
    title,
    description,
    first30ChapterPromise,
    characters,
    worldDraft,
  });
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

    const bootstrapHints = extractOutlineBootstrapHints(input.text ?? "");
    const generated = await runStructuredPrompt({
      asset: fromOutlineBootstrapPrompt,
      promptInput: {
        outlineJson: safeJson(slimOutlineForBootstrap(parseResult.parsed)),
        bootstrapHintsJson: safeJson(bootstrapHints, 8_000),
        rawTextExcerpt: (input.text ?? "").slice(0, 24_000),
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

    const bootstrap = mergeBootstrapWithHints(
      {
        ...generated.output,
        characters: generated.output.characters.map((character) => ({
          ...character,
          selected: true,
        })),
      },
      bootstrapHints,
      parseResult.parsed,
    );

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

    const mergedVolumes = mergeImportedOutlineIntoVolumes([], input.parsed, {
      novelId: novel.id,
    });
    const plannedWorkspace = buildOutlineStrategyAndBeatSheets({
      volumes: mergedVolumes,
      parsed: input.parsed,
      bootstrap,
    });

    // Outline notes are planning shells; sync must not fail the whole create flow.
    // Write strategy + beat sheets with chapters so 节奏/拆章 is immediately usable.
    try {
      await this.volumeService.updateVolumes(novel.id, {
        volumes: plannedWorkspace.volumes,
        strategyPlan: plannedWorkspace.strategyPlan,
        beatSheets: plannedWorkspace.beatSheets,
        rebalanceDecisions: [],
        syncToChapterExecution: true,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "未知错误";
      const workspaceAlreadySaved = /卷工作区已保存|章节执行连接失败/.test(message);
      if (!workspaceAlreadySaved) {
        await this.volumeService.updateVolumes(novel.id, {
          volumes: plannedWorkspace.volumes,
          strategyPlan: plannedWorkspace.strategyPlan,
          beatSheets: plannedWorkspace.beatSheets,
          rebalanceDecisions: [],
          syncToChapterExecution: false,
        });
      }
      warnings.push(
        `拆章已保存，但连接章节执行区未完成。可到「节奏 / 拆章」保存卷工作区后再同步。详情：${message}`,
      );
    }

    const planningHydration = await getOutlineCreatePlanningHydrationService().hydrate({
      novelId: novel.id,
      parsed: input.parsed,
      bootstrap,
      provider: input.provider,
      model: input.model,
      temperature: input.temperature,
    });
    warnings.push(...planningHydration.warnings);

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
