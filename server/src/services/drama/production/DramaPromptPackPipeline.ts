/**
 * 短剧幻灯片提示词包流水线（项目级）
 *
 * 一键跑完：素材 → 策略 → 大纲 → 台本 → 分镜，停在可导出的镜头提示词包。
 * 不进入视频提示词 / provider / 首帧 / TTS 视听生产链。
 */
import { prisma } from "../../../db/prisma";
import { AppError } from "../../../middleware/errorHandler";
import { dramaEpisodeOutlineService } from "../DramaEpisodeOutlineService";
import { dramaExportService } from "../DramaExportService";
import { dramaProjectService } from "../DramaProjectService";
import { dramaScriptService } from "../DramaScriptService";
import { dramaStoryboardService } from "../DramaStoryboardService";
import { dramaStrategyService } from "../DramaStrategyService";
import type { DramaLLMOptions } from "../DramaStrategyService";
import { safeJsonParse } from "../utils/json";

export const PROMPT_PACK_JOB_TYPE = "prompt_pack" as const;

export type DramaPromptPackStage =
  | "assemble"
  | "strategy"
  | "outline"
  | "script"
  | "storyboard"
  | "export"
  | "done";

export type DramaPromptPackJobStatus = "pending" | "running" | "paused" | "done" | "failed";

export interface DramaPromptPackProgress {
  stage: DramaPromptPackStage;
  totalEpisodes: number;
  doneEpisodes: number;
  skippedEpisodes: number;
  failedEpisodeOrders: number[];
  currentEpisodeOrder?: number;
  errors: Array<{ stage: DramaPromptPackStage; episodeOrder?: number; message: string }>;
  mode: "slideshow";
  exportReady: boolean;
}

const OUTLINE_CHUNK_SIZE = 40;

function normalizeProgress(input: Partial<DramaPromptPackProgress>): DramaPromptPackProgress {
  return {
    stage: input.stage ?? "assemble",
    totalEpisodes: input.totalEpisodes ?? 0,
    doneEpisodes: input.doneEpisodes ?? 0,
    skippedEpisodes: input.skippedEpisodes ?? 0,
    failedEpisodeOrders: input.failedEpisodeOrders ?? [],
    currentEpisodeOrder: input.currentEpisodeOrder,
    errors: input.errors ?? [],
    mode: "slideshow",
    exportReady: input.exportReady ?? false,
  };
}

function readProgress(raw: string | null | undefined): DramaPromptPackProgress {
  return normalizeProgress(safeJsonParse<Partial<DramaPromptPackProgress>>(raw, {}));
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    const cleaned = error.message
      .replace(/^\[STRUCTURED_OUTPUT:[a-z_]+\]\s*/i, "")
      .trim();
    return cleaned || error.message.trim();
  }
  return "未知错误";
}

export class DramaPromptPackPipeline {
  private readonly runningJobs = new Set<string>();

  async createPromptPackJob(
    projectId: string,
    options: DramaLLMOptions & { autoStart?: boolean } = {},
  ) {
    const project = await prisma.dramaProject.findUnique({
      where: { id: projectId },
      select: { id: true, track: true, targetEpisodes: true },
    });
    if (!project) {
      throw new AppError(`未找到短剧项目：${projectId}`, 404);
    }
    if (!project.track?.trim()) {
      throw new AppError("请先为项目设置赛道，再一键生成切图提示词包。", 400);
    }

    const existingRunning = await prisma.dramaBatchJob.findFirst({
      where: {
        projectId,
        type: PROMPT_PACK_JOB_TYPE,
        status: { in: ["pending", "running"] },
      },
      orderBy: { createdAt: "desc" },
    });
    if (existingRunning) {
      throw new AppError("已有切图提示词包任务在运行，请稍后再试或刷新查看进度。", 409);
    }

    const progress = normalizeProgress({
      stage: "assemble",
      totalEpisodes: project.targetEpisodes,
      doneEpisodes: 0,
      skippedEpisodes: 0,
      failedEpisodeOrders: [],
      errors: [],
      exportReady: false,
    });

    const job = await prisma.dramaBatchJob.create({
      data: {
        projectId,
        episodeId: null,
        type: PROMPT_PACK_JOB_TYPE,
        status: "pending",
        progress: JSON.stringify(progress),
      },
    });

    if (options.autoStart ?? true) {
      void this.runPromptPackJob(job.id, options).catch(() => undefined);
    }
    return job;
  }

