const TOKEN_KEY = "ai-novel-admin-token";
const WRITE_UNLOCK_KEY = "ai-novel-admin-write-unlock";

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface AdminFieldMeta {
  name: string;
  kind: "scalar" | "enum" | "object";
  type: string;
  isPrimaryKey: boolean;
  isForeignKey: boolean;
  isList: boolean;
  isRelation: boolean;
  relationTo: string | null;
  isSensitive: boolean;
  isWritable: boolean;
  isJsonLike: boolean;
}

export interface AdminModelMeta {
  name: string;
  clientKey: string;
  primaryKey: string;
  fields: AdminFieldMeta[];
  pinned: boolean;
  readOnlyDefault: boolean;
}

export interface AdminMetaPayload {
  databaseProvider: string;
  modelCount: number;
  pinnedModels: string[];
  models: AdminModelMeta[];
  backupHint: string;
}

export interface AdminListResult {
  model: string;
  primaryKey: string;
  page: number;
  pageSize: number;
  total: number;
  items: Record<string, unknown>[];
}

export interface AdminRecordResult {
  model: string;
  primaryKey: string;
  item: Record<string, unknown>;
}

export interface NovelChildModelSummary {
  model: string;
  foreignKey: string;
  count: number;
  pinned: boolean;
}

export interface NovelDrilldownOverview {
  novel: {
    id: string;
    title: string;
    status: string | null;
    updatedAt: string | null;
  };
  children: NovelChildModelSummary[];
  childModelCount: number;
  totalRelatedRows: number;
}

export interface DeleteImpactRow {
  model: string;
  foreignKey: string;
  count: number;
}

export interface DeletePreview {
  model: string;
  id: string;
  label: string;
  riskLevel: "low" | "medium" | "high";
  requireTypedConfirm: boolean;
  typedConfirmText: string;
  impacts: DeleteImpactRow[];
  totalRelatedRows: number;
  warning: string;
}

export interface AdminAuditEntry {
  id: string;
  at: string;
  action: "create" | "update" | "delete";
  model: string;
  recordId: string;
  novelId: string | null;
  summary: string;
  changedFields: string[];
}

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setStoredToken(token: string | null): void {
  if (!token) {
    localStorage.removeItem(TOKEN_KEY);
    return;
  }
  localStorage.setItem(TOKEN_KEY, token);
}

export function getWriteUnlocked(): boolean {
  return sessionStorage.getItem(WRITE_UNLOCK_KEY) === "1";
}

