import type { LLMProvider } from "@ai-novel/shared/types/llm";
import { prisma } from "../../../db/prisma";
import { runStructuredPrompt } from "../../../prompting/core/promptRunner";
import { chapterImageStoryPackPrompt } from "../../../prompting/prompts/novel/chapterEditor/imageStoryPack.prompts";
import {
  buildCaptionedImagePrompt,
  CAPTIONED_IMAGE_USAGE_HINT,
} from "../../drama/export/buildCaptionedImagePrompt";
import {
  appendCharacterVisualLocks,
  sanitizeSpokenDialogue,
} from "../../drama/export/imageStoryPromptEnrichment";
import { normalizeChapterContent } from "./chapterEditorShared";
import { ChapterEditorWorkspaceService } from "./ChapterEditorWorkspaceService";

const MAX_CONTENT_CHARS = 14_000;

export interface ChapterImageStoryPackRequest {
  content?: string;
  provider?: LLMProvider;
  model?: string;
  temperature?: number;
}

export interface ChapterImageStoryPackShot {
  order: number;
  action: string;
  visualPrompt: string;
  dialogue: string | null;
  location: string | null;
  shotSize: string | null;
  durationSec: number | null;
  characterRefs: string[];
  captionedImagePrompt: string;
}

export interface ChapterImageStoryPackResult {
  format: "ai-novel.chapter.image-story-pack.v1";
  exportType: "chapter_captioned_image_pack";
  mode: "captioned_image";
  aspectRatio: "9:16";
  summary: string;
  chapter: {
    novelId: string;
    novelTitle: string;
    chapterId: string;
    order: number;
    title: string;
  };
  characters: Array<{
    name: string;
    visualAnchor: string | null;
  }>;
  shots: ChapterImageStoryPackShot[];
  warnings: string[];
  usageHint: string;
}

function truncateContent(content: string): string {
  const normalized = content.trim();
  if (normalized.length <= MAX_CONTENT_CHARS) {
    return normalized;
  }
  return `${normalized.slice(0, MAX_CONTENT_CHARS)}\n\n……（正文过长，已截取前半段用于切图拆镜）`;
}

function buildCharactersDigest(
  characters: Array<{ name: string; appearance: string | null; persona: string | null }>,
): string {
  if (characters.length === 0) {
    return "暂无角色视觉锚点，请根据正文自行保持人物外貌一致。";
  }
  return characters
    .map((character, index) => {
      const appearance = character.appearance?.trim() || "外貌未注明";
      const persona = character.persona?.trim();
      return `${index + 1}. ${character.name}｜造型：${appearance}${persona ? `｜人设：${persona}` : ""}`;
    })
    .join("\n");
}

export class ChapterImageStoryPackService {
  constructor(
    private readonly workspaceService = new ChapterEditorWorkspaceService(),
    private readonly promptRunner = runStructuredPrompt,
  ) {}

  async generate(
    novelId: string,
    chapterId: string,
    input: ChapterImageStoryPackRequest = {},
  ): Promise<ChapterImageStoryPackResult> {
    const context = await this.workspaceService.loadContext(novelId, chapterId);
    const content = truncateContent(
      normalizeChapterContent(input.content ?? context.chapter.content ?? ""),
    );
    if (!content.trim()) {
      throw new Error("当前章节正文为空，无法生成切图提示词。");
    }

    const characterRows = await prisma.character.findMany({
      where: { novelId },
      orderBy: { createdAt: "asc" },
      take: 24,
      select: {
        name: true,
        appearance: true,
        firstImpression: true,
        personality: true,
        signatureDetail: true,
      },
    });

    const characters = characterRows.map((row) => {
      const visualParts = [
        row.appearance?.trim(),
        row.signatureDetail?.trim(),
        row.firstImpression?.trim(),
      ].filter(Boolean);
      return {
        name: row.name,
        visualAnchor: visualParts.length > 0 ? visualParts.join("；") : null,
        persona: row.personality?.trim() || null,
      };
    });

    const result = await this.promptRunner({
      asset: chapterImageStoryPackPrompt,
      promptInput: {
        novelTitle: context.novel.title?.trim() || "未命名小说",
        chapterTitle: context.chapter.title?.trim() || `第 ${context.chapter.order} 章`,
        chapterOrder: context.chapter.order,
        content,
        charactersDigest: buildCharactersDigest(
          characters.map((item) => ({
            name: item.name,
            appearance: item.visualAnchor,
            persona: item.persona,
          })),
        ),
      },
      options: {
        ...(input.provider ? { provider: input.provider } : {}),
        ...(input.model ? { model: input.model } : {}),
        temperature: input.temperature ?? 0.4,
      },
    });

    const warnings: string[] = [];
    const characterLockList = characters.map((item) => ({
      name: item.name,
      visualAnchor: item.visualAnchor,
    }));
    const shots: ChapterImageStoryPackShot[] = result.output.shots
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((shot, index) => {
        const characterRefs = (shot.characterRefs ?? []).map((name) => name.trim()).filter(Boolean);
        const rawVisual = shot.visualPrompt.trim();
        const visualPrompt = appendCharacterVisualLocks(rawVisual, characterRefs, characterLockList);
        const dialogue = sanitizeSpokenDialogue(shot.dialogue);
        if (!rawVisual) {
          warnings.push(`镜头 ${shot.order || index + 1} 缺少 visualPrompt。`);
        }
        if (shot.dialogue?.trim() && !dialogue) {
          warnings.push(`镜头 ${shot.order || index + 1} 的 dialogue 已按旁白/叙述过滤，本镜不入画文字。`);
        }
        return {
          order: shot.order || index + 1,
          action: shot.action.trim(),
          visualPrompt,
          dialogue,
          location: shot.location?.trim() || null,
          shotSize: shot.shotSize?.trim() || null,
          durationSec: typeof shot.durationSec === "number" ? shot.durationSec : null,
          characterRefs,
          captionedImagePrompt: buildCaptionedImagePrompt({
            visualPrompt,
            dialogue,
          }),
        };
      });

    if (shots.length === 0) {
      throw new Error("AI 未返回可用镜头，请重试。");
    }

    return {
      format: "ai-novel.chapter.image-story-pack.v1",
      exportType: "chapter_captioned_image_pack",
      mode: "captioned_image",
      aspectRatio: "9:16",
      summary: result.output.summary.trim(),
      chapter: {
        novelId,
        novelTitle: context.novel.title?.trim() || "未命名小说",
        chapterId,
        order: context.chapter.order,
        title: context.chapter.title?.trim() || `第 ${context.chapter.order} 章`,
      },
      characters: characters.map((item) => ({
        name: item.name,
        visualAnchor: item.visualAnchor,
      })),
      shots,
      warnings,
      usageHint: CAPTIONED_IMAGE_USAGE_HINT,
    };
  }
}