  async getLatestPromptPackJob(projectId: string) {
    return prisma.dramaBatchJob.findFirst({
      where: { projectId, type: PROMPT_PACK_JOB_TYPE },
      orderBy: { createdAt: "desc" },
    });
  }

  async retryFailedPromptPackJob(
    projectId: string,
    options: DramaLLMOptions & { autoStart?: boolean } = {},
  ) {
    const latest = await this.getLatestPromptPackJob(projectId);
    if (!latest) {
      throw new AppError("还没有切图提示词包任务可重试。", 404);
    }
    const progress = readProgress(latest.progress);
    if (!progress.failedEpisodeOrders.length) {
      throw new AppError("最近一次任务没有失败集，无需重试。", 400);
    }
    if (latest.status === "pending" || latest.status === "running") {
      throw new AppError("切图提示词包任务仍在运行，请稍后再试。", 409);
    }

    const retryProgress = normalizeProgress({
      stage: "script",
      totalEpisodes: progress.totalEpisodes,
      doneEpisodes: 0,
      skippedEpisodes: 0,
      failedEpisodeOrders: [...progress.failedEpisodeOrders],
      errors: [],
      exportReady: false,
    });

    const job = await prisma.dramaBatchJob.create({
      data: {
        projectId,
        episodeId: null,
        type: PROMPT_PACK_JOB_TYPE,
        status: "pending",
        progress: JSON.stringify(retryProgress),
      },
    });

    if (options.autoStart ?? true) {
      void this.runPromptPackJob(job.id, {
        ...options,
        retryEpisodeOrders: progress.failedEpisodeOrders,
      }).catch(() => undefined);
    }
    return job;
  }

  async runPromptPackJob(
    jobId: string,
    options: DramaLLMOptions & { retryEpisodeOrders?: number[] } = {},
  ) {
    if (this.runningJobs.has(jobId)) {
      return prisma.dramaBatchJob.findUnique({ where: { id: jobId } });
    }
    this.runningJobs.add(jobId);

    try {
      const job = await prisma.dramaBatchJob.findUnique({ where: { id: jobId } });
      if (!job || job.type !== PROMPT_PACK_JOB_TYPE) {
        throw new AppError(`未找到切图提示词包任务：${jobId}`, 404);
      }

      let progress = readProgress(job.progress);
      await this.patchJob(jobId, { status: "running", progress });

      const projectId = job.projectId;
      const llmOptions: DramaLLMOptions = {
        provider: options.provider,
        model: options.model,
        temperature: options.temperature,
      };
      const retryOnly = options.retryEpisodeOrders?.length
        ? new Set(options.retryEpisodeOrders)
        : null;

      if (!retryOnly) {
        progress = await this.runAssembleStage(projectId, jobId, progress);
        progress = await this.runStrategyStage(projectId, jobId, progress, llmOptions);
        progress = await this.runOutlineStage(projectId, jobId, progress, llmOptions);
      }

      progress = await this.runScriptAndStoryboardStages(
        projectId,
        jobId,
        progress,
        llmOptions,
        retryOnly,
      );

      progress = await this.runExportReadyStage(projectId, jobId, progress);

      const hasUsableStoryboards = await this.countEpisodesWithStoryboard(projectId) > 0;
      const finalStatus: DramaPromptPackJobStatus = hasUsableStoryboards ? "done" : "failed";

      if (!hasUsableStoryboards) {
        progress = normalizeProgress({
          ...progress,
          stage: "done",
          exportReady: false,
          errors: [
            ...progress.errors,
            { stage: "export", message: "没有可用分镜，无法导出切图提示词包。" },
          ],
        });
      } else {
        progress = normalizeProgress({
          ...progress,
          stage: "done",
          exportReady: true,
        });
      }

      return this.patchJob(jobId, { status: finalStatus, progress });
    } catch (error) {
      const existing = await prisma.dramaBatchJob.findUnique({ where: { id: jobId } });
      const progress = normalizeProgress({
        ...readProgress(existing?.progress),
        errors: [
          ...readProgress(existing?.progress).errors,
          { stage: readProgress(existing?.progress).stage, message: errorMessage(error) },
        ],
        exportReady: false,
      });
      await this.patchJob(jobId, { status: "failed", progress });
      throw error;
    } finally {
      this.runningJobs.delete(jobId);
    }
  }

