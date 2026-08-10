import { Router, type NextFunction, type Request, type Response } from "express";
import type { ApiResponse } from "@ai-novel/shared/types/api";
import { AppError } from "../../../middleware/errorHandler";
import {
  createAdminRecord,
  deleteAdminRecord,
  getAdminRecord,
  listAdminRecords,
  updateAdminRecord,
} from "../application/adminCrudService";
import { executeAdminBatch, previewAdminBatch } from "../application/adminBatchService";
import { getDeletePreview } from "../application/adminDeletePreviewService";
import { getNovelDrilldownOverview } from "../application/adminDrilldownService";
import { getAdminMetaPayload } from "../application/adminMetaService";
import { createAdminDatabaseBackup } from "../application/adminBackupService";
import { searchNovelChapters } from "../application/adminChapterSearchService";
import { exportNovelSlice } from "../application/adminNovelExportService";
import {
  executeNovelImport,
  previewNovelImport,
} from "../application/adminNovelImportService";
import {
  getNovelWorkspace,
  getWorkspaceChapterDetail,
} from "../application/adminNovelWorkspaceService";
import { getAdminToken, isAdminEnabled, isValidAdminToken } from "../domain/adminPolicy";
import { listAdminAudit } from "../infrastructure/adminAuditStore";

const adminRouter = Router();

function assertAdminEnabled(): void {
  if (!isAdminEnabled()) {
    throw new AppError("管理后台未启用：请在服务端配置 ADMIN_TOKEN。", 403);
  }
}

function extractBearerToken(req: Request): string | null {
  const header = req.header("authorization") ?? req.header("Authorization");
  if (!header) {
    return null;
  }
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1]?.trim() || null;
}

function isWriteUnlocked(req: Request): boolean {
  const header = req.header("x-admin-write-unlock") ?? req.header("X-Admin-Write-Unlock");
  if (header === "1" || header === "true") {
    return true;
  }
  const body = req.body as { writeUnlocked?: unknown } | undefined;
  return body?.writeUnlocked === true || body?.writeUnlocked === "true" || body?.writeUnlocked === 1;
}

function stripWriteMeta(body: Record<string, unknown>): Record<string, unknown> {
  const next = { ...body };
  delete next.writeUnlocked;
  delete next.confirm;
  delete next.typedConfirm;
  return next;
}

function requireAdminAuth(req: Request, _res: Response, next: NextFunction): void {
  try {
    assertAdminEnabled();
    const token = extractBearerToken(req) ?? (typeof req.query.token === "string" ? req.query.token : null);
    if (!isValidAdminToken(token)) {
      throw new AppError("未授权：请提供有效的 ADMIN_TOKEN。", 401);
    }
    next();
  } catch (error) {
    next(error);
  }
}

function asyncHandler(
  handler: (req: Request, res: Response) => Promise<void>,
): (req: Request, res: Response, next: NextFunction) => void {
  return (req, res, next) => {
    void handler(req, res).catch(next);
  };
}

adminRouter.get(
  "/status",
  asyncHandler(async (_req, res) => {
    const response: ApiResponse<{ enabled: boolean }> = {
      success: true,
      data: { enabled: isAdminEnabled() },
    };
    res.json(response);
  }),
);

adminRouter.post(
  "/login",
  asyncHandler(async (req, res) => {
    assertAdminEnabled();
    const token = typeof req.body?.token === "string" ? req.body.token.trim() : "";
    if (!isValidAdminToken(token)) {
      throw new AppError("口令不正确。", 401);
    }
    const response: ApiResponse<{ token: string; enabled: boolean }> = {
      success: true,
      data: {
        token: getAdminToken() as string,
        enabled: true,
      },
      message: "登录成功。",
    };
    res.json(response);
  }),
);

adminRouter.get(
  "/meta",
  requireAdminAuth,
  asyncHandler(async (_req, res) => {
    const response: ApiResponse<ReturnType<typeof getAdminMetaPayload>> = {
      success: true,
      data: getAdminMetaPayload(),
    };
    res.json(response);
  }),
);

