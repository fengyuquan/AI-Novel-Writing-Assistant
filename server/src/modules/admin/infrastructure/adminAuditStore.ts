import fs from "node:fs";
import path from "node:path";
import { resolveDataRoot } from "../../../runtime/appPaths";

export type AdminAuditAction = "create" | "update" | "delete";

export interface AdminAuditEntry {
  id: string;
  at: string;
  action: AdminAuditAction;
  model: string;
  recordId: string;
  novelId: string | null;
  summary: string;
  changedFields: string[];
}

const MAX_ENTRIES = 2000;

function resolveAuditFilePath(): string {
  return path.join(resolveDataRoot(), "admin-audit.jsonl");
}

function ensureParentDir(filePath: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function createId(): string {
  return `aud_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function appendAdminAudit(input: Omit<AdminAuditEntry, "id" | "at">): AdminAuditEntry {
  const entry: AdminAuditEntry = {
    id: createId(),
    at: new Date().toISOString(),
    ...input,
  };
  const filePath = resolveAuditFilePath();
  ensureParentDir(filePath);
  fs.appendFileSync(filePath, `${JSON.stringify(entry)}\n`, "utf8");
  return entry;
}

export function listAdminAudit(options?: {
  limit?: number;
  model?: string;
  novelId?: string;
}): AdminAuditEntry[] {
  const filePath = resolveAuditFilePath();
  if (!fs.existsSync(filePath)) {
    return [];
  }
  const limit = Math.min(500, Math.max(1, options?.limit ?? 100));
  const lines = fs.readFileSync(filePath, "utf8").split("\n").filter(Boolean);
  const recent = lines.slice(-MAX_ENTRIES);
  const entries: AdminAuditEntry[] = [];
  for (let index = recent.length - 1; index >= 0 && entries.length < limit; index -= 1) {
    try {
      const parsed = JSON.parse(recent[index]!) as AdminAuditEntry;
      if (options?.model && parsed.model !== options.model) continue;
      if (options?.novelId && parsed.novelId !== options.novelId) continue;
      entries.push(parsed);
    } catch {
      // skip broken lines
    }
  }
  return entries;
}