  private async runAssembleStage(
    projectId: string,
    jobId: string,
    progress: DramaPromptPackProgress,
  ): Promise<DramaPromptPackProgress> {
    let next = normalizeProgress({ ...progress, stage: "assemble", currentEpisodeOrder: undefined });
    await this.patchJob(jobId, { progress: next });

    const project = await prisma.dramaProject.findUnique({
      where: { id: projectId },
      include: { sourceBundle: true },
    });
    if (!project) {
      throw new AppError(`未找到短剧项目：${projectId}`, 404);
    }
    if (project.sourceBundle) {
      return next;
    }
    try {
      await dramaProjectService.assembleSourceBundle(projectId);
    } catch (error) {
      next = normalizeProgress({
        ...next,
        errors: [...next.errors, { stage: "assemble", message: errorMessage(error) }],
      });
      await this.patchJob(jobId, { progress: next });
      throw error;
    }
    return next;
  }

  private async runStrategyStage(
    projectId: string,
    jobId: string,
    progress: DramaPromptPackProgress,
    llmOptions: DramaLLMOptions,
  ): Promise<DramaPromptPackProgress> {
    let next = normalizeProgress({ ...progress, stage: "strategy" });
    await this.patchJob(jobId, { progress: next });

    const project = await prisma.dramaProject.findUnique({
      where: { id: projectId },
      select: { strategy: true },
    });
    if (project?.strategy?.trim()) {
      return next;
    }
    try {
      await dramaStrategyService.generateStrategy(projectId, llmOptions);
    } catch (error) {
      next = normalizeProgress({
        ...next,
        errors: [...next.errors, { stage: "strategy", message: errorMessage(error) }],
      });
      await this.patchJob(jobId, { progress: next });
      throw error;
    }
    return next;
  }

  private async runOutlineStage(
    projectId: string,
    jobId: string,
    progress: DramaPromptPackProgress,
    llmOptions: DramaLLMOptions,
  ): Promise<DramaPromptPackProgress> {
    let next = normalizeProgress({ ...progress, stage: "outline" });
    await this.patchJob(jobId, { progress: next });

    const project = await prisma.dramaProject.findUnique({
      where: { id: projectId },
      include: { episodes: { select: { order: true } } },
    });
    if (!project) {
      throw new AppError(`未找到短剧项目：${projectId}`, 404);
    }

    const existingOrders = new Set(project.episodes.map((episode) => episode.order));
    const missingOrders: number[] = [];
    for (let order = 1; order <= project.targetEpisodes; order += 1) {
      if (!existingOrders.has(order)) {
        missingOrders.push(order);
      }
    }
    if (!missingOrders.length) {
      return next;
    }

    try {
      let cursor = 0;
      while (cursor < missingOrders.length) {
        const startOrder = missingOrders[cursor]!;
        // 连续缺口尽量按块生成；遇到已有集跳过已在 missingOrders 中排除
        let endIndex = cursor;
        while (
          endIndex + 1 < missingOrders.length
          && missingOrders[endIndex + 1] === missingOrders[endIndex]! + 1
          && missingOrders[endIndex + 1]! - startOrder + 1 < OUTLINE_CHUNK_SIZE
        ) {
          endIndex += 1;
        }
        const count = missingOrders[endIndex]! - startOrder + 1;
        await dramaEpisodeOutlineService.generateOutline(
          projectId,
          { startOrder, count },
          llmOptions,
        );
        cursor = endIndex + 1;
        next = normalizeProgress({
          ...next,
          currentEpisodeOrder: missingOrders[Math.min(endIndex, missingOrders.length - 1)],
        });
        await this.patchJob(jobId, { progress: next });
      }
    } catch (error) {
      next = normalizeProgress({
        ...next,
        errors: [...next.errors, { stage: "outline", message: errorMessage(error) }],
      });
      await this.patchJob(jobId, { progress: next });
      throw error;
    }
    return next;
  }