adminRouter.get(
  "/novels/:novelId/overview",
  requireAdminAuth,
  asyncHandler(async (req, res) => {
    const data = await getNovelDrilldownOverview(String(req.params.novelId));
    const response: ApiResponse<typeof data> = { success: true, data };
    res.json(response);
  }),
);

adminRouter.get(
  "/novels/:novelId/workspace",
  requireAdminAuth,
  asyncHandler(async (req, res) => {
    const data = await getNovelWorkspace(String(req.params.novelId));
    const response: ApiResponse<typeof data> = { success: true, data };
    res.json(response);
  }),
);

adminRouter.get(
  "/novels/:novelId/chapters/search",
  requireAdminAuth,
  asyncHandler(async (req, res) => {
    const q = typeof req.query.q === "string" ? req.query.q : "";
    const data = await searchNovelChapters(String(req.params.novelId), q);
    const response: ApiResponse<typeof data> = { success: true, data };
    res.json(response);
  }),
);

adminRouter.get(
  "/novels/:novelId/chapters/:chapterId",
  requireAdminAuth,
  asyncHandler(async (req, res) => {
    const data = await getWorkspaceChapterDetail(String(req.params.novelId), String(req.params.chapterId));
    const response: ApiResponse<typeof data> = { success: true, data };
    res.json(response);
  }),
);

adminRouter.post(
  "/backup",
  requireAdminAuth,
  asyncHandler(async (_req, res) => {
    const data = await createAdminDatabaseBackup();
    const response: ApiResponse<typeof data> = {
      success: true,
      data,
      message: data.message,
    };
    res.json(response);
  }),
);

adminRouter.get(
  "/novels/:novelId/export",
  requireAdminAuth,
  asyncHandler(async (req, res) => {
    const data = await exportNovelSlice(String(req.params.novelId));
    const response: ApiResponse<typeof data> = { success: true, data };
    res.json(response);
  }),
);

adminRouter.post(
  "/novels/:novelId/import/preview",
  requireAdminAuth,
  asyncHandler(async (req, res) => {
    const data = await previewNovelImport(String(req.params.novelId), req.body?.slice ?? req.body, {
      writeUnlocked: isWriteUnlocked(req),
    });
    const response: ApiResponse<typeof data> = { success: true, data };
    res.json(response);
  }),
);

adminRouter.post(
  "/novels/:novelId/import/execute",
  requireAdminAuth,
  asyncHandler(async (req, res) => {
    const body = (req.body ?? {}) as { slice?: unknown; typedConfirm?: string };
    const data = await executeNovelImport(String(req.params.novelId), body.slice ?? body, {
      typedConfirm: typeof body.typedConfirm === "string" ? body.typedConfirm : undefined,
      writeUnlocked: isWriteUnlocked(req),
    });
    const response: ApiResponse<typeof data> = { success: true, data, message: "导入完成。" };
    res.json(response);
  }),
);

adminRouter.get(
  "/models/:model",
  requireAdminAuth,
  asyncHandler(async (req, res) => {
    const model = String(req.params.model);
    let where: Record<string, unknown> | undefined;
    if (typeof req.query.where === "string" && req.query.where.trim()) {
      try {
        where = JSON.parse(req.query.where) as Record<string, unknown>;
      } catch {
        throw new AppError("where 必须是合法 JSON。", 400);
      }
    }
    const data = await listAdminRecords(model, {
      page: req.query.page ? Number(req.query.page) : undefined,
      pageSize: req.query.pageSize ? Number(req.query.pageSize) : undefined,
      q: typeof req.query.q === "string" ? req.query.q : undefined,
      orderBy: typeof req.query.orderBy === "string" ? req.query.orderBy : undefined,
      orderDir: req.query.orderDir === "desc" ? "desc" : "asc",
      where,
    });
    const response: ApiResponse<typeof data> = { success: true, data };
    res.json(response);
  }),
);

adminRouter.get(
  "/models/:model/:id/delete-preview",
  requireAdminAuth,
  asyncHandler(async (req, res) => {
    const data = await getDeletePreview(String(req.params.model), String(req.params.id));
    const response: ApiResponse<typeof data> = { success: true, data };
    res.json(response);
  }),
);

