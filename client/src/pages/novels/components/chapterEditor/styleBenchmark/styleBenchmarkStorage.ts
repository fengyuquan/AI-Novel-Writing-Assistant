import type {
  ChapterEditorStyleBenchmarkCacheSession,
  ChapterEditorStyleBenchmarkCompareResponse,
  ChapterEditorStyleBenchmarkLayoutColumns,
  ChapterEditorStyleBenchmarkRewriteResponse,
} from "@ai-novel/shared/types/novel";

const PREFIX = "chapter-editor-style-benchmark:";
const PREFS_KEY = `${PREFIX}prefs`;
const CACHE_VERSION = 3;
export const MAX_CACHED_BENCHMARKS = 12;
export const MAX_VISIBLE_BENCHMARK_COLUMNS = 4;

export type StyleBenchmarkLayoutColumns = ChapterEditorStyleBenchmarkLayoutColumns;
export type StyleBenchmarkCacheSession = ChapterEditorStyleBenchmarkCacheSession;

export interface StyleBenchmarkPrefs {
  layoutColumns: StyleBenchmarkLayoutColumns;
}

function storageKey(novelId: string, chapterId: string): string {
  return `${PREFIX}${novelId}:${chapterId}`;
}

function isRewriteResult(value: unknown): value is ChapterEditorStyleBenchmarkRewriteResponse {
  if (!value || typeof value !== "object") {
    return false;
  }
  const record = value as Record<string, unknown>;
  return typeof record.benchmarkContent === "string"
    && typeof record.userContent === "string"
    && typeof record.sessionId === "string"
    && Boolean(record.reference && typeof record.reference === "object");
}

function normalizeModelLabel(provider?: string | null, model?: string | null): string {
  const providerPart = provider?.trim() || "unknown";
  const modelPart = model?.trim() || "default";
  return `${providerPart}/${modelPart}`;
}

/** 同一范文 + 同一模型才视为同一版本；换模型会保留为另一篇缓存。 */
export function benchmarkVersionKey(result: Pick<
  ChapterEditorStyleBenchmarkRewriteResponse,
  "reference" | "provider" | "model"
>): string {
  return `${result.reference.kind}:${result.reference.id}::${normalizeModelLabel(result.provider, result.model)}`;
}

export function formatBenchmarkModelLabel(
  result: Pick<ChapterEditorStyleBenchmarkRewriteResponse, "provider" | "model">,
): string {
  if (result.model?.trim()) {
    return result.model.trim();
  }
  if (result.provider?.trim()) {
    return `${result.provider.trim()} 默认模型`;
  }
  return "未知模型";
}

function isCompareResult(value: unknown): value is ChapterEditorStyleBenchmarkCompareResponse {
  if (!value || typeof value !== "object") {
    return false;
  }
  const record = value as Record<string, unknown>;
  return typeof record.summary === "string"
    && typeof record.sessionId === "string"
    && Array.isArray(record.segments);
}

function normalizeLayoutColumns(value: unknown): StyleBenchmarkLayoutColumns {
  const numeric = typeof value === "number" ? value : Number(value);
  if (numeric === 2 || numeric === 3 || numeric === 4) {
    return numeric;
  }
  return 1;
}

export function upsertBenchmarkList(
  current: ChapterEditorStyleBenchmarkRewriteResponse[],
  next: ChapterEditorStyleBenchmarkRewriteResponse,
): ChapterEditorStyleBenchmarkRewriteResponse[] {
  const nextKey = benchmarkVersionKey(next);
  const withoutSameVersion = current.filter((item) => benchmarkVersionKey(item) !== nextKey);
  return [next, ...withoutSameVersion].slice(0, MAX_CACHED_BENCHMARKS);
}

export function loadStyleBenchmarkPrefs(): StyleBenchmarkPrefs {
  if (typeof window === "undefined") {
    return { layoutColumns: 1 };
  }
  try {
    const raw = window.localStorage.getItem(PREFS_KEY);
    if (!raw) {
      return { layoutColumns: 1 };
    }
    const parsed = JSON.parse(raw) as Partial<StyleBenchmarkPrefs>;
    return { layoutColumns: normalizeLayoutColumns(parsed.layoutColumns) };
  } catch {
    return { layoutColumns: 1 };
  }
}

export function saveStyleBenchmarkPrefs(prefs: StyleBenchmarkPrefs): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(PREFS_KEY, JSON.stringify({
      layoutColumns: normalizeLayoutColumns(prefs.layoutColumns),
    } satisfies StyleBenchmarkPrefs));
  } catch {
    // ignore
  }
}

