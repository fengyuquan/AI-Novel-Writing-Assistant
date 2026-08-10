import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { BatchOpsDialog } from "@/components/BatchOpsDialog";
import { ColumnPicker } from "@/components/ColumnPicker";
import { DeleteConfirmDialog } from "@/components/DeleteConfirmDialog";
import { RecordForm } from "@/components/RecordForm";
import { StatusFilterBar } from "@/components/StatusFilterBar";
import { supportsBatchOps } from "@/lib/batchOps";
import {
  createAdminRecord,
  fetchAdminList,
  fetchAdminMeta,
  fetchAdminRecord,
  getWriteUnlocked,
  updateAdminRecord,
  type AdminMetaPayload,
  type AdminModelMeta,
  type NovelChildModelSummary,
} from "@/lib/api";
import { displayCell, preferredListColumns } from "@/lib/format";
import { buildStatusWhere, getStatusPresets } from "@/lib/statusFilters";
import { copyText, loadVisibleColumns, saveVisibleColumns } from "@/lib/tablePrefs";

interface AdvancedTablesPanelProps {
  novelId: string;
  novelTitle: string;
  childrenModels: NovelChildModelSummary[];
  childModelName?: string;
  recordId?: string;
}

export function AdvancedTablesPanel(props: AdvancedTablesPanelProps) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const childModelName = props.childModelName ?? "";
  const recordId = props.recordId ?? "";

  const [meta, setMeta] = useState<AdminMetaPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<Record<string, unknown>[]>([]);
  const [total, setTotal] = useState(0);
  const [drawer, setDrawer] = useState<"create" | "edit" | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingRecord, setEditingRecord] = useState<Record<string, unknown> | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [childFilter, setChildFilter] = useState("");
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [batchOpen, setBatchOpen] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState<string[]>([]);
  const [copyHint, setCopyHint] = useState<string | null>(null);
  const [writeUnlocked, setWriteUnlockedState] = useState(getWriteUnlocked());

  const page = Math.max(1, Number(searchParams.get("page") || 1));
  const q = searchParams.get("q") || "";
  const statusPresetId = searchParams.get("status") || "all";

  const selectedChild: AdminModelMeta | null = useMemo(() => {
    if (!meta || !childModelName) return null;
    return meta.models.find((model) => model.name === childModelName) ?? null;
  }, [meta, childModelName]);

  const canWrite = Boolean(selectedChild && (!selectedChild.readOnlyDefault || writeUnlocked));

  useEffect(() => {
    const onUnlock = (event: Event) => {
      const detail = (event as CustomEvent<{ unlocked: boolean }>).detail;
      setWriteUnlockedState(Boolean(detail?.unlocked));
    };
    window.addEventListener("admin-write-unlock-changed", onUnlock);
    return () => window.removeEventListener("admin-write-unlock-changed", onUnlock);
  }, []);

  useEffect(() => {
    void fetchAdminMeta()
      .then(setMeta)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "加载元数据失败"));
  }, []);

  const allColumns = useMemo(() => {
    if (!selectedChild) return [];
    return selectedChild.fields
      .filter((field) => !field.isRelation)
      .map((field) => field.name)
      .filter((name) => name !== "novelId");
  }, [selectedChild]);

  const fallbackColumns = useMemo(() => {
    if (!selectedChild) return [];
    return preferredListColumns(allColumns, selectedChild.primaryKey);
  }, [selectedChild, allColumns]);

  const columns =
    visibleColumns.length > 0 ? visibleColumns.filter((name) => allColumns.includes(name)) : fallbackColumns;

  const filteredChildren = useMemo(() => {
    const keyword = childFilter.trim().toLowerCase();
    if (!keyword) return props.childrenModels;
    return props.childrenModels.filter((child) => child.model.toLowerCase().includes(keyword));
  }, [props.childrenModels, childFilter]);

  useEffect(() => {
    if (!selectedChild) {
      setVisibleColumns([]);
      return;
    }
    const defaults = preferredListColumns(allColumns, selectedChild.primaryKey);
    setVisibleColumns(loadVisibleColumns(selectedChild.name, defaults));
  }, [selectedChild, allColumns]);

  useEffect(() => {
    if (!selectedChild) {
      setItems([]);
      setTotal(0);
      return;
    }
    setLoading(true);
    setError(null);
    const presets = getStatusPresets(selectedChild.name);
    const preset = presets.find((item) => item.id === statusPresetId) ?? presets[0];
    const statusWhere = buildStatusWhere(preset);
    const orderBy = selectedChild.fields.some((field) => field.name === "updatedAt")
      ? "updatedAt"
      : selectedChild.fields.some((field) => field.name === "order")
        ? "order"
        : selectedChild.primaryKey;
    void fetchAdminList(selectedChild.name, {
      page,
      pageSize: 20,
      q: q || undefined,
      orderBy,
      orderDir: orderBy === "order" ? "asc" : "desc",
      where: {
        novelId: props.novelId,
        ...(statusWhere ?? {}),
      },
    })
      .then((result) => {
        setItems(result.items);
        setTotal(result.total);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "加载关联数据失败"))
      .finally(() => setLoading(false));
  }, [selectedChild, page, q, statusPresetId, props.novelId]);

  useEffect(() => {
    if (!recordId || !selectedChild) return;
    void fetchAdminRecord(selectedChild.name, recordId)
      .then((result) => {
        setEditingId(recordId);
        setEditingRecord(result.item);
        setDrawer("edit");
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "打开记录失败"));
  }, [recordId, selectedChild]);

  async function refreshChildList() {
    if (!selectedChild) return;
    const presets = getStatusPresets(selectedChild.name);
    const preset = presets.find((item) => item.id === statusPresetId) ?? presets[0];
    const result = await fetchAdminList(selectedChild.name, {
      page,
      pageSize: 20,
      q: q || undefined,
      where: { novelId: props.novelId, ...(buildStatusWhere(preset) ?? {}) },
    });
    setItems(result.items);
    setTotal(result.total);
  }

  const totalPages = Math.max(1, Math.ceil(total / 20));
  const batchBaseWhere = useMemo(() => {
    if (!selectedChild) return {};
    const presets = getStatusPresets(selectedChild.name);
    const preset = presets.find((item) => item.id === statusPresetId) ?? presets[0];
    return {
      novelId: props.novelId,
      ...(buildStatusWhere(preset) ?? {}),
    };
  }, [selectedChild, props.novelId, statusPresetId]);

  const basePath = `/novels/${props.novelId}/advanced`;

  return (
    <div className="flex min-h-0 flex-1">
      <aside className="flex w-64 shrink-0 flex-col border-r bg-[hsl(var(--card-surface))]">
        <div className="border-b px-3 py-2">
          <div className="text-xs text-muted-foreground">高级表 · {props.novelTitle}</div>
          <input
            value={childFilter}
            onChange={(event) => setChildFilter(event.target.value)}
            placeholder="筛选关联模型"
            className="mt-2 w-full rounded-md border px-2 py-1.5 text-sm"
          />
        </div>
        <nav className="flex-1 overflow-auto p-2">
          {filteredChildren.map((child) => (
            <Link
              key={child.model}
              to={`${basePath}/${child.model}`}
              className={`mb-1 flex items-center justify-between rounded-md px-2 py-1.5 text-sm ${
                child.model === childModelName ? "bg-accent text-accent-foreground" : "hover:bg-muted"
              }`}
            >
              <span className="truncate">
                {child.model}
                {child.pinned ? <span className="ml-1 text-[11px] text-muted-foreground">常用</span> : null}
              </span>
              <span className="ml-2 shrink-0 text-xs text-muted-foreground">{child.count}</span>
            </Link>
          ))}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b bg-white px-4 py-3">
          <div>
            <h2 className="font-semibold">{childModelName || "选择一张表"}</h2>
            <p className="text-xs text-muted-foreground">
              按 novelId 过滤的通用表编辑
              {selectedChild?.readOnlyDefault
                ? writeUnlocked
                  ? " · 危险表已解锁可写"
                  : " · 默认只读，需开启高级写解锁"
                : null}
              {copyHint ? ` · ${copyHint}` : null}
            </p>
          </div>
          {selectedChild ? (
            <div className="flex flex-wrap items-center justify-end gap-2">
              <StatusFilterBar
                modelName={selectedChild.name}
                activePresetId={statusPresetId}
                onChange={(preset) => {
                  const next = new URLSearchParams(searchParams);
                  if (preset.id === "all") next.delete("status");
                  else next.set("status", preset.id);
                  next.set("page", "1");
                  setSearchParams(next);
                }}
              />
              <ColumnPicker
                allColumns={allColumns}
                visibleColumns={columns}
                onChange={(nextColumns) => {
                  setVisibleColumns(nextColumns);
                  saveVisibleColumns(selectedChild.name, nextColumns);
                }}
              />
              <input
                defaultValue={q}
                key={`${childModelName}-${q}`}
                placeholder="在当前小说内搜索…"
                className="w-40 rounded-md border px-2 py-1.5 text-sm"
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    const value = (event.target as HTMLInputElement).value.trim();
                    const next = new URLSearchParams(searchParams);
                    if (value) next.set("q", value);
                    else next.delete("q");
                    next.set("page", "1");
                    setSearchParams(next);
                  }
                }}
              />
              {supportsBatchOps(selectedChild.name) ? (
                <button type="button" className="rounded-md border px-3 py-1.5 text-sm" onClick={() => setBatchOpen(true)}>
                  批量
                </button>
              ) : null}
              <button
                type="button"
                className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-40"
                disabled={!canWrite}
                onClick={() => {
                  setEditingId(null);
                  setEditingRecord({ novelId: props.novelId });
                  setDrawer("create");
                }}
              >
                新建
              </button>
            </div>
          ) : null}
        </header>

        <div className="flex-1 overflow-auto p-4">
          {error ? (
            <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
          ) : null}
          {loading ? <div className="text-sm text-muted-foreground">加载中…</div> : null}

          {!childModelName ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {props.childrenModels.map((child) => (
                <Link
                  key={child.model}
                  to={`${basePath}/${child.model}`}
                  className="rounded-lg border bg-white p-4 hover:border-sky-300 hover:bg-sky-50/40"
                >
                  <div className="flex items-center justify-between">
                    <div className="font-medium">{child.model}</div>
                    <div className="text-lg font-semibold">{child.count}</div>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    按 {child.foreignKey} 过滤{child.pinned ? " · 常用" : ""}
                  </div>
                </Link>
              ))}
            </div>
          ) : null}

          {selectedChild && !loading ? (
            <>
              <div className="overflow-auto rounded-lg border bg-white">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      {columns.map((column) => (
                        <th key={column} className="whitespace-nowrap px-3 py-2 font-medium">
                          {column}
                        </th>
                      ))}
                      <th className="px-3 py-2 font-medium">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => {
                      const id = String(item[selectedChild.primaryKey] ?? "");
                      return (
                        <tr key={id} className="border-t align-top hover:bg-muted/30">
                          {columns.map((column) => {
                            const field = selectedChild.fields.find((entry) => entry.name === column);
                            const value = item[column];
                            const isFk = Boolean(
                              field?.isForeignKey && field.relationTo && value && field.relationTo !== "Novel",
                            );
                            return (
                              <td key={column} className="max-w-[16rem] px-3 py-2">
                                {isFk ? (
                                  <Link
                                    to={`/models/${field?.relationTo}/${encodeURIComponent(String(value))}`}
                                    className="text-sky-700 underline"
                                  >
                                    {displayCell(value)}
                                  </Link>
                                ) : (
                                  <span className="break-all">{displayCell(value)}</span>
                                )}
                              </td>
                            );
                          })}
                          <td className="whitespace-nowrap px-3 py-2">
                            <button
                              type="button"
                              className="mr-2 text-sky-700 underline"
                              onClick={() => {
                                void copyText(id).then((ok) => setCopyHint(ok ? "已复制 ID" : "复制失败"));
                              }}
                            >
                              复制ID
                            </button>
                            <button
                              type="button"
                              className="mr-2 text-sky-700 underline"
                              onClick={() => navigate(`${basePath}/${selectedChild.name}/${id}`)}
                            >
                              {canWrite ? "编辑" : "查看"}
                            </button>
                            {canWrite ? (
                              <button
                                type="button"
                                className="text-destructive underline"
                                onClick={() => setDeleteTargetId(id)}
                              >
                                删除
                              </button>
                            ) : null}
                          </td>
                        </tr>
                      );
                    })}
                    {items.length === 0 ? (
                      <tr>
                        <td colSpan={columns.length + 1} className="px-3 py-8 text-center text-muted-foreground">
                          这本小说下暂无 {selectedChild.name} 数据
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
              <div className="mt-4 flex items-center justify-between text-sm">
                <span className="text-muted-foreground">本小说内共 {total} 条</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={page <= 1}
                    className="rounded border px-2 py-1 disabled:opacity-40"
                    onClick={() => {
                      const next = new URLSearchParams(searchParams);
                      next.set("page", String(page - 1));
                      setSearchParams(next);
                    }}
                  >
                    上一页
                  </button>
                  <span>
                    {page} / {totalPages}
                  </span>
                  <button
                    type="button"
                    disabled={page >= totalPages}
                    className="rounded border px-2 py-1 disabled:opacity-40"
                    onClick={() => {
                      const next = new URLSearchParams(searchParams);
                      next.set("page", String(page + 1));
                      setSearchParams(next);
                    }}
                  >
                    下一页
                  </button>
                </div>
              </div>
            </>
          ) : null}
        </div>
      </div>

      {drawer && selectedChild ? (
        <div className="fixed inset-0 z-40 flex justify-end bg-black/30">
          <div className="flex h-full w-full max-w-3xl flex-col bg-white shadow-xl">
            <div className="border-b px-4 py-3">
              <h2 className="font-semibold">
                {!canWrite && drawer === "edit"
                  ? `查看 ${selectedChild.name}`
                  : drawer === "create"
                    ? `新建 ${selectedChild.name}`
                    : `编辑 ${selectedChild.name}`}
              </h2>
            </div>
            <div className="min-h-0 flex-1">
              <RecordForm
                key={`${drawer}-${editingId ?? "new"}-${canWrite ? "w" : "r"}`}
                model={selectedChild}
                mode={drawer === "create" ? "create" : "edit"}
                initialValues={editingRecord ?? { novelId: props.novelId }}
                submitting={submitting}
                readOnly={!canWrite}
                onCancel={() => {
                  setDrawer(null);
                  if (recordId) navigate(`${basePath}/${selectedChild.name}`);
                }}
                onSubmit={async (values) => {
                  if (!canWrite) throw new Error("当前模型只读，请先开启高级写解锁。");
                  setSubmitting(true);
                  try {
                    const payload = { ...values, novelId: props.novelId };
                    if (drawer === "create") {
                      await createAdminRecord(selectedChild.name, payload);
                    } else if (editingId) {
                      await updateAdminRecord(selectedChild.name, editingId, payload);
                    }
                    setDrawer(null);
                    if (recordId) navigate(`${basePath}/${selectedChild.name}`);
                    await refreshChildList();
                  } finally {
                    setSubmitting(false);
                  }
                }}
              />
            </div>
          </div>
        </div>
      ) : null}

      {deleteTargetId && selectedChild ? (
        <DeleteConfirmDialog
          model={selectedChild.name}
          id={deleteTargetId}
          onCancel={() => setDeleteTargetId(null)}
          onDeleted={() => {
            setDeleteTargetId(null);
            void refreshChildList();
          }}
        />
      ) : null}

      {batchOpen && selectedChild ? (
        <BatchOpsDialog
          model={selectedChild.name}
          baseWhere={batchBaseWhere}
          onCancel={() => setBatchOpen(false)}
          onDone={() => {
            setBatchOpen(false);
            void refreshChildList();
          }}
        />
      ) : null}
    </div>
  );
}