export function setWriteUnlocked(unlocked: boolean): void {
  if (unlocked) {
    sessionStorage.setItem(WRITE_UNLOCK_KEY, "1");
  } else {
    sessionStorage.removeItem(WRITE_UNLOCK_KEY);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (!headers.has("Content-Type") && init?.body) {
    headers.set("Content-Type", "application/json");
  }
  const token = getStoredToken();
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  if (getWriteUnlocked()) {
    headers.set("X-Admin-Write-Unlock", "true");
  }
  const response = await fetch(path, { ...init, headers });
  const payload = (await response.json().catch(() => null)) as ApiResponse<T> | null;
  if (!response.ok || !payload?.success) {
    throw new Error(payload?.error || `请求失败（${response.status}）`);
  }
  return payload.data as T;
}

export function fetchAdminStatus() {
  return request<{ enabled: boolean }>("/api/admin/status");
}

export function loginAdmin(token: string) {
  return request<{ token: string; enabled: boolean }>("/api/admin/login", {
    method: "POST",
    body: JSON.stringify({ token }),
  });
}

export function fetchAdminMeta() {
  return request<AdminMetaPayload>("/api/admin/meta");
}

export function fetchAdminList(
  model: string,
  params: {
    page?: number;
    pageSize?: number;
    q?: string;
    orderBy?: string;
    orderDir?: "asc" | "desc";
    where?: Record<string, unknown>;
  },
) {
  const search = new URLSearchParams();
  if (params.page) search.set("page", String(params.page));
  if (params.pageSize) search.set("pageSize", String(params.pageSize));
  if (params.q) search.set("q", params.q);
  if (params.orderBy) search.set("orderBy", params.orderBy);
  if (params.orderDir) search.set("orderDir", params.orderDir);
  if (params.where) search.set("where", JSON.stringify(params.where));
  const query = search.toString();
  return request<AdminListResult>(`/api/admin/models/${encodeURIComponent(model)}${query ? `?${query}` : ""}`);
}

export function fetchNovelOverview(novelId: string) {
  return request<NovelDrilldownOverview>(`/api/admin/novels/${encodeURIComponent(novelId)}/overview`);
}

export interface WorkspaceChapterItem {
  id: string;
  order: number;
  title: string;
  generationState: string;
  chapterStatus: string | null;
  hasContent: boolean;
  qualityScore: number | null;
  updatedAt: string | null;
}

export interface WorkspaceCharacterCard {
  id: string;
  name: string;
  role: string;
  castRole: string | null;
  gender: string;
  identityLabel: string | null;
  factionLabel: string | null;
  personality: string | null;
  firstImpression: string | null;
  appearance: string | null;
  signatureDetail: string | null;
  currentState: string | null;
  currentGoal: string | null;
  relationToProtagonist: string | null;
}

export interface WorkspaceTaskItem {
  kind: "workflow" | "generation";
  id: string;
  title: string;
  status: string;
  progress: number;
  currentStage: string | null;
  currentItemLabel: string | null;
  checkpointType: string | null;
  checkpointSummary: string | null;
  error: string | null;
  pendingManualRecovery: boolean;
  startedAt: string | null;
  finishedAt: string | null;
  updatedAt: string | null;
  createdAt: string | null;
}

export interface WorkspacePipelineSummary {
  runningCount: number;
  failedOrRecoveryCount: number;
  queuedCount: number;
  latestRunning: WorkspaceTaskItem[];
  attention: WorkspaceTaskItem[];
}

export interface WorkspaceVolumeItem {
  id: string;
  sortOrder: number;
  title: string;
  summary: string | null;
  status: string;
}

export interface NovelWorkspacePayload {
  novel: {
    id: string;
    title: string;
    description: string | null;
    status: string | null;
    projectStatus: string | null;
    outlineStatus: string | null;
    storylineStatus: string | null;
    estimatedChapterCount: number | null;
    defaultChapterLength: number | null;
    outlinePreview: string | null;
    outline: string | null;
    structuredOutlinePreview: string | null;
    updatedAt: string | null;
  };
  chapters: WorkspaceChapterItem[];
  characters: WorkspaceCharacterCard[];
  tasks: WorkspaceTaskItem[];
  pipeline: WorkspacePipelineSummary;
  volumes: WorkspaceVolumeItem[];
  bible: {
    id: string;
    coreSetting: string | null;
    mainPromise: string | null;
    characterArcs: string | null;
    worldRules: string | null;
  } | null;
  structuredOutline: string | null;
  counts: {
    chapters: number;
    characters: number;
    workflowTasks: number;
    generationJobs: number;
    volumes: number;
    childModelCount: number;
    totalRelatedRows: number;
  };
  children: NovelChildModelSummary[];
}

export interface WorkspaceChapterDetail {
  id: string;
  novelId: string;
  order: number;
  title: string;
  content: string;
  generationState: string;
  chapterStatus: string | null;
  targetWordCount: number | null;
  wordCount: number;
  qualityScore: number | null;
  continuityScore: number | null;
  characterScore: number | null;
  pacingScore: number | null;
  hook: string | null;
  expectation: string | null;
  mustAvoid: string | null;
  updatedAt: string | null;
  createdAt: string | null;
}

export function fetchNovelWorkspace(novelId: string) {
  return request<NovelWorkspacePayload>(`/api/admin/novels/${encodeURIComponent(novelId)}/workspace`);
}

export function fetchWorkspaceChapter(novelId: string, chapterId: string) {
  return request<WorkspaceChapterDetail>(
    `/api/admin/novels/${encodeURIComponent(novelId)}/chapters/${encodeURIComponent(chapterId)}`,
  );
}

export function exportNovelSlice(novelId: string) {
  return request<{
    exportedAt: string;
    novelId: string;
    novel: Record<string, unknown>;
    models: Record<string, { count: number; truncated: boolean; items: Record<string, unknown>[] }>;
  }>(`/api/admin/novels/${encodeURIComponent(novelId)}/export`);
}

export interface ImportModelPlan {
  model: string;
  create: number;
  update: number;
  skipConflict: number;
  skipReadonly: number;
  skipInvalid: number;
  truncatedInSlice: boolean;
  sampleCreateIds: string[];
  sampleUpdateIds: string[];
  sampleConflictIds: string[];
}

export interface ImportFieldDiff {
  field: string;
  before: string | null;
  after: string | null;
}

export interface ImportDiffSummary {
  novelFields: ImportFieldDiff[];
  chapterCount: { before: number; after: number };
  characterCount: { before: number; after: number };
  conflictIds: string[];
}

export interface ImportPreview {
  targetNovelId: string;
  sourceNovelId: string | null;
  exportedAt: string | null;
  updateNovel: boolean;
  models: ImportModelPlan[];
  totals: {
    create: number;
    update: number;
    skipConflict: number;
    skipReadonly: number;
    skipInvalid: number;
    rows: number;
  };
  diff: ImportDiffSummary;
  requireTypedConfirm: boolean;
  typedConfirmText: string;
  warning: string;
}

export interface ImportExecuteResult extends ImportPreview {
  applied: {
    create: number;
    update: number;
    novelUpdated: boolean;
    errors: Array<{ model: string; id: string; message: string }>;
  };
}

export function previewNovelImport(novelId: string, slice: unknown) {
  return request<ImportPreview>(`/api/admin/novels/${encodeURIComponent(novelId)}/import/preview`, {
    method: "POST",
    body: JSON.stringify({ slice }),
  });
}

export function executeNovelImport(novelId: string, slice: unknown, typedConfirm?: string) {
  return request<ImportExecuteResult>(`/api/admin/novels/${encodeURIComponent(novelId)}/import/execute`, {
    method: "POST",
    body: JSON.stringify({ slice, typedConfirm }),
  });
}

export interface AdminBackupResult {
  provider: "sqlite" | "postgresql";
  supported: boolean;
  backupPath: string | null;
  sizeBytes: number | null;
  createdAt: string;
  message: string;
}

export function createAdminBackup() {
  return request<AdminBackupResult>("/api/admin/backup", { method: "POST" });
}

export interface ChapterSearchHit {
  id: string;
  order: number;
  title: string;
  match: "title" | "content" | "both";
  snippet: string | null;
}

export function searchNovelChapters(novelId: string, q: string) {
  const search = new URLSearchParams({ q });
  return request<{ novelId: string; q: string; total: number; items: ChapterSearchHit[] }>(
    `/api/admin/novels/${encodeURIComponent(novelId)}/chapters/search?${search.toString()}`,
  );
}

export function fetchAdminRecord(model: string, id: string) {
  return request<AdminRecordResult>(`/api/admin/models/${encodeURIComponent(model)}/${encodeURIComponent(id)}`);
}

export function fetchDeletePreview(model: string, id: string) {
  return request<DeletePreview>(
    `/api/admin/models/${encodeURIComponent(model)}/${encodeURIComponent(id)}/delete-preview`,
  );
}

export function fetchAdminAudit(params?: { limit?: number; model?: string; novelId?: string }) {
  const search = new URLSearchParams();
  if (params?.limit) search.set("limit", String(params.limit));
  if (params?.model) search.set("model", params.model);
  if (params?.novelId) search.set("novelId", params.novelId);
  const query = search.toString();
  return request<{ items: AdminAuditEntry[] }>(`/api/admin/audit${query ? `?${query}` : ""}`);
}

export function createAdminRecord(model: string, body: Record<string, unknown>) {
  return request<AdminRecordResult>(`/api/admin/models/${encodeURIComponent(model)}`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function updateAdminRecord(model: string, id: string, body: Record<string, unknown>) {
  return request<AdminRecordResult>(`/api/admin/models/${encodeURIComponent(model)}/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export function deleteAdminRecord(model: string, id: string, options?: { typedConfirm?: string }) {
  return request<AdminRecordResult>(`/api/admin/models/${encodeURIComponent(model)}/${encodeURIComponent(id)}`, {
    method: "DELETE",
    body: JSON.stringify({
      confirm: true,
      typedConfirm: options?.typedConfirm,
    }),
  });
}

export type BatchAction = "update_status" | "delete_matching";

export interface BatchPreview {
  model: string;
  action: BatchAction;
  matchedCount: number;
  cappedCount: number;
  maxRows: number;
  requireTypedConfirm: boolean;
  typedConfirmText: string;
  sampleIds: string[];
  setStatus: string | null;
  warning: string;
  affectedCount?: number;
}

export function previewAdminBatch(body: {
  model: string;
  action: BatchAction;
  where: Record<string, unknown>;
  setStatus?: string;
  maxRows?: number;
}) {
  return request<BatchPreview>("/api/admin/batch/preview", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function executeAdminBatch(body: {
  model: string;
  action: BatchAction;
  where: Record<string, unknown>;
  setStatus?: string;
  maxRows?: number;
  typedConfirm?: string;
}) {
  return request<BatchPreview>("/api/admin/batch/execute", {
    method: "POST",
    body: JSON.stringify({ ...body, confirm: true }),
  });
}