adminRouter.get(
  "/audit",
  requireAdminAuth,
  asyncHandler(async (req, res) => {
    const data = listAdminAudit({
      limit: req.query.limit ? Number(req.query.limit) : 100,
      model: typeof req.query.model === "string" ? req.query.model : undefined,
      novelId: typeof req.query.novelId === "string" ? req.query.novelId : undefined,
    });
    const response: ApiResponse<{ items: typeof data }> = { success: true, data: { items: data } };
    res.json(response);
  }),
);

adminRouter.post(
  "/batch/preview",
  requireAdminAuth,
  asyncHandler(async (req, res) => {
    const body = (req.body ?? {}) as {
      model?: string;
      action?: "update_status" | "delete_matching";
      where?: Record<string, unknown>;
      setStatus?: string;
      maxRows?: number;
    };
    const data = await previewAdminBatch({
      model: String(body.model ?? ""),
      action: body.action as "update_status" | "delete_matching",
      where: body.where,
      setStatus: body.setStatus,
      maxRows: body.maxRows,
    });
    const response: ApiResponse<typeof data> = { success: true, data };
    res.json(response);
  }),
);

adminRouter.post(
  "/batch/execute",
  requireAdminAuth,
  asyncHandler(async (req, res) => {
    const body = (req.body ?? {}) as {
      model?: string;
      action?: "update_status" | "delete_matching";
      where?: Record<string, unknown>;
      setStatus?: string;
      maxRows?: number;
      confirm?: boolean;
      typedConfirm?: string;
    };
    const data = await executeAdminBatch({
      model: String(body.model ?? ""),
      action: body.action as "update_status" | "delete_matching",
      where: body.where,
      setStatus: body.setStatus,
      maxRows: body.maxRows,
      confirm: Boolean(body.confirm),
      typedConfirm: body.typedConfirm,
    });
    const response: ApiResponse<typeof data> = {
      success: true,
      data,
      message: `已影响 ${data.affectedCount} 条记录。`,
    };
    res.json(response);
  }),
);

adminRouter.get(
  "/models/:model/:id",
  requireAdminAuth,
  asyncHandler(async (req, res) => {
    const data = await getAdminRecord(String(req.params.model), String(req.params.id));
    const response: ApiResponse<typeof data> = { success: true, data };
    res.json(response);
  }),
);

adminRouter.post(
  "/models/:model",
  requireAdminAuth,
  asyncHandler(async (req, res) => {
    const body = stripWriteMeta((req.body ?? {}) as Record<string, unknown>);
    const data = await createAdminRecord(String(req.params.model), body, {
      writeUnlocked: isWriteUnlocked(req),
    });
    const response: ApiResponse<typeof data> = { success: true, data, message: "已创建。" };
    res.status(201).json(response);
  }),
);

adminRouter.patch(
  "/models/:model/:id",
  requireAdminAuth,
  asyncHandler(async (req, res) => {
    const body = stripWriteMeta((req.body ?? {}) as Record<string, unknown>);
    const data = await updateAdminRecord(String(req.params.model), String(req.params.id), body, {
      writeUnlocked: isWriteUnlocked(req),
    });
    const response: ApiResponse<typeof data> = { success: true, data, message: "已更新。" };
    res.json(response);
  }),
);

adminRouter.delete(
  "/models/:model/:id",
  requireAdminAuth,
  asyncHandler(async (req, res) => {
    const confirm =
      req.query.confirm === "true" ||
      req.query.confirm === "1" ||
      req.body?.confirm === true ||
      req.body?.confirm === "true";
    const typedConfirm =
      typeof req.body?.typedConfirm === "string"
        ? req.body.typedConfirm
        : typeof req.query.typedConfirm === "string"
          ? req.query.typedConfirm
          : undefined;
    const data = await deleteAdminRecord(String(req.params.model), String(req.params.id), {
      confirm: Boolean(confirm),
      typedConfirm,
      writeUnlocked: isWriteUnlocked(req),
    });
    const response: ApiResponse<typeof data> = { success: true, data, message: "已删除。" };
    res.json(response);
  }),
);

export default adminRouter;
