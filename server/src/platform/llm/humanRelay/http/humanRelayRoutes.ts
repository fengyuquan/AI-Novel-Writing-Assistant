import { Router } from "express";
import type { ApiResponse } from "@ai-novel/shared/types/api";
import type {
  LlmHumanRelayActionResult,
  LlmHumanRelayPendingList,
  LlmHumanRelaySettings,
} from "@ai-novel/shared/types/llmHumanRelay";
import { z } from "zod";
import { authMiddleware } from "../../../../middleware/auth";
import { AppError } from "../../../../middleware/errorHandler";
import { validate } from "../../../../middleware/validate";
import { LLM_HUMAN_RELAY_MAX_RESPONSE_CHARS } from "../humanRelayConstants";
import { humanRelayService, type LlmHumanRelayEvent } from "../HumanRelayService";

const router = Router();

router.use(authMiddleware);

const settingsBodySchema = z.object({
  enabled: z.boolean().optional(),
});

const resolveBodySchema = z.object({
  responseText: z.string().min(1).max(LLM_HUMAN_RELAY_MAX_RESPONSE_CHARS),
});

type RelayStreamFrame =
  | { type: "snapshot"; pending: LlmHumanRelayPendingList }
  | { type: "event"; event: LlmHumanRelayEvent }
  | { type: "ping" };

function writeFrame(res: import("express").Response, frame: RelayStreamFrame): void {
  if (res.writableEnded) {
    return;
  }
  res.write("event: llm_human_relay\n");
  res.write(`data: ${JSON.stringify(frame)}\n\n`);
}

router.get("/settings", async (_req, res, next) => {
  try {
    const data = await humanRelayService.getSettings();
    const response: ApiResponse<LlmHumanRelaySettings> = {
      success: true,
      data,
      message: "人工中继设置已加载。",
    };
    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
});

router.put("/settings", validate({ body: settingsBodySchema }), async (req, res, next) => {
  try {
    const body = settingsBodySchema.parse(req.body);
    const data = await humanRelayService.saveSettings(body);
    const response: ApiResponse<LlmHumanRelaySettings> = {
      success: true,
      data,
      message: data.enabled ? "人工中继已开启。" : "人工中继已关闭。",
    };
    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
});

router.get("/pending", async (_req, res, next) => {
  try {
    const data = await humanRelayService.listPendingWithSettings();
    const response: ApiResponse<LlmHumanRelayPendingList> = {
      success: true,
      data,
      message: "待处理人工中继请求已加载。",
    };
    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
});

router.get("/stream", async (req, res, next) => {
  try {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    writeFrame(res, {
      type: "snapshot",
      pending: await humanRelayService.listPendingWithSettings(),
    });

    const unsubscribe = humanRelayService.subscribe((event) => {
      writeFrame(res, { type: "event", event });
    });
    const heartbeat = setInterval(() => writeFrame(res, { type: "ping" }), 15_000);
    req.on("close", () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  } catch (error) {
    next(error);
  }
});

router.post("/:id/resolve", validate({ body: resolveBodySchema }), async (req, res, next) => {
  try {
    const id = String(req.params.id ?? "").trim();
    if (!id) {
      next(new AppError("缺少请求 id。", 400));
      return;
    }
    const body = resolveBodySchema.parse(req.body);
    const data = humanRelayService.resolve(id, body.responseText);
    const response: ApiResponse<LlmHumanRelayActionResult> = {
      success: true,
      data,
      message: "已提交外部返回结果，系统将继续处理。",
    };
    res.status(200).json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : "提交失败。";
    next(new AppError(message, 400));
  }
});

router.post("/:id/cancel", async (req, res, next) => {
  try {
    const id = String(req.params.id ?? "").trim();
    if (!id) {
      next(new AppError("缺少请求 id。", 400));
      return;
    }
    const data = humanRelayService.cancel(id, "你已取消本次人工中继");
    const response: ApiResponse<LlmHumanRelayActionResult> = {
      success: true,
      data,
      message: "已取消本次人工中继。",
    };
    res.status(200).json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : "取消失败。";
    next(new AppError(message, 400));
  }
});

export default router;
