import type { Router } from "express";
import type { ApiResponse } from "@ai-novel/shared/types/api";
import { z } from "zod";
import { AppError } from "../../../../middleware/errorHandler";
import { validate } from "../../../../middleware/validate";
import type { NovelApplicationServices } from "../../../../services/novel/application/NovelApplicationContracts";

interface RegisterNovelChapterEditorRoutesInput {
  router: Router;
  novelService: Pick<NovelApplicationServices,
    | "getChapterEditorWorkspace"
    | "previewChapterAiRevision"
    | "previewChapterRewrite"
    | "detectChapterAiWriting"
    | "listChapterStyleBenchmarkSources"
    | "rewriteChapterStyleBenchmark"
    | "compareChapterStyleBenchmark"
    | "getChapterStyleBenchmarkCache"
    | "saveChapterStyleBenchmarkCache"
    | "clearChapterStyleBenchmarkCache"
  >;
  chapterParamsSchema: z.ZodType<{ id: string; chapterId: string }>;
  rewritePreviewSchema: z.ZodTypeAny;
  aiRevisionPreviewSchema: z.ZodTypeAny;
  aiWritingDetectSchema: z.ZodTypeAny;
  styleBenchmarkRewriteSchema: z.ZodTypeAny;
  styleBenchmarkCompareSchema: z.ZodTypeAny;
  styleBenchmarkCacheSaveSchema: z.ZodTypeAny;
  forwardBusinessError: (error: unknown, next: (err?: unknown) => void) => boolean;
}

const STYLE_BENCHMARK_BAD_REQUESTS = [
  "小说不存在。",
  "章节不存在。",
  "当前章节正文为空，无法生成范本对照稿。",
  "对照点评需要同时提供你的正文和范本对照稿。",
  "写法档案不存在，请重新选择学习范本。",
  "该写法档案缺少可模仿的风格信息，请换一份或先完成写法提取。",
  "知识库文档不存在或未启用，请重新选择学习范本。",
  "该知识库文档没有可用正文，请先上传内容或换一份范本。",
  "请选择另一本小说作为学习范本，不能选当前正在写的书。",
  "范本小说不存在，请重新选择。",
  "该小说还没有可用正文，请换一本已写好的范本。",
  "该小说缺少可模仿的风格信息，请换一本或先为其提取写法。",
  "不支持的学习范本来源。",
  "AI 未返回可用的范本对照稿，请重试。",
  "AI 未返回可用的分段点评，请重试。",
  "范本对照缓存内容无效，请重试。",
];

