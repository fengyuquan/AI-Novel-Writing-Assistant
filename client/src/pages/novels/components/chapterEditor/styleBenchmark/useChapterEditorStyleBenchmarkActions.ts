import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import type {
  ChapterEditorStyleBenchmarkCacheSession,
  ChapterEditorStyleBenchmarkCompareResponse,
  ChapterEditorStyleBenchmarkReference,
  ChapterEditorStyleBenchmarkRewriteResponse,
  ChapterEditorStyleBenchmarkSourceKind,
  ChapterEditorStyleBenchmarkSourceOption,
} from "@ai-novel/shared/types/novel";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import {
  clearChapterStyleBenchmarkCache,
  compareChapterStyleBenchmark,
  getChapterStyleBenchmarkCache,
  listChapterStyleBenchmarkSources,
  rewriteChapterStyleBenchmark,
  saveChapterStyleBenchmarkCache,
} from "@/api/novel";
import { toast } from "@/components/ui/toast";
import {
  clearStyleBenchmarkSession,
  loadStyleBenchmarkPrefs,
  loadStyleBenchmarkSession,
  patchStyleBenchmarkPrefs,
  upsertBenchmarkList,
  type StyleBenchmarkLayoutColumns,
} from "./styleBenchmarkStorage";

function sourceKey(option: Pick<ChapterEditorStyleBenchmarkSourceOption, "kind" | "id">): string {
  return `${option.kind}:${option.id}`;
}

function parseSourceKey(value: string): ChapterEditorStyleBenchmarkReference | null {
  const separator = value.indexOf(":");
  if (separator <= 0) {
    return null;
  }
  const kind = value.slice(0, separator) as ChapterEditorStyleBenchmarkSourceKind;
  const id = value.slice(separator + 1).trim();
  if (!id || !["style_profile", "knowledge_document", "novel"].includes(kind)) {
    return null;
  }
  return { kind, id };
}

function emptyState(layoutColumns: StyleBenchmarkLayoutColumns = 1) {
  return {
    selectedSourceKey: "",
    benchmarks: [] as ChapterEditorStyleBenchmarkRewriteResponse[],
    compareBySessionId: {} as Record<string, ChapterEditorStyleBenchmarkCompareResponse>,
    essenceByReferenceKey: {} as NonNullable<ChapterEditorStyleBenchmarkCacheSession["essenceByReferenceKey"]>,
    activeSessionIds: [] as string[],
    focusedSessionId: null as string | null,
    layoutColumns,
    restoredFromCache: false,
    latestGeneratedSessionId: null as string | null,
  };
}

function ensureActiveSessionIds(
  benchmarks: ChapterEditorStyleBenchmarkRewriteResponse[],
  activeSessionIds: string[],
  layoutColumns: StyleBenchmarkLayoutColumns,
  preferredSessionId?: string | null,
): string[] {
  const valid = activeSessionIds.filter((id) => benchmarks.some((item) => item.sessionId === id));
  if (preferredSessionId && benchmarks.some((item) => item.sessionId === preferredSessionId)) {
    const next = [preferredSessionId, ...valid.filter((id) => id !== preferredSessionId)];
    return next.slice(0, layoutColumns);
  }
  if (valid.length > 0) {
    return valid.slice(0, layoutColumns);
  }
  return benchmarks.slice(0, layoutColumns).map((item) => item.sessionId);
}