  private async runScriptAndStoryboardStages(
    projectId: string,
    jobId: string,
    progress: DramaPromptPackProgress,
    llmOptions: DramaLLMOptions,
    retryOnly: Set<number> | null,
  ): Promise<DramaPromptPackProgress> {
    const episodes = await prisma.dramaEpisode.findMany({
      where: { projectId },
      orderBy: { order: "asc" },
      include: {
        storyboards: { select: { id: true }, take: 1 },
      },
    });

    const targets = retryOnly
      ? episodes.filter((episode) => retryOnly.has(episode.order))
      : episodes;

    let next = normalizeProgress({
      ...progress,
      stage: "script",
      totalEpisodes: targets.length || progress.totalEpisodes,
      doneEpisodes: 0,
      skippedEpisodes: 0,
      failedEpisodeOrders: [],
    });
    await this.patchJob(jobId, { progress: next });

    for (const episode of targets) {
      next = normalizeProgress({
        ...next,
        stage: "script",
        currentEpisodeOrder: episode.order,
      });
      await this.patchJob(jobId, { progress: next });

      try {
        const hadScript = Boolean(episode.content?.trim());
        const hadStoryboard = episode.storyboards.length > 0;

        if (!hadScript) {
          await dramaScriptService.generateEpisodeScript(projectId, episode.order, llmOptions);
        }

        next = normalizeProgress({
          ...next,
          stage: "storyboard",
          currentEpisodeOrder: episode.order,
        });
        await this.patchJob(jobId, { progress: next });

        const refreshed = await prisma.dramaEpisode.findUnique({
          where: { id: episode.id },
          include: { storyboards: { select: { id: true }, take: 1 } },
        });
        if (!refreshed?.content?.trim()) {
          throw new Error(`第 ${episode.order} 集台本仍为空，无法生成分镜。`);
        }
        if (!refreshed.storyboards.length) {
          await dramaStoryboardService.generateStoryboard(projectId, episode.order, llmOptions);
        }

        next = normalizeProgress({
          ...next,
          doneEpisodes: next.doneEpisodes + 1,
          skippedEpisodes: hadScript && hadStoryboard
            ? next.skippedEpisodes + 1
            : next.skippedEpisodes,
        });
        await this.patchJob(jobId, { progress: next });
      } catch (error) {
        next = normalizeProgress({
          ...next,
          failedEpisodeOrders: [...new Set([...next.failedEpisodeOrders, episode.order])],
          errors: [
            ...next.errors,
            {
              stage: next.stage,
              episodeOrder: episode.order,
              message: errorMessage(error),
            },
          ],
        });
        await this.patchJob(jobId, { progress: next });
      }
    }

    return next;
  }

  private async runExportReadyStage(
    projectId: string,
    jobId: string,
    progress: DramaPromptPackProgress,
  ): Promise<DramaPromptPackProgress> {
    let next = normalizeProgress({ ...progress, stage: "export", currentEpisodeOrder: undefined });
    await this.patchJob(jobId, { progress: next });

    // 触发生成校验：确保导出服务能读到最新分镜
    try {
      await dramaExportService.exportProject(projectId, "prompt-pack");
      next = normalizeProgress({ ...next, exportReady: true });
    } catch (error) {
      next = normalizeProgress({
        ...next,
        exportReady: false,
        errors: [...next.errors, { stage: "export", message: errorMessage(error) }],
      });
    }
    await this.patchJob(jobId, { progress: next });
    return next;
  }

  private async countEpisodesWithStoryboard(projectId: string): Promise<number> {
    return prisma.dramaEpisode.count({
      where: {
        projectId,
        storyboards: { some: {} },
      },
    });
  }

  private async patchJob(
    jobId: string,
    input: { status?: DramaPromptPackJobStatus; progress: DramaPromptPackProgress },
  ) {
    return prisma.dramaBatchJob.update({
      where: { id: jobId },
      data: {
        ...(input.status ? { status: input.status } : {}),
        progress: JSON.stringify(normalizeProgress(input.progress)),
      },
    });
  }
}

export const dramaPromptPackPipeline = new DramaPromptPackPipeline();