export function registerNovelChapterEditorRoutes(input: RegisterNovelChapterEditorRoutesInput): void {
  const {
    router,
    novelService,
    chapterParamsSchema,
    rewritePreviewSchema,
    aiRevisionPreviewSchema,
    aiWritingDetectSchema,
    styleBenchmarkRewriteSchema,
    styleBenchmarkCompareSchema,
    styleBenchmarkCacheSaveSchema,
    forwardBusinessError,
  } = input;

  router.get(
    "/:id/chapters/:chapterId/editor/workspace",
    validate({ params: chapterParamsSchema }),
    async (req, res, next) => {
      try {
        const { id, chapterId } = req.params as z.infer<typeof chapterParamsSchema>;
        const data = await novelService.getChapterEditorWorkspace(id, chapterId);
        res.status(200).json({
          success: true,
          data,
          message: "Chapter editor workspace loaded.",
        } satisfies ApiResponse<typeof data>);
      } catch (error) {
        if (forwardBusinessError(error, next)) {
          return;
        }
        if (error instanceof Error && ["小说不存在。", "章节不存在。"].includes(error.message)) {
          next(new AppError(error.message, 400));
          return;
        }
        next(error);
      }
    },
  );

  router.get(
    "/:id/chapters/:chapterId/editor/style-benchmark/sources",
    validate({ params: chapterParamsSchema }),
    async (req, res, next) => {
      try {
        const { id } = req.params as z.infer<typeof chapterParamsSchema>;
        const data = await novelService.listChapterStyleBenchmarkSources(id);
        res.status(200).json({
          success: true,
          data,
          message: "Chapter style benchmark sources loaded.",
        } satisfies ApiResponse<typeof data>);
      } catch (error) {
        if (forwardBusinessError(error, next)) {
          return;
        }
        if (error instanceof Error && error.message === "小说不存在。") {
          next(new AppError(error.message, 400));
          return;
        }
        next(error);
      }
    },
  );

  router.get(
    "/:id/chapters/:chapterId/editor/style-benchmark/cache",
    validate({ params: chapterParamsSchema }),
    async (req, res, next) => {
      try {
        const { id, chapterId } = req.params as z.infer<typeof chapterParamsSchema>;
        const data = await novelService.getChapterStyleBenchmarkCache(id, chapterId);
        res.status(200).json({
          success: true,
          data,
          message: "Chapter style benchmark cache loaded.",
        } satisfies ApiResponse<typeof data>);
      } catch (error) {
        if (forwardBusinessError(error, next)) {
          return;
        }
        if (error instanceof Error && ["小说不存在。", "章节不存在。"].includes(error.message)) {
          next(new AppError(error.message, 400));
          return;
        }
        next(error);
      }
    },
  );

  router.put(
    "/:id/chapters/:chapterId/editor/style-benchmark/cache",
    validate({ params: chapterParamsSchema, body: styleBenchmarkCacheSaveSchema }),
    async (req, res, next) => {
      try {
        const { id, chapterId } = req.params as z.infer<typeof chapterParamsSchema>;
        const body = req.body as { session: any };
        const data = await novelService.saveChapterStyleBenchmarkCache(id, chapterId, body.session);
        res.status(200).json({
          success: true,
          data,
          message: "Chapter style benchmark cache saved.",
        } satisfies ApiResponse<typeof data>);
      } catch (error) {
        if (forwardBusinessError(error, next)) {
          return;
        }
        if (error instanceof Error && STYLE_BENCHMARK_BAD_REQUESTS.includes(error.message)) {
          next(new AppError(error.message, 400));
          return;
        }
        next(error);
      }
    },
  );

  router.delete(
    "/:id/chapters/:chapterId/editor/style-benchmark/cache",
    validate({ params: chapterParamsSchema }),
    async (req, res, next) => {
      try {
        const { id, chapterId } = req.params as z.infer<typeof chapterParamsSchema>;
        await novelService.clearChapterStyleBenchmarkCache(id, chapterId);
        res.status(200).json({
          success: true,
          data: { cleared: true },
          message: "Chapter style benchmark cache cleared.",
        } satisfies ApiResponse<{ cleared: boolean }>);
      } catch (error) {
        if (forwardBusinessError(error, next)) {
          return;
        }
        if (error instanceof Error && ["小说不存在。", "章节不存在。"].includes(error.message)) {
          next(new AppError(error.message, 400));
          return;
        }
        next(error);
      }
    },
  );

  router.post(
    "/:id/chapters/:chapterId/editor/style-benchmark/rewrite",
    validate({ params: chapterParamsSchema, body: styleBenchmarkRewriteSchema }),
    async (req, res, next) => {
      try {
        const { id, chapterId } = req.params as z.infer<typeof chapterParamsSchema>;
        const data = await novelService.rewriteChapterStyleBenchmark(id, chapterId, req.body as any);
        res.status(200).json({
          success: true,
          data,
          message: "Chapter style benchmark rewrite generated.",
        } satisfies ApiResponse<typeof data>);
      } catch (error) {
        if (forwardBusinessError(error, next)) {
          return;
        }
        if (
          error instanceof Error
          && (
            STYLE_BENCHMARK_BAD_REQUESTS.includes(error.message)
            || error.message.includes("范本对照当前限制为")
          )
        ) {
          next(new AppError(error.message, 400));
          return;
        }
        next(error);
      }
    },
  );

  router.post(
    "/:id/chapters/:chapterId/editor/style-benchmark/compare",
    validate({ params: chapterParamsSchema, body: styleBenchmarkCompareSchema }),
    async (req, res, next) => {
      try {
        const { id, chapterId } = req.params as z.infer<typeof chapterParamsSchema>;
        const data = await novelService.compareChapterStyleBenchmark(id, chapterId, req.body as any);
        res.status(200).json({
          success: true,
          data,
          message: "Chapter style benchmark comparison completed.",
        } satisfies ApiResponse<typeof data>);
      } catch (error) {
        if (forwardBusinessError(error, next)) {
          return;
        }
        if (error instanceof Error && STYLE_BENCHMARK_BAD_REQUESTS.includes(error.message)) {
          next(new AppError(error.message, 400));
          return;
        }
        next(error);
      }
    },
  );

  router.post(
    "/:id/chapters/:chapterId/editor/ai-writing-detect",
    validate({ params: chapterParamsSchema, body: aiWritingDetectSchema }),
    async (req, res, next) => {
      try {
        const { id, chapterId } = req.params as z.infer<typeof chapterParamsSchema>;
        const data = await novelService.detectChapterAiWriting(id, chapterId, req.body as any);
        res.status(200).json({
          success: true,
          data,
          message: "Chapter AI writing detection completed.",
        } satisfies ApiResponse<typeof data>);
      } catch (error) {
        if (forwardBusinessError(error, next)) {
          return;
        }
        if (
          error instanceof Error
          && [
            "小说不存在。",
            "章节不存在。",
            "当前章节正文为空，无法检测 AI 写法。",
          ].includes(error.message)
        ) {
          next(new AppError(error.message, 400));
          return;
        }
        next(error);
      }
    },
  );

  router.post(
    "/:id/chapters/:chapterId/editor/ai-revision-preview",
    validate({ params: chapterParamsSchema, body: aiRevisionPreviewSchema }),
    async (req, res, next) => {
      try {
        const { id, chapterId } = req.params as z.infer<typeof chapterParamsSchema>;
        const data = await novelService.previewChapterAiRevision(id, chapterId, req.body as any);
        res.status(200).json({
          success: true,
          data,
          message: "Chapter editor AI revision preview generated.",
        } satisfies ApiResponse<typeof data>);
      } catch (error) {
        if (forwardBusinessError(error, next)) {
          return;
        }
        if (
          error instanceof Error
          && [
            "小说不存在。",
            "章节不存在。",
            "当前章节正文为空，无法发起 AI 修正。",
            "片段修正需要先选中正文内容。",
            "选区范围无效，请重新选择后再试。",
            "选中文本不能为空。",
            "选中文本已发生变化，请重新选择后再试。",
            "请先写下你希望 AI 如何修改。",
            "AI 未返回足够的候选版本，请重试。",
          ].includes(error.message)
            || (error instanceof Error && error.message.includes("整章修正当前限制为"))
        ) {
          next(new AppError(error.message, 400));
          return;
        }
        next(error);
      }
    },
  );

  router.post(
    "/:id/chapters/:chapterId/editor/rewrite-preview",
    validate({ params: chapterParamsSchema, body: rewritePreviewSchema }),
    async (req, res, next) => {
      try {
        const { id, chapterId } = req.params as z.infer<typeof chapterParamsSchema>;
        const data = await novelService.previewChapterRewrite(id, chapterId, req.body as any);
        res.status(200).json({
          success: true,
          data,
          message: "Chapter editor rewrite preview generated.",
        } satisfies ApiResponse<typeof data>);
      } catch (error) {
        if (forwardBusinessError(error, next)) {
          return;
        }
        if (
          error instanceof Error
          && [
            "小说不存在。",
            "章节不存在。",
            "当前章节正文为空，无法发起局部改写。",
            "选区范围无效，请重新选择后再试。",
            "选中文本不能为空。",
            "选中文本已发生变化，请重新选择后再试。",
            "AI 未返回足够的候选版本，请重试。",
          ].includes(error.message)
        ) {
          next(new AppError(error.message, 400));
          return;
        }
        next(error);
      }
    },
  );
}