function applySession(
  session: ChapterEditorStyleBenchmarkCacheSession,
  setters: {
    setSelectedSourceKey: (value: string) => void;
    setBenchmarks: (value: ChapterEditorStyleBenchmarkRewriteResponse[]) => void;
    setCompareBySessionId: (value: Record<string, ChapterEditorStyleBenchmarkCompareResponse>) => void;
    setEssenceByReferenceKey: (value: NonNullable<ChapterEditorStyleBenchmarkCacheSession["essenceByReferenceKey"]>) => void;
    setActiveSessionIds: (value: string[]) => void;
    setFocusedSessionId: (value: string | null) => void;
    setLayoutColumnsState: (value: StyleBenchmarkLayoutColumns) => void;
    setRestoredFromCache: (value: boolean) => void;
  },
) {
  setters.setSelectedSourceKey(session.selectedSourceKey);
  setters.setBenchmarks(session.benchmarks);
  setters.setCompareBySessionId(session.compareBySessionId);
  setters.setEssenceByReferenceKey(session.essenceByReferenceKey ?? {});
  setters.setActiveSessionIds(session.activeSessionIds);
  setters.setFocusedSessionId(session.focusedSessionId);
  setters.setLayoutColumnsState(session.layoutColumns);
  setters.setRestoredFromCache(session.benchmarks.length > 0);
}

