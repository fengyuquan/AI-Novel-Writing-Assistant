import { Router } from "express";
import type { ApiResponse } from "@ai-novel/shared/types/api";
import type {
  LlmPromptLogClearResult,
  LlmPromptLogDetail,
  LlmPromptLogListResult,
  LlmPromptLogSettings,
} from "@ai-novel/shared/types/llmPromptLog";
import { z } from "zod";
import { authMiddleware } from "../../../../middleware/auth";
import { AppError } from "../../../../middleware/errorHandler";
import { validate } from "../../../../middleware/validate";
import {
  LLM_PROMPT_LOG_MAX_RETENTION_COUNT,
  LLM_PROMPT_LOG_MIN_RETENTION_COUNT,
} from "../promptLogConstants";
import { promptLogService } from "../PromptLogService";

const router = Router();

router.use(authMiddleware);

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
  provider: z.string().trim().min(1).optional(),
  promptAssetKey: z.string().trim().min(1).optional(),
  novelId: z.string().trim().min(1).optional(),
  taskId: z.string().trim().min(1).optional(),
  taskType: z.string().trim().min(1).optional(),
  q: z.string().trim().min(1).optional(),
  ids: z.string().trim().min(1).optional(),
});

const settingsBodySchema = z.object({
  enabled: z.boolean().optional(),
  retentionCount: z.number().int()
    .min(LLM_PROMPT_LOG_MIN_RETENTION_COUNT)
    .max(LLM_PROMPT_LOG_MAX_RETENTION_COUNT)
    .optional(),
});

const clearBodySchema = z.object({
  ids: z.array(z.string().trim().min(1)).optional(),
  provider: z.string().trim().min(1).optional(),
  promptAssetKey: z.string().trim().min(1).optional(),
  novelId: z.string().trim().min(1).optional(),
  taskId: z.string().trim().min(1).optional(),
  taskType: z.string().trim().min(1).optional(),
  q: z.string().trim().min(1).optional(),
});

function parseIds(raw: string | undefined): string[] | undefined {
  if (!raw?.trim()) {
    return undefined;
  }
  return raw.split(",").map((item) => item.trim()).filter(Boolean);
}

function toListQuery(input: z.infer<typeof listQuerySchema>) {
  return {
    page: input.page,
    pageSize: input.pageSize,
    provider: input.provider,
    promptAssetKey: input.promptAssetKey,
    novelId: input.novelId,
    taskId: input.taskId,
    taskType: input.taskType,
    q: input.q,
    ids: parseIds(input.ids),
  };
}

router.get("/settings", async (_req, res, next) => {
  try {
    const data = await promptLogService.getSettings();
    const response: ApiResponse<LlmPromptLogSettings> = {
      success: true,
      data,
      message: "提示词记录设置已加载。",
    };
    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
});

router.put("/settings", validate({ body: settingsBodySchema }), async (req, res, next) => {
  try {
    const body = settingsBodySchema.parse(req.body);
    const data = await promptLogService.saveSettings(body);
    const response: ApiResponse<LlmPromptLogSettings> = {
      success: true,
      data,
      message: "提示词记录设置已保存。",
    };
    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
});

router.get("/", validate({ query: listQuerySchema }), async (req, res, next) => {
  try {
    const query = listQuerySchema.parse(req.query);
    const data = await promptLogService.list(toListQuery(query));
    const response: ApiResponse<LlmPromptLogListResult> = {
      success: true,
      data,
      message: "提示词调用记录已加载。",
    };
    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
});

router.get("/export", validate({ query: listQuerySchema }), async (req, res, next) => {
  try {
    const query = listQuerySchema.parse(req.query);
    const records = await promptLogService.exportRecords(toListQuery(query));
    const format = typeof req.query.format === "string" && req.query.format.trim().toLowerCase() === "json"
      ? "json"
      : "jsonl";
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    if (format === "json") {
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="llm-prompt-logs-${stamp}.json"`);
      res.status(200).send(JSON.stringify(records, null, 2));
      return;
    }
    res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="llm-prompt-logs-${stamp}.jsonl"`);
    res.status(200).send(records.map((item) => JSON.stringify(item)).join("\n"));
  } catch (error) {
    next(error);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    const id = String(req.params.id ?? "").trim();
    if (!id) {
      next(new AppError("缺少记录 id。", 400));
      return;
    }
    const data = await promptLogService.getById(id);
    if (!data) {
      next(new AppError("未找到该提示词记录。", 404));
      return;
    }
    const response: ApiResponse<LlmPromptLogDetail> = {
      success: true,
      data,
      message: "提示词记录详情已加载。",
    };
    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
});

router.delete("/", async (req, res, next) => {
  try {
    const body = clearBodySchema.parse(req.body ?? {});
    const data = await promptLogService.clear({
      ids: body.ids,
      provider: body.provider,
      promptAssetKey: body.promptAssetKey,
      novelId: body.novelId,
      taskId: body.taskId,
      taskType: body.taskType,
      q: body.q,
    });
    const response: ApiResponse<LlmPromptLogClearResult> = {
      success: true,
      data,
      message: data.deletedCount > 0 ? `已删除 ${data.deletedCount} 条提示词记录。` : "没有可删除的提示词记录。",
    };
    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
});

export default router;
