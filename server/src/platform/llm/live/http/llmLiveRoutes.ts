import { Router } from "express";
import { z } from "zod";
import type { LlmLiveStreamFrame } from "@ai-novel/shared/types/llmLive";
import { AppError } from "../../../../middleware/errorHandler";
import { validate } from "../../../../middleware/validate";
import { llmLiveBroker } from "../LlmLiveBroker";

const router = Router();

const streamQuerySchema = z.object({
  taskId: z.string().trim().min(1).optional(),
  interactionId: z.string().trim().min(1).optional(),
});

const interactionIdParams = z.object({
  interactionId: z.string().trim().min(1),
});

const cancelBodySchema = z.object({
  message: z.string().trim().max(200).optional(),
}).optional();

function writeFrame(res: import("express").Response, frame: LlmLiveStreamFrame, eventId?: number): void {
  if (res.writableEnded) {
    return;
  }
  if (eventId != null) {
    res.write("id: " + eventId + "\n");
  }
  res.write("event: llm_live\n");
  res.write("data: " + JSON.stringify(frame) + "\n\n");
}

router.get("/stream", validate({ query: streamQuerySchema }), (req, res) => {
  const query = streamQuerySchema.parse(req.query);
  const filter = {
    taskId: query.taskId,
    interactionId: query.interactionId,
  };
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  writeFrame(res, {
    type: "snapshot",
    sessions: llmLiveBroker.getSnapshots(filter),
  });
  const unsubscribe = llmLiveBroker.subscribe(filter, (event) => {
    writeFrame(res, { type: "event", event }, event.seq);
  });
  const heartbeat = setInterval(() => writeFrame(res, { type: "ping" }), 15_000);
  req.on("close", () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
});

router.post(
  "/sessions/:interactionId/cancel",
  validate({ params: interactionIdParams, body: cancelBodySchema }),
  (req, res, next) => {
    try {
      const { interactionId } = req.params as z.infer<typeof interactionIdParams>;
      const body = (req.body ?? {}) as z.infer<typeof cancelBodySchema>;
      const cancelled = llmLiveBroker.requestCancel(interactionId, body?.message);
      if (!cancelled) {
        throw new AppError("当前没有可中断的模型请求，或该请求已经结束。", 409);
      }
      const [snapshot] = llmLiveBroker.getSnapshots({ interactionId });
      res.json({ success: true, data: snapshot ?? { interactionId, phase: "cancelled" } });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/cancel-active",
  validate({
    body: z.object({
      taskId: z.string().trim().min(1).optional(),
      message: z.string().trim().max(200).optional(),
    }).optional(),
  }),
  (req, res, next) => {
    try {
      const body = (req.body ?? {}) as { taskId?: string; message?: string };
      const cancelledIds = llmLiveBroker.requestCancelActive(
        { taskId: body.taskId },
        body.message,
      );
      res.json({
        success: true,
        data: {
          cancelledCount: cancelledIds.length,
          interactionIds: cancelledIds,
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

export default router;
