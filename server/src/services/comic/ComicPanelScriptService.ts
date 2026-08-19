import type { LLMProvider } from "@ai-novel/shared/types/llm";
import type { BaseMessage } from "@langchain/core/messages";
import { prisma } from "../../db/prisma";
import { AppError } from "../../middleware/errorHandler";
import { preparePromptExecution, runStructuredPrompt } from "../../prompting/core/promptRunner";
import {
  comicFaithfulPanelScriptPrompt,
  comicPanelScriptPrompt,
  type ComicFaithfulPanelScriptOutput,
  type ComicPanelScriptOutput,
  type ComicPanelScriptPromptInput,
} from "../../prompting/prompts/comic/comic.prompts";
import type { PromptAsset } from "../../prompting/core/promptTypes";
import type { SourceBundle } from "../adaptation/contracts/sourceBundle";
import { adaptationSourceRegistry } from "../adaptation/source/SourceContentPort";
import { comicFactService } from "./ComicFactService";
import { comicFidelityCheckService } from "./ComicFidelityCheckService";
import { resolveComicAdaptationMode, parseComicStylePreset } from "./comicAdaptationMode";
import {
  PANEL_SCRIPT_OUTPUT_REQUIREMENTS,
  parseManualPanelScriptOutput,
} from "./manualPanelScriptNormalize";

export interface GeneratePanelScriptInput {
  targetPanelCount?: number;
  densityMode?: "relaxed" | "balanced" | "compact";
  scriptPromptInstruction?: string;
  /** 强制刷新 sourceText 快照（novel_import / text_import） */
  refreshSourceText?: boolean;
}

export interface PanelScriptPreparePreview {
  kind: "comic_panel_script";
  episodeId: string;
  episodeOrder: number;
  episodeTitle: string;
  targetPanelCount: number;
  densityMode: "relaxed" | "balanced" | "compact";
  comicFormat: string;
  systemPrompt: string;
  userPrompt: string;
  copyText: string;
  schemaHint: string;
}

interface PanelScriptBuildContext {
  episodeId: string;
  projectId: string;
  episodeOrder: number;
  episodeTitle: string;
  existingSceneNames: Set<string>;
  existingSceneCount: number;
  promptInput: ComicPanelScriptPromptInput;
  densityMode: "relaxed" | "balanced" | "compact";
  targetPanelCount: number;
  comicFormat: string;
  stylePreset?: string;
  stylePromptKeywords?: string;
  scriptPromptInstruction?: string;
  useFaithfulScript: boolean;
}

const PANEL_SCRIPT_SCHEMA_HINT = PANEL_SCRIPT_OUTPUT_REQUIREMENTS;

function resolvePanelScriptAsset(useFaithfulScript: boolean): PromptAsset<
  ComicPanelScriptPromptInput,
  ComicPanelScriptOutput | ComicFaithfulPanelScriptOutput
> {
  return useFaithfulScript ? comicFaithfulPanelScriptPrompt : comicPanelScriptPrompt;
}

function messageContentToString(content: BaseMessage["content"]): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object" && "text" in part && typeof part.text === "string") {
          return part.text;
        }
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }
  return content == null ? "" : String(content);
}

function messageRoleLabel(message: BaseMessage): "system" | "user" | "other" {
  const type = typeof message._getType === "function" ? message._getType() : "";
  if (type === "system") return "system";
  if (type === "human" || type === "user") return "user";
  return "other";
}

function buildCopyText(systemPrompt: string, userPrompt: string): string {
  return [
    "【系统提示 / System】",
    systemPrompt.trim(),
    "",
    "【用户提示 / User】",
    userPrompt.trim(),
    "",
    PANEL_SCRIPT_OUTPUT_REQUIREMENTS,
  ].join("\n");
}