function migrateLegacySession(
  parsed: Record<string, unknown>,
  novelId: string,
  chapterId: string,
): StyleBenchmarkCacheSession | null {
  const rewriteResult = isRewriteResult(parsed.rewriteResult) ? parsed.rewriteResult : null;
  const compareResult = isCompareResult(parsed.compareResult) ? parsed.compareResult : null;
  if (!rewriteResult && !compareResult) {
    return null;
  }
  const benchmarks = rewriteResult ? [rewriteResult] : [];
  const compareBySessionId: Record<string, ChapterEditorStyleBenchmarkCompareResponse> = {};
  if (rewriteResult && compareResult) {
    compareBySessionId[rewriteResult.sessionId] = compareResult;
  }
  const prefs = loadStyleBenchmarkPrefs();
  return {
    version: CACHE_VERSION,
    novelId,
    chapterId,
    selectedSourceKey: typeof parsed.selectedSourceKey === "string" ? parsed.selectedSourceKey : "",
    benchmarks,
    compareBySessionId,
    essenceByReferenceKey: {},
    activeSessionIds: benchmarks.slice(0, prefs.layoutColumns).map((item) => item.sessionId),
    focusedSessionId: benchmarks[0]?.sessionId ?? null,
    layoutColumns: prefs.layoutColumns,
    updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : new Date().toISOString(),
  };
}

export function loadStyleBenchmarkSession(
  novelId: string,
  chapterId: string,
): StyleBenchmarkCacheSession | null {
  if (!novelId || !chapterId || typeof window === "undefined") {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(storageKey(novelId, chapterId));
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (parsed.novelId !== novelId || parsed.chapterId !== chapterId) {
      return null;
    }

    if (typeof parsed.version !== "number" || parsed.version < 2) {
      return migrateLegacySession(parsed, novelId, chapterId);
    }

    const benchmarks = Array.isArray(parsed.benchmarks)
      ? parsed.benchmarks.filter(isRewriteResult).slice(0, MAX_CACHED_BENCHMARKS)
      : [];
    const compareRaw = parsed.compareBySessionId && typeof parsed.compareBySessionId === "object"
      ? parsed.compareBySessionId as Record<string, unknown>
      : {};
    const compareBySessionId: Record<string, ChapterEditorStyleBenchmarkCompareResponse> = {};
    for (const [sessionId, value] of Object.entries(compareRaw)) {
      if (isCompareResult(value)) {
        compareBySessionId[sessionId] = value;
      }
    }
    const essenceRaw = parsed.essenceByReferenceKey && typeof parsed.essenceByReferenceKey === "object"
      ? parsed.essenceByReferenceKey as Record<string, unknown>
      : {};
    const essenceByReferenceKey: NonNullable<StyleBenchmarkCacheSession["essenceByReferenceKey"]> = {};
    for (const [key, value] of Object.entries(essenceRaw)) {
      if (value && typeof value === "object" && Array.isArray((value as { fingerprintLines?: unknown }).fingerprintLines)) {
        essenceByReferenceKey[key] = value as NonNullable<StyleBenchmarkCacheSession["essenceByReferenceKey"]>[string];
      }
    }
    const layoutColumns = normalizeLayoutColumns(parsed.layoutColumns ?? loadStyleBenchmarkPrefs().layoutColumns);
    const activeSessionIds = (Array.isArray(parsed.activeSessionIds) ? parsed.activeSessionIds : [])
      .filter((id): id is string => typeof id === "string" && benchmarks.some((item) => item.sessionId === id))
      .slice(0, layoutColumns);
    const focusedSessionId = typeof parsed.focusedSessionId === "string"
      && benchmarks.some((item) => item.sessionId === parsed.focusedSessionId)
      ? parsed.focusedSessionId
      : (activeSessionIds[0] ?? benchmarks[0]?.sessionId ?? null);

    return {
      version: CACHE_VERSION,
      novelId,
      chapterId,
      selectedSourceKey: typeof parsed.selectedSourceKey === "string" ? parsed.selectedSourceKey : "",
      benchmarks,
      compareBySessionId,
      essenceByReferenceKey,
      activeSessionIds: activeSessionIds.length > 0
        ? activeSessionIds
        : benchmarks.slice(0, layoutColumns).map((item) => item.sessionId),
      focusedSessionId,
      layoutColumns,
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export function saveStyleBenchmarkSession(session: StyleBenchmarkCacheSession): void {
  if (!session.novelId || !session.chapterId || typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(
      storageKey(session.novelId, session.chapterId),
      JSON.stringify({
        ...session,
        version: CACHE_VERSION,
        layoutColumns: normalizeLayoutColumns(session.layoutColumns),
        updatedAt: new Date().toISOString(),
      } satisfies StyleBenchmarkCacheSession),
    );
  } catch {
    // ignore quota / private mode
  }
}

export function clearStyleBenchmarkSession(novelId: string, chapterId: string): void {
  if (!novelId || !chapterId || typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.removeItem(storageKey(novelId, chapterId));
  } catch {
    // ignore
  }
}
