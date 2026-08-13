import { Router } from "express";
import type { ApiResponse } from "@ai-novel/shared/types/api";
import { z } from "zod";
import { validate } from "../../../middleware/validate";
import {
  dramaPromptPackPipeline,
} from "../../../services/drama/production/DramaPromptPackPipeline";

const router = Router();

const idParamsSchema = z.object({ id: z.string().trim().min(1) });

const pipelineBodySchema = z
  .object({
    provider: z.string().optional(),
    model: z.string().optional(),
    temperature: z.number().min(0).max(2).optional(),
  })
  .optional();

router.post(
  "/projects/:id/pipelines/prompt-pack",
  validate({ params: idParamsSchema, body: pipelineBodySchema }),
  async (req, res, next) => {
    try {
      const { id } = req.params as z.infer<typeof idParamsSchema>;
      const body = (req.body ?? {}) as z.infer<typeof pipelineBodySchema>;
      const data = await dramaPromptPackPipeline.createPromptPackJob(id, body ?? {});
      res.status(201).json({
        success: true,
        data,
        message: "切图提示词包流水线已启动。",
      } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  "/projects/:id/pipelines/prompt-pack/latest",
  validate({ params: idParamsSchema }),
  async (req, res, next) => {
    try {
      const { id } = req.params as z.infer<typeof idParamsSchema>;
      const data = await dramaPromptPackPipeline.getLatestPromptPackJob(id);
      res.status(200).json({
        success: true,
        data,
        message: data ? "已加载最近一次切图提示词包任务。" : "还没有切图提示词包任务。",
      } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/projects/:id/pipelines/prompt-pack/retry-failed",
  validate({ params: idParamsSchema, body: pipelineBodySchema }),
  async (req, res, next) => {
    try {
      const { id } = req.params as z.infer<typeof idParamsSchema>;
      const body = (req.body ?? {}) as z.infer<typeof pipelineBodySchema>;
      const data = await dramaPromptPackPipeline.retryFailedPromptPackJob(id, body ?? {});
      res.status(201).json({
        success: true,
        data,
        message: "已开始重试失败集的切图提示词包生成。",
      } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  },
);

export default router;
