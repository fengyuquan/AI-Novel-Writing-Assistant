import fs from "node:fs";
import path from "node:path";
import { resolveDatabaseRuntimeConfig } from "../../../config/database";
import { AppError } from "../../../middleware/errorHandler";
import { resolveDataRoot, resolveDatabaseFilePath } from "../../../runtime/appPaths";
import { appendAdminAudit } from "../infrastructure/adminAuditStore";

export interface AdminBackupResult {
  provider: "sqlite" | "postgresql";
  supported: boolean;
  backupPath: string | null;
  sizeBytes: number | null;
  createdAt: string;
  message: string;
}

function resolveSqliteFilePath(databaseUrl: string): string {
  const raw = databaseUrl.replace(/^file:/i, "");
  return resolveDatabaseFilePath(raw);
}

export async function createAdminDatabaseBackup(): Promise<AdminBackupResult> {
  const runtime = resolveDatabaseRuntimeConfig({ allowDefault: true });
  const createdAt = new Date().toISOString();

  if (runtime.provider !== "sqlite") {
    return {
      provider: "postgresql",
      supported: false,
      backupPath: null,
      sizeBytes: null,
      createdAt,
      message: "当前为 PostgreSQL。请在停写窗口使用 pg_dump 自行备份；本控制台不代执行 dump。",
    };
  }

  const sourcePath = resolveSqliteFilePath(runtime.url);
  if (!fs.existsSync(sourcePath)) {
    throw new AppError(`找不到 SQLite 文件：${sourcePath}`, 404);
  }

  const stamp = createdAt.replace(/[:.]/g, "-");
  const backupDir = path.join(resolveDataRoot(), "backups");
  fs.mkdirSync(backupDir, { recursive: true });
  const backupPath = path.join(backupDir, `dev-${stamp}.db`);

  // Also copy -wal/-shm if present for a more consistent snapshot under WAL mode.
  fs.copyFileSync(sourcePath, backupPath);
  for (const suffix of ["-wal", "-shm"] as const) {
    const side = `${sourcePath}${suffix}`;
    if (fs.existsSync(side)) {
      fs.copyFileSync(side, `${backupPath}${suffix}`);
    }
  }

  const stat = fs.statSync(backupPath);
  if (!stat.isFile() || stat.size <= 0) {
    throw new AppError("备份文件校验失败：文件为空或不存在。", 500);
  }

  appendAdminAudit({
    action: "create",
    model: "DatabaseBackup",
    recordId: path.basename(backupPath),
    novelId: null,
    summary: `创建 SQLite 备份 ${path.basename(backupPath)}（${stat.size} bytes）`,
    changedFields: ["backupPath"],
  });

  return {
    provider: "sqlite",
    supported: true,
    backupPath,
    sizeBytes: stat.size,
    createdAt,
    message: `已备份到 ${backupPath}（${stat.size} bytes）。改数前请确认该文件可打开。`,
  };
}