export function useChapterEditorStyleBenchmarkActions(params: {
  novelId: string;
  chapterId: string | undefined;
  contentDraft: string;
  llm: {
    provider?: LLMProvider;
    model?: string;
  };
  resetToken: string;
}) {
  const { novelId, chapterId, contentDraft, llm, resetToken } = params;
  const initialPrefs = loadStyleBenchmarkPrefs();
  const [selectedSourceKey, setSelectedSourceKey] = useState("");
  const [benchmarks, setBenchmarks] = useState<ChapterEditorStyleBenchmarkRewriteResponse[]>([]);
  const [compareBySessionId, setCompareBySessionId] = useState<Record<string, ChapterEditorStyleBenchmarkCompareResponse>>({});
  const [essenceByReferenceKey, setEssenceByReferenceKey] = useState<
    NonNullable<ChapterEditorStyleBenchmarkCacheSession["essenceByReferenceKey"]>
  >({});
  const [activeSessionIds, setActiveSessionIds] = useState<string[]>([]);
  const [focusedSessionId, setFocusedSessionId] = useState<string | null>(null);
  const [layoutColumns, setLayoutColumnsState] = useState<StyleBenchmarkLayoutColumns>(initialPrefs.layoutColumns);
  const [restoredFromCache, setRestoredFromCache] = useState(false);
  const [latestGeneratedSessionId, setLatestGeneratedSessionId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [cacheReady, setCacheReady] = useState(false);
  const [cacheSaveStatus, setCacheSaveStatus] = useState<"idle" | "pending" | "saving" | "saved" | "error">("idle");
  const saveTimerRef = useRef<number | null>(null);
  const skipNextSaveRef = useRef(true);
  const pendingSessionRef = useRef<ChapterEditorStyleBenchmarkCacheSession | null>(null);
  const cacheSaveInFlightRef = useRef(false);
  const flushPendingCacheSaveRef = useRef<() => Promise<void>>(async () => {});

  const flushPendingCacheSave = async () => {
    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    const session = pendingSessionRef.current;
    if (!session || !novelId || !chapterId || cacheSaveInFlightRef.current) {
      return;
    }
    cacheSaveInFlightRef.current = true;
    setCacheSaveStatus("saving");
    try {
      await saveChapterStyleBenchmarkCache(novelId, chapterId, session);
      // 仅在仍是同一份待保存会话时清掉，避免覆盖更新中的草稿。
      if (pendingSessionRef.current === session) {
        pendingSessionRef.current = null;
        setCacheSaveStatus("saved");
      }
    } catch {
      setCacheSaveStatus("error");
    } finally {
      cacheSaveInFlightRef.current = false;
      // 保存过程中又有新编辑时，立刻再冲刷一次。
      if (pendingSessionRef.current && pendingSessionRef.current !== session) {
        void flushPendingCacheSaveRef.current();
      }
    }
  };
  flushPendingCacheSaveRef.current = flushPendingCacheSave;

  useEffect(() => {
    let cancelled = false;
    setErrorMessage(null);
    setLatestGeneratedSessionId(null);
    setCacheReady(false);
    skipNextSaveRef.current = true;

    const prefs = loadStyleBenchmarkPrefs();
    if (!novelId || !chapterId) {
      const empty = emptyState(prefs.layoutColumns);
      setSelectedSourceKey(empty.selectedSourceKey);
      setBenchmarks(empty.benchmarks);
      setCompareBySessionId(empty.compareBySessionId);
      setEssenceByReferenceKey(empty.essenceByReferenceKey);
      setActiveSessionIds(empty.activeSessionIds);
      setFocusedSessionId(empty.focusedSessionId);
      setLayoutColumnsState(empty.layoutColumns);
      setRestoredFromCache(false);
      setCacheReady(true);
      return () => {
        cancelled = true;
      };
    }

    void (async () => {
      try {
        const response = await getChapterStyleBenchmarkCache(novelId, chapterId);
        if (cancelled) {
          return;
        }
        const remote = response.data ?? null;
        if (remote && remote.benchmarks.length > 0) {
          applySession(remote, {
            setSelectedSourceKey,
            setBenchmarks,
            setCompareBySessionId,
            setEssenceByReferenceKey,
            setActiveSessionIds,
            setFocusedSessionId,
            setLayoutColumnsState,
            setRestoredFromCache,
          });
          clearStyleBenchmarkSession(novelId, chapterId);
          setCacheReady(true);
          return;
        }

        const local = loadStyleBenchmarkSession(novelId, chapterId);
        if (local && local.benchmarks.length > 0) {
          applySession(local, {
            setSelectedSourceKey,
            setBenchmarks,
            setCompareBySessionId,
            setEssenceByReferenceKey,
            setActiveSessionIds,
            setFocusedSessionId,
            setLayoutColumnsState,
            setRestoredFromCache,
          });
          try {
            await saveChapterStyleBenchmarkCache(novelId, chapterId, local);
            clearStyleBenchmarkSession(novelId, chapterId);
          } catch {
            // Keep local until next successful sync.
          }
          setCacheReady(true);
          return;
        }

        const empty = emptyState(prefs.layoutColumns);
        setSelectedSourceKey(empty.selectedSourceKey);
        setBenchmarks(empty.benchmarks);
        setCompareBySessionId(empty.compareBySessionId);
        setEssenceByReferenceKey(empty.essenceByReferenceKey);
        setActiveSessionIds(empty.activeSessionIds);
        setFocusedSessionId(empty.focusedSessionId);
        setLayoutColumnsState(empty.layoutColumns);
        setRestoredFromCache(false);
        setCacheReady(true);
      } catch {
        if (cancelled) {
          return;
        }
        const local = loadStyleBenchmarkSession(novelId, chapterId);
        if (local) {
          applySession(local, {
            setSelectedSourceKey,
            setBenchmarks,
            setCompareBySessionId,
            setEssenceByReferenceKey,
            setActiveSessionIds,
            setFocusedSessionId,
            setLayoutColumnsState,
            setRestoredFromCache,
          });
        } else {
          const empty = emptyState(prefs.layoutColumns);
          setSelectedSourceKey(empty.selectedSourceKey);
          setBenchmarks(empty.benchmarks);
          setCompareBySessionId(empty.compareBySessionId);
          setEssenceByReferenceKey(empty.essenceByReferenceKey);
          setActiveSessionIds(empty.activeSessionIds);
          setFocusedSessionId(empty.focusedSessionId);
          setLayoutColumnsState(empty.layoutColumns);
          setRestoredFromCache(false);
        }
        setCacheReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [novelId, chapterId, resetToken]);

  useEffect(() => {
    if (!cacheReady || !novelId || !chapterId) {
      return;
    }
    if (skipNextSaveRef.current) {
      skipNextSaveRef.current = false;
      return;
    }
    if (!selectedSourceKey && benchmarks.length === 0) {
      pendingSessionRef.current = null;
      setCacheSaveStatus("idle");
      return;
    }

    const session: ChapterEditorStyleBenchmarkCacheSession = {
      version: 3,
      novelId,
      chapterId,
      selectedSourceKey,
      benchmarks,
      compareBySessionId,
      essenceByReferenceKey,
      activeSessionIds,
      focusedSessionId,
      layoutColumns,
      updatedAt: new Date().toISOString(),
    };
    pendingSessionRef.current = session;
    setCacheSaveStatus("pending");

    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
    }
    saveTimerRef.current = window.setTimeout(() => {
      void flushPendingCacheSaveRef.current();
    }, 600);

    return () => {
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
      }
    };
  }, [
    cacheReady,
    novelId,
    chapterId,
    selectedSourceKey,
    benchmarks,
    compareBySessionId,
    essenceByReferenceKey,
    activeSessionIds,
    focusedSessionId,
    layoutColumns,
  ]);

  const sourcesQuery = useQuery({
    queryKey: ["chapter-editor", "style-benchmark-sources", novelId, chapterId],
    enabled: Boolean(novelId && chapterId),
    queryFn: async () => {
      if (!chapterId) {
        throw new Error("当前未选中章节。");
      }
      const response = await listChapterStyleBenchmarkSources(novelId, chapterId);
      return response.data ?? {
        styleProfiles: [],
        knowledgeDocuments: [],
        novels: [],
      };
    },
  });

  const sourceOptions = useMemo(() => {
    const data = sourcesQuery.data;
    if (!data) {
      return [] as Array<ChapterEditorStyleBenchmarkSourceOption & { key: string; groupLabel: string }>;
    }
    return [
      ...data.styleProfiles.map((item) => ({ ...item, key: sourceKey(item), groupLabel: "写法档案" })),
      ...data.knowledgeDocuments.map((item) => ({ ...item, key: sourceKey(item), groupLabel: "知识库爆款" })),
      ...data.novels.map((item) => ({ ...item, key: sourceKey(item), groupLabel: "小说项目" })),
    ];
  }, [sourcesQuery.data]);

  useEffect(() => {
    if (selectedSourceKey) {
      const stillExists = sourceOptions.some((item) => item.key === selectedSourceKey);
      if (stillExists || sourceOptions.length === 0) {
        return;
      }
    }
    if (sourceOptions.length > 0) {
      const preferred = sourceOptions.find((item) => item.sampleReady) ?? sourceOptions[0];
      if (preferred) {
        setSelectedSourceKey(preferred.key);
      }
    }
  }, [selectedSourceKey, sourceOptions]);

  const selectedReference = useMemo(
    () => (selectedSourceKey ? parseSourceKey(selectedSourceKey) : null),
    [selectedSourceKey],
  );

  const focusedBenchmark = useMemo(
    () => benchmarks.find((item) => item.sessionId === focusedSessionId) ?? benchmarks[0] ?? null,
    [benchmarks, focusedSessionId],
  );

  const visibleBenchmarks = useMemo(() => {
    const ordered = activeSessionIds
      .map((id) => benchmarks.find((item) => item.sessionId === id))
      .filter((item): item is ChapterEditorStyleBenchmarkRewriteResponse => Boolean(item));
    if (ordered.length > 0) {
      return ordered.slice(0, layoutColumns);
    }
    return benchmarks.slice(0, layoutColumns);
  }, [activeSessionIds, benchmarks, layoutColumns]);

  const focusedCompareResult = focusedBenchmark
    ? compareBySessionId[focusedBenchmark.sessionId] ?? null
    : null;

  const rewriteMutation = useMutation({
    mutationFn: async (focusGaps?: string[]) => {
      if (!chapterId) {
        throw new Error("当前未选中章节。");
      }
      if (!contentDraft.trim()) {
        throw new Error("当前正文为空，请先写完本章再对照。");
      }
      if (!selectedReference) {
        throw new Error("请先选择一本学习范本。");
      }
      return rewriteChapterStyleBenchmark(novelId, chapterId, {
        content: contentDraft,
        reference: selectedReference,
        focusGaps: focusGaps?.length ? focusGaps : undefined,
        provider: llm.provider,
        model: llm.model,
        temperature: 0.55,
      });
    },
    onMutate: () => {
      setErrorMessage(null);
      setRestoredFromCache(false);
    },
    onSuccess: (response) => {
      const data = response.data;
      if (!data) {
        setErrorMessage("未返回范本对照稿，请重试。");
        return;
      }
      const versioned: ChapterEditorStyleBenchmarkRewriteResponse = {
        ...data,
        provider: data.provider ?? llm.provider ?? null,
        model: data.model?.trim() || llm.model?.trim() || null,
      };
      if (versioned.essence) {
        const key = sourceKey(versioned.reference);
        setEssenceByReferenceKey((current) => ({
          ...current,
          [key]: versioned.essence!,
        }));
      }
      setBenchmarks((current) => {
        const next = upsertBenchmarkList(current, versioned);
        setActiveSessionIds((active) => ensureActiveSessionIds(next, active, layoutColumns, versioned.sessionId));
        return next;
      });
      setFocusedSessionId(versioned.sessionId);
      setLatestGeneratedSessionId(versioned.sessionId);
      setErrorMessage(null);
      setRestoredFromCache(false);
      const missedCount = versioned.essenceCompliance?.missed?.length ?? 0;
      toast.success(
        missedCount > 0
          ? `对照稿已生成；还有 ${missedCount} 条精髓指纹未覆盖，可按缺口再生成。`
          : versioned.rewriteMode === "segmented"
            ? "已分段仿写并统一声口，对照稿已保存到本章缓存。"
            : "已按范本精髓写好对照稿，并已保存到本章缓存。",
      );
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "生成范本对照稿失败，请重试。";
      setErrorMessage(message);
      toast.error(message);
    },
  });

  const compareMutation = useMutation({
    mutationFn: async (targetSessionId?: string) => {
      if (!chapterId) {
        throw new Error("当前未选中章节。");
      }
      const target = benchmarks.find((item) => item.sessionId === (targetSessionId ?? focusedSessionId))
        ?? focusedBenchmark;
      if (!target) {
        throw new Error("请先生成范本对照稿，再做逐段点评。");
      }
      return {
        sessionId: target.sessionId,
        response: await compareChapterStyleBenchmark(novelId, chapterId, {
          userContent: contentDraft.trim() || target.userContent,
          benchmarkContent: target.benchmarkContent,
          reference: {
            kind: target.reference.kind,
            id: target.reference.id,
          },
          provider: llm.provider,
          model: llm.model,
          temperature: 0.2,
        }),
      };
    },
    onMutate: () => {
      setErrorMessage(null);
      setRestoredFromCache(false);
    },
    onSuccess: ({ sessionId, response }) => {
      const data = response.data;
      if (!data) {
        setErrorMessage("未返回分段点评，请重试。");
        return;
      }
      setCompareBySessionId((current) => ({
        ...current,
        [sessionId]: data,
      }));
      setFocusedSessionId(sessionId);
      setErrorMessage(null);
      setRestoredFromCache(false);
      toast.success(`已完成 ${data.segments.length} 个情节节拍对照点评。`);
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "逐段点评失败，请重试。";
      setErrorMessage(message);
      toast.error(message);
    },
  });

  const setLayoutColumns = (next: StyleBenchmarkLayoutColumns) => {
    setLayoutColumnsState(next);
    patchStyleBenchmarkPrefs({ layoutColumns: next });
    setActiveSessionIds((current) => ensureActiveSessionIds(benchmarks, current, next, focusedSessionId));
  };

  const focusBenchmark = (sessionId: string) => {
    if (!benchmarks.some((item) => item.sessionId === sessionId)) {
      return;
    }
    setFocusedSessionId(sessionId);
    setActiveSessionIds((current) => {
      if (layoutColumns <= 1) {
        return [sessionId];
      }
      if (current.includes(sessionId)) {
        return current;
      }
      const next = [...current, sessionId];
      if (next.length <= layoutColumns) {
        return next;
      }
      return [...current.slice(1), sessionId].slice(0, layoutColumns);
    });
  };

  const toggleBenchmarkVisible = (sessionId: string) => {
    if (!benchmarks.some((item) => item.sessionId === sessionId)) {
      return;
    }
    setFocusedSessionId(sessionId);
    setActiveSessionIds((current) => {
      if (layoutColumns <= 1) {
        return [sessionId];
      }
      if (current.includes(sessionId)) {
        if (current.length === 1) {
          return current;
        }
        return current.filter((id) => id !== sessionId);
      }
      const next = [...current, sessionId];
      if (next.length <= layoutColumns) {
        return next;
      }
      return [...current.slice(1), sessionId].slice(0, layoutColumns);
    });
  };

  const removeBenchmark = (sessionId: string) => {
    setBenchmarks((current) => {
      const next = current.filter((item) => item.sessionId !== sessionId);
      setActiveSessionIds((active) => ensureActiveSessionIds(next, active.filter((id) => id !== sessionId), layoutColumns));
      setFocusedSessionId((focused) => {
        if (focused !== sessionId) {
          return focused;
        }
        return next[0]?.sessionId ?? null;
      });
      return next;
    });
    setCompareBySessionId((current) => {
      const next = { ...current };
      delete next[sessionId];
      return next;
    });
    if (latestGeneratedSessionId === sessionId) {
      setLatestGeneratedSessionId(null);
    }
  };

  const updateBenchmarkContent = (sessionId: string, nextContent: string) => {
    setBenchmarks((current) => current.map((item) => (
      item.sessionId === sessionId
        ? { ...item, benchmarkContent: nextContent }
        : item
    )));
    // 范文改过之后，旧点评摘录可能对不上当前段落，清掉该篇点评让用户重跑。
    setCompareBySessionId((current) => {
      if (!(sessionId in current)) {
        return current;
      }
      const next = { ...current };
      delete next[sessionId];
      return next;
    });
    setFocusedSessionId(sessionId);
  };

  const clearCachedResults = () => {
    if (novelId && chapterId) {
      clearStyleBenchmarkSession(novelId, chapterId);
      void clearChapterStyleBenchmarkCache(novelId, chapterId).catch(() => {
        // ignore network errors; local state still cleared
      });
    }
    const empty = emptyState(layoutColumns);
    setBenchmarks(empty.benchmarks);
    setCompareBySessionId(empty.compareBySessionId);
    setEssenceByReferenceKey(empty.essenceByReferenceKey);
    setActiveSessionIds(empty.activeSessionIds);
    setFocusedSessionId(empty.focusedSessionId);
    setRestoredFromCache(false);
    setLatestGeneratedSessionId(null);
    setErrorMessage(null);
    toast.success("已清除本章的范文对照缓存。");
  };

  return {
    sourceOptions,
    sourcesLoading: sourcesQuery.isLoading,
    sourcesError: sourcesQuery.isError ? "学习范本列表加载失败，请稍后重试。" : null,
    selectedSourceKey,
    setSelectedSourceKey,
    benchmarks,
    visibleBenchmarks,
    focusedBenchmark,
    focusedCompareResult,
    compareBySessionId,
    essenceByReferenceKey,
    activeSessionIds,
    focusedSessionId,
    layoutColumns,
    setLayoutColumns,
    focusBenchmark,
    toggleBenchmarkVisible,
    removeBenchmark,
    updateBenchmarkContent,
    restoredFromCache,
    latestGeneratedSessionId,
    errorMessage,
    isRewriting: rewriteMutation.isPending,
    isComparing: compareMutation.isPending,
    runRewrite: (focusGaps?: string[]) => rewriteMutation.mutate(focusGaps),
    runCompare: (sessionId?: string) => compareMutation.mutate(sessionId),
    clearCachedResults,
    cacheSaveStatus,
    flushPendingCacheSave,
  };
}