export class ComicPanelScriptService {
  private async buildPanelScriptContext(
    episodeId: string,
    input: GeneratePanelScriptInput = {},
  ): Promise<PanelScriptBuildContext> {
    const episode = await prisma.comicEpisode.findUnique({
      where: { id: episodeId },
      include: {
        project: {
          include: {
            characters: { orderBy: { createdAt: "asc" } },
            characterAssets: {
              orderBy: [{ assetType: "asc" }, { sortOrder: "asc" }],
            },
            scenes: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
            sourceBundle: true,
            facts: { orderBy: { episodeOrder: "asc" } },
          },
        },
      },
    });
    if (!episode) throw new AppError(`未找到漫画话数：${episodeId}`, 404);
    if (!episode.outline) {
      throw new AppError("请先生成分话大纲再生成分格脚本。", 400);
    }

    const project = episode.project;
    const adaptationMode = resolveComicAdaptationMode(project.stylePreset, project.sourceType);
    const useFaithfulScript =
      adaptationMode === "faithful" && project.sourceType === "text_import";

    let sourceText = episode.sourceText ?? "";
    if (!sourceText || input.refreshSourceText) {
      if (project.sourceType === "text_import") {
        try {
          let fullText = project.sourceInput?.trim() ?? "";
          if (project.sourceBundle?.bundleJson) {
            const bundle = JSON.parse(project.sourceBundle.bundleJson) as SourceBundle;
            if (bundle.rawText?.trim()) fullText = bundle.rawText.trim();
          }
          const excerpt = episode.sourceText?.trim();
          sourceText = excerpt || fullText;
          if (sourceText) {
            await prisma.comicEpisode.update({
              where: { id: episodeId },
              data: { sourceText },
            });
          }
        } catch {
          // 快照失败不阻断分格生成
        }
      } else if (project.sourceType === "novel_import" && project.sourceRef) {
        try {
          const adapter = adaptationSourceRegistry.resolve("novel_import");
          if (adapter.loadChapterText) {
            const bundle = project.sourceBundle
              ? (JSON.parse(project.sourceBundle.bundleJson) as Record<string, unknown>)
              : null;
            const epBundles = (bundle?.episodes as Array<{
              order: number;
              sourceChapterStart?: number;
              sourceChapterEnd?: number;
            }> | undefined) ?? [];
            const epMeta = epBundles.find((e) => e.order === episode.order);
            const start = epMeta?.sourceChapterStart ?? episode.order;
            const end = epMeta?.sourceChapterEnd ?? episode.order;
            sourceText = await adapter.loadChapterText(
              { type: "novel_import", ref: project.sourceRef },
              start,
              end,
            );
            await prisma.comicEpisode.update({
              where: { id: episodeId },
              data: { sourceText },
            });
          }
        } catch {
          // 快照失败不阻断分格生成
        }
      }
    }

    const stylePresetParsed = parseComicStylePreset(project.stylePreset);
    const stylePreset = stylePresetParsed.style;
    const stylePromptKeywords = stylePresetParsed.promptKeywords;
    const comicFormat = stylePresetParsed.format ?? "webtoon";
    const densityMode = input.densityMode ?? "balanced";
    let targetPanelCount =
      input.targetPanelCount
      ?? (comicFormat === "4koma"
        ? densityMode === "relaxed" ? 10 : densityMode === "compact" ? 16 : 12
        : densityMode === "relaxed" ? 30 : densityMode === "compact" ? 65 : 45);
    if (useFaithfulScript && input.targetPanelCount == null) {
      targetPanelCount = comicFormat === "4koma"
        ? densityMode === "relaxed" ? 8 : densityMode === "compact" ? 14 : 10
        : densityMode === "relaxed" ? 18 : densityMode === "compact" ? 36 : 24;
    }

    const factDigest =
      project.facts
        .filter((f) => f.episodeOrder == null || f.episodeOrder <= episode.order)
        .map((f) => `[${f.category}] ${f.text}`)
        .join("\n") || undefined;

    const episodeTitle = episode.title ?? `第 ${episode.order} 话`;
    const promptInput: ComicPanelScriptPromptInput = {
      projectTitle: project.title,
      episodeOrder: episode.order,
      episodeTitle,
      episodeSynopsis: episode.outline,
      sourceText: sourceText || undefined,
      characters: project.characters.map((c) => ({
        name: c.name,
        visualAnchor: c.visualAnchor,
      })),
      characterAssets: project.characterAssets
        .map((a) => {
          const charName = project.characters.find((c) => c.id === a.characterId)?.name;
          if (!charName) return null;
          return {
            characterName: charName,
            assetType: a.assetType,
            name: a.name,
            description: a.description ?? undefined,
          };
        })
        .filter((a): a is NonNullable<typeof a> => a !== null),
      existingScenes: project.scenes.map((s) => {
        let summary = "";
        try {
          const bible = s.bible ? (JSON.parse(s.bible) as { keyElements?: string }) : null;
          summary = bible?.keyElements ?? "";
        } catch { /* ignore */ }
        return { name: s.name, sceneType: s.sceneType, summary: summary || undefined };
      }),
      stylePreset,
      stylePromptKeywords,
      comicFormat,
      factDigest,
      densityMode,
      scriptPromptInstruction: input.scriptPromptInstruction,
      targetPanelCount,
    };

    return {
      episodeId,
      projectId: project.id,
      episodeOrder: episode.order,
      episodeTitle,
      existingSceneNames: new Set(project.scenes.map((s) => s.name)),
      existingSceneCount: project.scenes.length,
      promptInput,
      densityMode,
      targetPanelCount,
      comicFormat,
      stylePreset,
      stylePromptKeywords,
      scriptPromptInstruction: input.scriptPromptInstruction,
      useFaithfulScript,
    };
  }

