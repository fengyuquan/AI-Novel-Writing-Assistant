import { Router } from "express";
import { createReadStream } from "fs";
import { z } from "zod";
import type { ApiResponse } from "@ai-novel/shared/types/api";
import { validate } from "../../../../middleware/validate";
import {
  applyImageGenerationSelection,
  getImageSelectionInfo,
  readPendingCandidateFile,
} from "..";

const router = Router();

const selectionParams = z.object({
  selectionId: z.string().trim().min(1),
});

const candidateParams = selectionParams.extend({
  index: z.coerce.number().int().min(0).max(32),
});

const applyBodySchema = z.object({
  index: z.number().int().min(0).max(32),
});

router.get(
  "/selections/:selectionId",
  validate({ params: selectionParams }),
  async (req, res, next) => {
    try {
      const { selectionId } = req.params as z.infer<typeof selectionParams>;
      const data = await getImageSelectionInfo(selectionId);
      res.json({ success: true, data } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  "/selections/:selectionId/candidates/:index",
  validate({ params: candidateParams }),
  async (req, res, next) => {
    try {
      const { selectionId, index } = req.params as unknown as z.infer<typeof candidateParams>;
      const file = await readPendingCandidateFile(selectionId, Number(index));
      res.setHeader("Content-Type", file.mimeType);
      res.setHeader("Cache-Control", "private, max-age=86400");
      createReadStream(file.filePath).pipe(res);
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/selections/:selectionId/apply",
  validate({ params: selectionParams, body: applyBodySchema }),
  async (req, res, next) => {
    try {
      const { selectionId } = req.params as z.infer<typeof selectionParams>;
      const body = req.body as z.infer<typeof applyBodySchema>;
      const data = await applyImageGenerationSelection(selectionId, body.index);
      res.json({ success: true, data } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  },
);

export default router;
