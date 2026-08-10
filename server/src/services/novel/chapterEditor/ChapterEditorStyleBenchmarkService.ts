import { randomUUID } from "node:crypto";
import type {
  ChapterEditorStyleBenchmarkCacheSession,
  ChapterEditorStyleBenchmarkCompareRequest,
  ChapterEditorStyleBenchmarkCompareResponse,
  ChapterEditorStyleBenchmarkLayoutColumns,
  ChapterEditorStyleBenchmarkReference,
  ChapterEditorStyleBenchmarkRewriteRequest,
  ChapterEditorStyleBenchmarkRewriteResponse,
  ChapterEditorStyleBenchmarkSourceOption,
  ChapterEditorStyleBenchmarkSourcesResponse,
} from "@ai-novel/shared/types/novel";
import { prisma } from "../../../db/prisma";
import { runStructuredPrompt } from "../../../prompting/core/promptRunner";
import {
  chapterEditorStyleBenchmarkComparePrompt,
  chapterEditorStyleBenchmarkRewritePrompt,
  type ChapterEditorStyleBenchmarkComparePromptInput,
  type ChapterEditorStyleBenchmarkRewritePromptInput,
} from "../../../prompting/prompts/novel/chapterEditor/styleBenchmark.prompts";
import { KnowledgeService } from "../../knowledge/KnowledgeService";
import { StyleBindingService } from "../../styleEngine/StyleBindingService";
import { StyleProfileService } from "../../styleEngine/StyleProfileService";
import { buildWriterStyleContractText } from "../../styleEngine/styleContractText";
import { ChapterEditorWorkspaceService } from "./ChapterEditorWorkspaceService";
import { countEditorWords, normalizeChapterContent } from "./chapterEditorShared";

const FULL_CHAPTER_BENCHMARK_LIMIT = 10000;
const SAMPLE_EXCERPT_CHARS = 900;
const MAX_SAMPLE_EXCERPTS = 3;
const MAX_CACHED_BENCHMARKS = 12;
const CACHE_SESSION_VERSION = 2;

function normalizeLayoutColumns(value: unknown): ChapterEditorStyleBenchmarkLayoutColumns {
  const numeric = typeof value === "number" ? value : Number(value);
  if (numeric === 2 || numeric === 3 || numeric === 4) {
    return numeric;
  }
  return 1;
}

function isRewriteResult(value: unknown): value is ChapterEditorStyleBenchmarkRewriteResponse {
  if (!value || typeof value !== "object") {
    return false;
  }
  const record = value as Record<string, unknown>;
  return typeof record.benchmarkContent === "string"
    && typeof record.userContent === "string"
    && typeof record.sessionId === "string"
    && Boolean(record.reference && typeof record.reference === "object");
}

function isCompareResult(value: unknown): value is ChapterEditorStyleBenchmarkCompareResponse {
  if (!value || typeof value !== "object") {
    return false;
  }
  const record = value as Record<string, unknown>;
  return typeof record.summary === "string"
    && typeof record.sessionId === "string"
    && Array.isArray(record.segments);
}