  /**
   * 人工粘贴落库用：不拉小说原文、不组装 prompt，避免把「写回 JSON」拖成分钟级。
   */
  private async buildPanelScriptPersistContext(
    episodeId: string,
    input: GeneratePanelScriptInput = {},
  ): Promise<PanelScriptBuildContext> {
    const episode = await prisma.comicEpisode.findUnique({
      where: { id: episodeId },
      select: {
        id: true,
        order: true,
        title: true,
        outline: true,
        project: {
          select: {
            id: true,
            stylePreset: true,
            scenes: { select: { name: true }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
          },
        },
      },
    });
    if (!episode) throw new AppError(`未找到漫画话数：${episodeId}`, 404);
    if (!episode.outline) {
      throw new AppError("请先生成分话大纲再生成分格脚本。", 400);
    }

    const stylePresetRaw = episode.project.stylePreset
      ? (JSON.parse(episode.project.stylePreset) as { style?: string; promptKeywords?: string; format?: string })
      : undefined;
    const stylePreset = stylePresetRaw?.style;
    const stylePromptKeywords = stylePresetRaw?.promptKeywords;
    const comicFormat = stylePresetRaw?.format ?? "webtoon";
    const densityMode = input.densityMode ?? "balanced";
    const targetPanelCount =
      input.targetPanelCount
      ?? (comicFormat === "4koma"
        ? densityMode === "relaxed" ? 10 : densityMode === "compact" ? 16 : 12
        : densityMode === "relaxed" ? 30 : densityMode === "compact" ? 65 : 45);

    return {
      episodeId: episode.id,
      projectId: episode.project.id,
      episodeOrder: episode.order,
      episodeTitle: episode.title ?? `第 ${episode.order} 话`,
      existingSceneNames: new Set(episode.project.scenes.map((s) => s.name)),
      existingSceneCount: episode.project.scenes.length,
      // 人工落库不需要 promptInput；占位满足类型
      promptInput: {
        projectTitle: "",
        episodeOrder: episode.order,
        episodeTitle: episode.title ?? `第 ${episode.order} 话`,
        episodeSynopsis: episode.outline,
        characters: [],
        densityMode,
        targetPanelCount,
        comicFormat,
        stylePreset,
        stylePromptKeywords,
        scriptPromptInstruction: input.scriptPromptInstruction,
      },
      densityMode,
      targetPanelCount,
      comicFormat,
      stylePreset,
      stylePromptKeywords,
      scriptPromptInstruction: input.scriptPromptInstruction,
      useFaithfulScript: false,
    };
  }

  private scheduleFactExtraction(episodeId: string, provider?: LLMProvider): void {
    // 延后到响应发出之后，避免占住 SQLite / 事件循环；人工模式不传无效 provider
    setImmediate(() => {
      void comicFactService.extractAndSave(episodeId, provider);
    });
  }

  private scheduleFidelityCheck(
    episodeId: string,
    useFaithfulScript: boolean,
    provider?: LLMProvider,
  ): void {
    if (!useFaithfulScript) return;
    setImmediate(() => {
      void comicFidelityCheckService.checkEpisode(episodeId, provider);
    });
  }

  private async persistPanelScriptOutput(
    ctx: PanelScriptBuildContext,
    output: ComicPanelScriptOutput,
    meta: { provider?: string; source: "auto" | "manual_paste" },
  ) {
    const panels = output.panels;
    const scenes = output.scenes ?? [];
    const scriptAsset = resolvePanelScriptAsset(ctx.useFaithfulScript);
    const scriptConfig = {
      densityMode: ctx.densityMode,
      targetPanelCount: ctx.targetPanelCount,
      comicFormat: ctx.comicFormat,
      stylePreset: ctx.stylePreset,
      stylePromptKeywords: ctx.stylePromptKeywords,
      scriptPromptInstruction: ctx.scriptPromptInstruction,
      adaptationMode: ctx.useFaithfulScript ? "faithful" : "creative",
      promptAssetId: scriptAsset.id,
      promptAssetVersion: scriptAsset.version,
      provider: meta.provider ?? (meta.source === "manual_paste" ? "manual" : undefined),
      source: meta.source,
      generatedAt: new Date().toISOString(),
    };

    await prisma.$transaction(async (tx) => {
      const newScenes = scenes.filter((s) => !ctx.existingSceneNames.has(s.name));
      if (newScenes.length > 0) {
        await tx.comicScene.createMany({
          data: newScenes.map((s, i) => ({
            projectId: ctx.projectId,
            name: s.name,
            sceneType: s.sceneType,
            bible: JSON.stringify({
              palette: s.palette,
              keyElements: s.keyElements,
              materials: s.materials ?? "",
              ambiance: s.ambiance ?? "",
              layout: s.layout ?? "",
            }),
            sortOrder: ctx.existingSceneCount + i,
          })),
        });
      }

      await tx.comicPanel.deleteMany({ where: { episodeId: ctx.episodeId } });
      await tx.comicPanel.createMany({
        data: panels.map((panel) => ({
          episodeId: ctx.episodeId,
          order: panel.order,
          panelType: panel.panelType,
          densityLevel: panel.densityLevel,
          focus: panel.focus,
          action: panel.action,
          sceneRef: panel.sceneRef?.trim() || null,
          dialogues: panel.dialogues.length > 0 ? JSON.stringify(panel.dialogues) : null,
          characterRefs:
            panel.characterRefs.length > 0 ? JSON.stringify(panel.characterRefs) : null,
          visualPrompt: panel.visualPrompt,
          layoutData: panel.layoutData ? JSON.stringify(panel.layoutData) : null,
        })),
      });
      await tx.comicEpisode.update({
        where: { id: ctx.episodeId },
        data: { status: "scripted", scriptConfig: JSON.stringify(scriptConfig) },
      });
    });

    const factProvider =
      meta.source === "manual_paste"
        ? undefined
        : (meta.provider as LLMProvider | undefined);
    this.scheduleFactExtraction(ctx.episodeId, factProvider);
    this.scheduleFidelityCheck(
      ctx.episodeId,
      ctx.useFaithfulScript,
      meta.source === "manual_paste" ? undefined : (meta.provider as LLMProvider | undefined),
    );

    // 人工/自动都只回精简结果，避免把整话 panels 大字段再序列化一遍拖慢响应
    return prisma.comicEpisode.findUnique({
      where: { id: ctx.episodeId },
      include: {
        _count: { select: { panels: true } },
      },
    });
  }

  async preparePanelScript(
    episodeId: string,
    input: GeneratePanelScriptInput = {},
  ): Promise<PanelScriptPreparePreview> {
    const ctx = await this.buildPanelScriptContext(episodeId, input);
    const scriptAsset = resolvePanelScriptAsset(ctx.useFaithfulScript);
    const prepared = preparePromptExecution({
      asset: scriptAsset,
      promptInput: ctx.promptInput,
      options: { temperature: ctx.useFaithfulScript ? 0.35 : 0.55 },
    });

    let systemPrompt = "";
    let userPrompt = "";
    for (const message of prepared.messages) {
      const role = messageRoleLabel(message);
      const text = messageContentToString(message.content).trim();
      if (!text) continue;
      if (role === "system") {
        systemPrompt = systemPrompt ? `${systemPrompt}\n\n${text}` : text;
      } else if (role === "user") {
        userPrompt = userPrompt ? `${userPrompt}\n\n${text}` : text;
      } else if (!userPrompt) {
        userPrompt = text;
      } else {
        userPrompt = `${userPrompt}\n\n${text}`;
      }
    }

    const copyText = buildCopyText(systemPrompt, userPrompt);
    return {
      kind: "comic_panel_script",
      episodeId: ctx.episodeId,
      episodeOrder: ctx.episodeOrder,
      episodeTitle: ctx.episodeTitle,
      targetPanelCount: ctx.targetPanelCount,
      densityMode: ctx.densityMode,
      comicFormat: ctx.comicFormat,
      systemPrompt,
      userPrompt,
      copyText,
      schemaHint: PANEL_SCRIPT_SCHEMA_HINT,
    };
  }

  async applyManualPanelScript(
    episodeId: string,
    rawText: string,
    input: GeneratePanelScriptInput = {},
  ) {
    const startedAt = Date.now();
    // 先解析（纯 CPU，通常毫秒级），再轻量读库落库
    const output = parseManualPanelScriptOutput(rawText);
    const parseMs = Date.now() - startedAt;
    const ctx = await this.buildPanelScriptPersistContext(episodeId, input);
    const result = await this.persistPanelScriptOutput(ctx, output, {
      provider: "manual",
      source: "manual_paste",
    });
    console.info(
      `[comic.panelScript.manual] episode=${episodeId} panels=${output.panels.length} parseMs=${parseMs} totalMs=${Date.now() - startedAt}`,
    );
    return result;
  }

  async generatePanelScript(
    episodeId: string,
    input: GeneratePanelScriptInput = {},
    provider?: LLMProvider,
  ) {
    const ctx = await this.buildPanelScriptContext(episodeId, input);
    const scriptAsset = resolvePanelScriptAsset(ctx.useFaithfulScript);
    const result = await runStructuredPrompt({
      asset: scriptAsset,
      promptInput: ctx.promptInput,
      options: { temperature: ctx.useFaithfulScript ? 0.35 : 0.55, provider },
    });
    return this.persistPanelScriptOutput(ctx, result.output, {
      provider,
      source: "auto",
    });
  }

  async getPanels(episodeId: string) {
    return prisma.comicPanel.findMany({
      where: { episodeId },
      orderBy: { order: "asc" },
    });
  }

  async getPanel(panelId: string) {
    return prisma.comicPanel.findUnique({ where: { id: panelId } });
  }

  async updatePanelVisualPrompt(panelId: string, visualPrompt: string) {
    return prisma.comicPanel.update({
      where: { id: panelId },
      data: { visualPrompt },
    });
  }

  async updatePanelDialogues(panelId: string, dialogues: unknown[]) {
    return prisma.comicPanel.update({
      where: { id: panelId },
      data: { dialogues: JSON.stringify(dialogues) },
    });
  }
}

export const comicPanelScriptService = new ComicPanelScriptService();
