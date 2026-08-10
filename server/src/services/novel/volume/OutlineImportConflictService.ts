import type { LLMProvider } from "@ai-novel/shared/types/llm";
import type {
  OutlineImportConflictAnalysisResult,
  OutlineImportConflictItem,
} from "@ai-novel/shared/types/outlineImportConflict";
import type { ParsedChapterOutline } from "@ai-novel/shared/utils/outlineImport";
import { prisma } from "../../../db/prisma";
import { runStructuredPrompt } from "../../../prompting/core/promptRunner";
import { volumeOutlineImportConflictPrompt } from "../../../prompting/prompts/novel/volume/outlineImportConflict.prompts";
import { NovelWorldInstanceService } from "../worldContext/NovelWorldInstanceService";
import { NovelVolumeService } from "./NovelVolumeService";

function safeJson(value: unknown, maxChars = 12_000): string {
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

function slimCharacters(rows: Array<{
  id: string;
  name: string;
  role: string;
  personality?: string | null;
  background?: string | null;
  development?: string | null;
  appearance?: string | null;
  prohibitionsJson?: string | null;
}>) {
  return rows.slice(0, 40).map((row) => ({
    id: row.id,
    name: row.name,
    role: row.role,
    personality: row.personality?.slice(0, 400) ?? "",
    background: row.background?.slice(0, 500) ?? "",
    development: row.development?.slice(0, 400) ?? "",
    appearance: row.appearance?.slice(0, 200) ?? null,
    prohibitionsJson: row.prohibitionsJson?.slice(0, 400) ?? null,
  }));
}

function slimOutline(parsed: ParsedChapterOutline) {
  return {
    hasVolumeMarkers: parsed.hasVolumeMarkers,
    chapterCount: parsed.chapterCount,
    volumes: parsed.volumes.map((volume) => ({
      title: volume.title,
      chapters: volume.chapters.map((chapter, index) => ({
        chapterOrder: index + 1,
        title: chapter.title,
        summary: chapter.summary.slice(0, 500),
        purpose: chapter.purpose?.slice(0, 300) ?? null,
        mustAvoid: chapter.mustAvoid?.slice(0, 200) ?? null,
        taskSheet: chapter.taskSheet?.slice(0, 400) ?? null,
      })),
    })),
  };
}

export class OutlineImportConflictService {
  private readonly volumeService = new NovelVolumeService();
  private readonly novelWorldService = new NovelWorldInstanceService();

  async analyzeConflicts(
    novelId: string,
    input: {
      parsed: ParsedChapterOutline;
      provider?: LLMProvider;
      model?: string;
      temperature?: number;
    },
  ): Promise<OutlineImportConflictAnalysisResult> {
    if (!input.parsed || input.parsed.chapterCount < 1) {
      throw new Error("请先提供可分析的导入大纲。");
    }

    const novel = await prisma.novel.findUnique({
      where: { id: novelId },
      select: { id: true, title: true },
    });
    if (!novel) {
      throw new Error("小说不存在。");
    }

    const [characters, workspace, worldView] = await Promise.all([
      prisma.character.findMany({
        where: { novelId },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          name: true,
          role: true,
          personality: true,
          background: true,
          development: true,
          appearance: true,
          prohibitionsJson: true,
        },
      }),
      this.volumeService.getVolumes(novelId),
      this.novelWorldService.getNovelWorldView(novelId).catch(() => null),
    ]);

    const worldPayload = worldView?.hasNovelWorld && worldView.novelWorld
      ? {
          title: worldView.novelWorld.title,
          coverSummary: worldView.novelWorld.coverSummary,
          hasStructuredData: worldView.novelWorld.hasStructuredData,
          handbookPreview: worldView.handbook
            ? {
                summary: worldView.handbook.summary?.slice(0, 800) ?? null,
                identity: worldView.handbook.identity?.slice(0, 400) ?? null,
                coreRules: (worldView.handbook.coreRules ?? []).slice(0, 12).map((rule) => ({
                  name: rule.name,
                  summary: rule.summary?.slice(0, 300) ?? "",
                  boundary: rule.boundary?.slice(0, 200) ?? null,
                })),
                tensions: (worldView.handbook.tensions ?? []).slice(0, 12),
              }
            : null,
        }
      : null;

    const strategyPayload = workspace.strategyPlan
      ? {
          recommendedVolumeCount: workspace.strategyPlan.recommendedVolumeCount,
          readerRewardLadder: workspace.strategyPlan.readerRewardLadder,
          escalationLadder: workspace.strategyPlan.escalationLadder,
          midpointShift: workspace.strategyPlan.midpointShift,
          notes: workspace.strategyPlan.notes,
          volumes: workspace.strategyPlan.volumes?.slice(0, 24),
        }
      : null;

    const beatSheetsPayload = (workspace.beatSheets ?? []).slice(0, 12).map((sheet) => ({
      volumeId: sheet.volumeId,
      status: sheet.status,
      beats: (sheet.beats ?? []).slice(0, 10).map((beat) => ({
        key: beat.key,
        label: beat.label,
        title: beat.title,
        summary: beat.summary,
        mustDeliver: (beat.mustDeliver ?? []).slice(0, 6),
      })),
    }));

    const generated = await runStructuredPrompt({
      asset: volumeOutlineImportConflictPrompt,
      promptInput: {
        novelTitle: novel.title,
        outlineJson: safeJson(slimOutline(input.parsed)),
        charactersJson: safeJson(slimCharacters(characters)),
        worldJson: safeJson(worldPayload),
        strategyJson: safeJson(strategyPayload),
        beatSheetsJson: safeJson(beatSheetsPayload),
      },
      contextBlocks: [],
      options: {
        provider: input.provider,
        model: input.model,
        temperature: input.temperature ?? 0.1,
        maxTokens: 4_800,
        novelId,
        stage: "structured_outline",
        itemKey: "outline_import_conflict",
        scope: "outline_import_conflict",
        entrypoint: "volume_outline_import_conflict",
      },
    });

    const conflicts: OutlineImportConflictItem[] = (generated.output.conflicts ?? []).map((item, index) => ({
      ...item,
      conflictId: item.conflictId?.trim() || `c${index + 1}`,
      userChoice: null,
    }));

    return {
      conflicts,
      analyzedAt: new Date().toISOString(),
      settingSnapshotSummary: {
        characterCount: characters.length,
        hasWorld: Boolean(worldPayload),
        hasStrategyPlan: Boolean(strategyPayload),
        beatSheetCount: workspace.beatSheets?.length ?? 0,
      },
    };
  }
}

export const outlineImportConflictService = new OutlineImportConflictService();