function parseCacheSession(
  novelId: string,
  chapterId: string,
  raw: string,
): ChapterEditorStyleBenchmarkCacheSession | null {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const benchmarks = Array.isArray(parsed.benchmarks)
      ? parsed.benchmarks.filter(isRewriteResult).slice(0, MAX_CACHED_BENCHMARKS)
      : [];
    const compareRaw = parsed.compareBySessionId && typeof parsed.compareBySessionId === "object"
      ? parsed.compareBySessionId as Record<string, unknown>
      : {};
    const compareBySessionId: Record<string, ChapterEditorStyleBenchmarkCompareResponse> = {};
    for (const [sessionId, value] of Object.entries(compareRaw)) {
      if (isCompareResult(value)) {
        compareBySessionId[sessionId] = value;
      }
    }
    const layoutColumns = normalizeLayoutColumns(parsed.layoutColumns);
    const activeSessionIds = (Array.isArray(parsed.activeSessionIds) ? parsed.activeSessionIds : [])
      .filter((id): id is string => typeof id === "string" && benchmarks.some((item) => item.sessionId === id))
      .slice(0, layoutColumns);
    const focusedSessionId = typeof parsed.focusedSessionId === "string"
      && benchmarks.some((item) => item.sessionId === parsed.focusedSessionId)
      ? parsed.focusedSessionId
      : (activeSessionIds[0] ?? benchmarks[0]?.sessionId ?? null);

    return {
      version: CACHE_SESSION_VERSION,
      novelId,
      chapterId,
      selectedSourceKey: typeof parsed.selectedSourceKey === "string" ? parsed.selectedSourceKey : "",
      benchmarks,
      compareBySessionId,
      activeSessionIds: activeSessionIds.length > 0
        ? activeSessionIds
        : benchmarks.slice(0, layoutColumns).map((item) => item.sessionId),
      focusedSessionId,
      layoutColumns,
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

async function assertChapterBelongsToNovel(novelId: string, chapterId: string): Promise<void> {
  const chapter = await prisma.chapter.findFirst({
    where: { id: chapterId, novelId },
    select: { id: true },
  });
  if (!chapter) {
    const novel = await prisma.novel.findUnique({
      where: { id: novelId },
      select: { id: true },
    });
    if (!novel) {
      throw new Error("小说不存在。");
    }
    throw new Error("章节不存在。");
  }
}

interface ResolvedReferencePack {
  option: ChapterEditorStyleBenchmarkSourceOption;
  styleContractText: string;
  referenceSamples: string;
}

function clipSample(text: string, maxChars = SAMPLE_EXCERPT_CHARS): string {
  const normalized = normalizeChapterContent(text);
  if (!normalized) {
    return "";
  }
  if (normalized.replace(/\s+/g, "").length <= maxChars) {
    return normalized;
  }
  let count = 0;
  let end = 0;
  for (let i = 0; i < normalized.length; i += 1) {
    if (!/\s/.test(normalized[i]!)) {
      count += 1;
    }
    end = i + 1;
    if (count >= maxChars) {
      break;
    }
  }
  return `${normalized.slice(0, end).trim()}…`;
}

function pickChapterSamples(contents: Array<string | null | undefined>): string {
  const samples = contents
    .map((item) => clipSample(item ?? ""))
    .filter(Boolean)
    .slice(0, MAX_SAMPLE_EXCERPTS);
  return samples.map((sample, index) => `【样章 ${index + 1}】\n${sample}`).join("\n\n");
}

export class ChapterEditorStyleBenchmarkService {
  constructor(
    private readonly workspaceService: ChapterEditorWorkspaceService = new ChapterEditorWorkspaceService(),
    private readonly styleProfileService: StyleProfileService = new StyleProfileService(),
    private readonly styleBindingService: StyleBindingService = new StyleBindingService(),
    private readonly knowledgeService: KnowledgeService = new KnowledgeService(),
    private readonly promptRunner: typeof runStructuredPrompt = runStructuredPrompt,
  ) {}

  async listSources(novelId: string): Promise<ChapterEditorStyleBenchmarkSourcesResponse> {
    const novel = await prisma.novel.findUnique({
      where: { id: novelId },
      select: { id: true },
    });
    if (!novel) {
      throw new Error("小说不存在。");
    }

    const [profiles, documents, novels] = await Promise.all([
      this.styleProfileService.listProfiles(),
      this.knowledgeService.listDocuments({ status: "enabled" }),
      prisma.novel.findMany({
        where: { id: { not: novelId } },
        select: {
          id: true,
          title: true,
          _count: { select: { chapters: true } },
        },
        orderBy: { updatedAt: "desc" },
        take: 80,
      }),
    ]);

    return {
      styleProfiles: profiles.map((profile) => ({
        kind: "style_profile" as const,
        id: profile.id,
        title: profile.name?.trim() || "未命名写法",
        subtitle: profile.description?.trim() || profile.category || null,
        sampleReady: Boolean(
          profile.sourceContent?.trim()
          || profile.analysisMarkdown?.trim()
          || profile.narrativeRules
          || profile.languageRules,
        ),
      })),
      knowledgeDocuments: (documents ?? []).map((document) => ({
        kind: "knowledge_document" as const,
        id: document.id,
        title: document.title?.trim() || document.fileName || "未命名文档",
        subtitle: document.kind ? `知识库 · ${document.kind}` : "知识库文档",
        sampleReady: Boolean(document.activeVersionId),
      })),
      novels: novels.map((item) => ({
        kind: "novel" as const,
        id: item.id,
        title: item.title?.trim() || "未命名小说",
        subtitle: `共 ${item._count.chapters} 章`,
        sampleReady: item._count.chapters > 0,
      })),
    };
  }

  async rewriteChapter(
    novelId: string,
    chapterId: string,
    input: ChapterEditorStyleBenchmarkRewriteRequest,
  ): Promise<ChapterEditorStyleBenchmarkRewriteResponse> {
    const context = await this.workspaceService.loadContext(novelId, chapterId);
    const userContent = normalizeChapterContent(input.content ?? context.chapter.content ?? "");
    if (!userContent.trim()) {
      throw new Error("当前章节正文为空，无法生成范本对照稿。");
    }
    if (countEditorWords(userContent) > FULL_CHAPTER_BENCHMARK_LIMIT) {
      throw new Error(`范本对照当前限制为 ${FULL_CHAPTER_BENCHMARK_LIMIT} 个非空白字符以内，请先精简本章后再试。`);
    }

    const referencePack = await this.resolveReference(novelId, input.reference);
    const provider = input.provider ?? "deepseek";
    const model = input.model?.trim() || null;
    const result = await this.promptRunner({
      asset: chapterEditorStyleBenchmarkRewritePrompt,
      promptInput: {
        novelTitle: context.novel.title?.trim() || "未命名小说",
        chapterTitle: context.chapter.title?.trim() || `第 ${context.chapter.order} 章`,
        userContent,
        referenceTitle: referencePack.option.title,
        styleContractText: referencePack.styleContractText,
        referenceSamples: referencePack.referenceSamples,
        goalSummary: context.chapterPlan?.objective?.trim() || context.chapter.expectation?.trim() || null,
        chapterSummary: context.chapterSummary,
      } satisfies ChapterEditorStyleBenchmarkRewritePromptInput,
      options: {
        provider,
        model: model ?? undefined,
        temperature: input.temperature ?? 0.55,
      },
    });

    const benchmarkContent = normalizeChapterContent(result.output.benchmarkContent);
    if (!benchmarkContent.trim()) {
      throw new Error("AI 未返回可用的范本对照稿，请重试。");
    }

    return {
      sessionId: randomUUID(),
      reference: referencePack.option,
      userContent,
      benchmarkContent,
      styleNotes: result.output.styleNotes.trim(),
      plotFidelityNotes: result.output.plotFidelityNotes.trim(),
      provider,
      model,
    };
  }

  async compareChapter(
    novelId: string,
    chapterId: string,
    input: ChapterEditorStyleBenchmarkCompareRequest,
  ): Promise<ChapterEditorStyleBenchmarkCompareResponse> {
    const context = await this.workspaceService.loadContext(novelId, chapterId);
    const userContent = normalizeChapterContent(input.userContent);
    const benchmarkContent = normalizeChapterContent(input.benchmarkContent);
    if (!userContent.trim() || !benchmarkContent.trim()) {
      throw new Error("对照点评需要同时提供你的正文和范本对照稿。");
    }

    let referenceTitle = "学习范本";
    if (input.reference) {
      try {
        const pack = await this.resolveReference(novelId, input.reference);
        referenceTitle = pack.option.title;
      } catch {
        // Keep default title when reference lookup fails; comparison can still proceed.
      }
    }

    const result = await this.promptRunner({
      asset: chapterEditorStyleBenchmarkComparePrompt,
      promptInput: {
        novelTitle: context.novel.title?.trim() || "未命名小说",
        chapterTitle: context.chapter.title?.trim() || `第 ${context.chapter.order} 章`,
        userContent,
        benchmarkContent,
        referenceTitle,
      } satisfies ChapterEditorStyleBenchmarkComparePromptInput,
      options: {
        provider: input.provider ?? "deepseek",
        model: input.model,
        temperature: input.temperature ?? 0.2,
      },
    });

    const segments = (result.output.segments ?? []).map((segment, index) => ({
      segmentIndex: Number.isFinite(segment.segmentIndex) ? segment.segmentIndex : index,
      beatLabel: segment.beatLabel.trim(),
      userExcerpt: segment.userExcerpt.trim(),
      benchmarkExcerpt: segment.benchmarkExcerpt.trim(),
      winner: segment.winner,
      whyBetter: segment.whyBetter.trim(),
      howToImproveWeaker: segment.howToImproveWeaker.trim(),
    }));

    if (segments.length === 0) {
      throw new Error("AI 未返回可用的分段点评，请重试。");
    }

    return {
      sessionId: randomUUID(),
      summary: result.output.summary.trim(),
      overallWinner: result.output.overallWinner,
      segments,
    };
  }

  async getCache(
    novelId: string,
    chapterId: string,
  ): Promise<ChapterEditorStyleBenchmarkCacheSession | null> {
    await assertChapterBelongsToNovel(novelId, chapterId);
    const row = await prisma.chapterStyleBenchmarkCache.findUnique({
      where: { chapterId },
    });
    if (!row || row.novelId !== novelId) {
      return null;
    }
    return parseCacheSession(novelId, chapterId, row.sessionJson);
  }

  async saveCache(
    novelId: string,
    chapterId: string,
    session: ChapterEditorStyleBenchmarkCacheSession,
  ): Promise<ChapterEditorStyleBenchmarkCacheSession> {
    await assertChapterBelongsToNovel(novelId, chapterId);
    const normalized = parseCacheSession(
      novelId,
      chapterId,
      JSON.stringify({
        ...session,
        novelId,
        chapterId,
        version: CACHE_SESSION_VERSION,
        updatedAt: new Date().toISOString(),
      }),
    );
    if (!normalized) {
      throw new Error("范本对照缓存内容无效，请重试。");
    }

    const sessionJson = JSON.stringify(normalized);
    await prisma.chapterStyleBenchmarkCache.upsert({
      where: { chapterId },
      create: {
        novelId,
        chapterId,
        version: CACHE_SESSION_VERSION,
        selectedSourceKey: normalized.selectedSourceKey || null,
        sessionJson,
      },
      update: {
        novelId,
        version: CACHE_SESSION_VERSION,
        selectedSourceKey: normalized.selectedSourceKey || null,
        sessionJson,
      },
    });
    return normalized;
  }

  async clearCache(novelId: string, chapterId: string): Promise<void> {
    await assertChapterBelongsToNovel(novelId, chapterId);
    await prisma.chapterStyleBenchmarkCache.deleteMany({
      where: { novelId, chapterId },
    });
  }

  private async resolveReference(
    currentNovelId: string,
    reference: ChapterEditorStyleBenchmarkReference,
  ): Promise<ResolvedReferencePack> {
    if (reference.kind === "style_profile") {
      const profile = await this.styleProfileService.getProfileById(reference.id);
      if (!profile) {
        throw new Error("写法档案不存在，请重新选择学习范本。");
      }
      const resolved = await this.styleBindingService.resolveForGeneration({
        novelId: currentNovelId,
        taskStyleProfileId: profile.id,
      });
      const styleContractText = buildWriterStyleContractText(resolved.compiledBlocks?.contract);
      const samples = pickChapterSamples([profile.sourceContent, profile.analysisMarkdown]);
      if (!styleContractText.trim() && !samples.trim()) {
        throw new Error("该写法档案缺少可模仿的风格信息，请换一份或先完成写法提取。");
      }
      return {
        option: {
          kind: "style_profile",
          id: profile.id,
          title: profile.name?.trim() || "未命名写法",
          subtitle: profile.description?.trim() || profile.category || null,
          sampleReady: true,
        },
        styleContractText,
        referenceSamples: samples,
      };
    }

    if (reference.kind === "knowledge_document") {
      const document = await this.knowledgeService.getDocumentById(reference.id);
      if (!document || document.status !== "enabled") {
        throw new Error("知识库文档不存在或未启用，请重新选择学习范本。");
      }
      const activeVersion = document.versions.find((version) => version.isActive)
        ?? document.versions[0]
        ?? null;
      const samples = pickChapterSamples([activeVersion?.content ?? ""]);
      if (!samples.trim()) {
        throw new Error("该知识库文档没有可用正文，请先上传内容或换一份范本。");
      }

      const linkedProfiles = (await this.styleProfileService.listProfiles())
        .filter((profile) => profile.sourceRefId === document.id)
        .slice(0, 1);
      let styleContractText = "";
      if (linkedProfiles[0]) {
        const resolved = await this.styleBindingService.resolveForGeneration({
          novelId: currentNovelId,
          taskStyleProfileId: linkedProfiles[0].id,
        });
        styleContractText = buildWriterStyleContractText(resolved.compiledBlocks?.contract);
      }

      return {
        option: {
          kind: "knowledge_document",
          id: document.id,
          title: document.title?.trim() || document.fileName || "未命名文档",
          subtitle: "知识库文档",
          sampleReady: true,
        },
        styleContractText,
        referenceSamples: samples,
      };
    }

    if (reference.kind === "novel") {
      if (reference.id === currentNovelId) {
        throw new Error("请选择另一本小说作为学习范本，不能选当前正在写的书。");
      }
      const novel = await prisma.novel.findUnique({
        where: { id: reference.id },
        select: {
          id: true,
          title: true,
          chapters: {
            select: { content: true, order: true },
            orderBy: { order: "asc" },
            take: 12,
          },
        },
      });
      if (!novel) {
        throw new Error("范本小说不存在，请重新选择。");
      }
      const withContent = novel.chapters.filter((chapter) => (chapter.content ?? "").trim().length > 0);
      if (withContent.length === 0) {
        throw new Error("该小说还没有可用正文，请换一本已写好的范本。");
      }
      const mid = Math.floor(withContent.length / 2);
      const sampleChapters = [
        withContent[0]?.content,
        withContent[mid]?.content,
        withContent[withContent.length - 1]?.content,
      ];
      const samples = pickChapterSamples(sampleChapters);
      const resolved = await this.styleBindingService.resolveForGeneration({
        novelId: novel.id,
      });
      const styleContractText = buildWriterStyleContractText(resolved.compiledBlocks?.contract);
      if (!styleContractText.trim() && !samples.trim()) {
        throw new Error("该小说缺少可模仿的风格信息，请换一本或先为其提取写法。");
      }
      return {
        option: {
          kind: "novel",
          id: novel.id,
          title: novel.title?.trim() || "未命名小说",
          subtitle: "小说项目",
          sampleReady: true,
        },
        styleContractText,
        referenceSamples: samples,
      };
    }

    throw new Error("不支持的学习范本来源。");
  }
}
