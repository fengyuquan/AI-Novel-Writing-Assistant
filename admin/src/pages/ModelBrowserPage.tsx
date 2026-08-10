import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { AdminShell } from "@/components/AdminShell";
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
  setStoredToken,
  updateAdminRecord,
  type AdminMetaPayload,
  type AdminModelMeta,
} from "@/lib/api";
import { displayCell, preferredListColumns } from "@/lib/format";
import { buildStatusWhere, getStatusPresets } from "@/lib/statusFilters";
import { copyText, loadVisibleColumns, saveVisibleColumns } from "@/lib/tablePrefs";

export function ModelBrowserPage() {
  const navigate = useNavigate();
  const params = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const [meta, setMeta] = useState<AdminMetaPayload | null>(null);
  const [modelFilter, setModelFilter] = useState("");
  const [listError, setListError] = useState<string | null>(null);
  const [loadingList, setLoadingList] = useState(false);
  const [items, setItems] = useState<Record<string, unknown>[]>([]);
  const [total, setTotal] = useState(0);
  const [drawer, setDrawer] = useState<"create" | "edit" | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingRecord, setEditingRecord] = useState<Record<string, unknown> | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [batchOpen, setBatchOpen] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState<string[]>([]);
  const [copyHint, setCopyHint] = useState<string | null>(null);
  const [writeUnlocked, setWriteUnlockedState] = useState(getWriteUnlocked());

  useEffect(() => {
    const onUnlock = (event: Event) => {
      const detail = (event as CustomEvent<{ unlocked: boolean }>).detail;
      setWriteUnlockedState(Boolean(detail?.unlocked));
    };
    window.addEventListener("admin-write-unlock-changed", onUnlock);
    return () => window.removeEventListener("admin-write-unlock-changed", onUnlock);
  }, []);

  const page = Math.max(1, Number(searchParams.get("page") || 1));
  const q = searchParams.get("q") || "";
  const statusPresetId = searchParams.get("status") || "all";
  const selectedModelName = params.model || meta?.pinnedModels[0] || meta?.models[0]?.name || "";
  const recordId = params.recordId ?? "";

  const selectedModel: AdminModelMeta | null = useMemo(() => {
    if (!meta || !selectedModelName) return null;
    return meta.models.find((model) => model.name === selectedModelName) ?? null;
  }, [meta, selectedModelName]);

  const canWrite = Boolean(selectedModel && (!selectedModel.readOnlyDefault || writeUnlocked));

  const filteredModels = useMemo(() => {
    if (!meta) return [];
    const keyword = modelFilter.trim().toLowerCase();
    if (!keyword) return meta.models;
    return meta.models.filter((model) => model.name.toLowerCase().includes(keyword));
  }, [meta, modelFilter]);

  const allColumns = useMemo(() => {
    if (!selectedModel) return [];
    return selectedModel.fields.filter((field) => !field.isRelation).map((field) => field.name);
  }, [selectedModel]);

  const fallbackColumns = useMemo(() => {
    if (!selectedModel) return [];
    return preferredListColumns(allColumns, selectedModel.primaryKey);
  }, [selectedModel, allColumns]);

  const columns = visibleColumns.length > 0 ? visibleColumns.filter((name) => allColumns.includes(name)) : fallbackColumns;

  useEffect(() => {
    void fetchAdminMeta()
      .then((payload) => {
        setMeta(payload);
        if (!params.model && payload.models.length > 0) {
          const first = payload.pinnedModels[0] || payload.models[0].name;
          navigate(`/models/${first}`, { replace: true });
        }
      })
      .catch((err: unknown) => {
        setListError(err instanceof Error ? err.message : "加载元数据失败");
        if (String(err).includes("未授权") || String(err).includes("401")) {
          setStoredToken(null);
          navigate("/login", { replace: true });
        }
      });
  }, [navigate, params.model]);

  useEffect(() => {
    if (!selectedModel) {
      setVisibleColumns([]);
      return;
    }
    const scalarNames = selectedModel.fields.filter((field) => !field.isRelation).map((field) => field.name);
    const defaults = preferredListColumns(scalarNames, selectedModel.primaryKey);
    setVisibleColumns(loadVisibleColumns(selectedModel.name, defaults));
  }, [selectedModel]);

  useEffect(() => {
    if (!selectedModelName || !selectedModel) return;
    setLoadingList(true);
    setListError(null);
    const presets = getStatusPresets(selectedModel.name);
    const preset = presets.find((item) => item.id === statusPresetId) ?? presets[0];
    const orderBy = selectedModel.fields.some((field) => field.name === "updatedAt")
      ? "updatedAt"
      : selectedModel.primaryKey;
    void fetchAdminList(selectedModelName, {
      page,
      pageSize: 20,
      q: q || undefined,
      orderBy,
      orderDir: "desc",
      where: buildStatusWhere(preset),
    })
      .then((result) => {
        setItems(result.items);
        setTotal(result.total);
      })
      .catch((err: unknown) => {
        setListError(err instanceof Error ? err.message : "加载失败");
      })
      .finally(() => setLoadingList(false));
  }, [selectedModelName, selectedModel, page, q, statusPresetId]);

  useEffect(() => {
    if (!recordId || !selectedModel) return;
    void fetchAdminRecord(selectedModel.name, recordId)
      .then((result) => {
        setEditingId(recordId);
        setEditingRecord(result.item);
        setDrawer("edit");
      })
      .catch((err: unknown) => setListError(err instanceof Error ? err.message : "打开记录失败"));
  }, [recordId, selectedModel]);

  async function openEdit(id: string) {
    if (!selectedModelName) return;
    navigate(`/models/${selectedModelName}/${id}`);
  }

  const totalPages = Math.max(1, Math.ceil(total / 20));
  const subtitle = meta ? `${meta.databaseProvider} · 高级全库 · ${meta.modelCount} 个模型` : "高级全库";
  const batchBaseWhere = useMemo(() => {
    if (!selectedModel) return {};
    const presets = getStatusPresets(selectedModel.name);
    const preset = presets.find((item) => item.id === statusPresetId) ?? presets[0];
    return { ...(buildStatusWhere(preset) ?? {}) };
  }, [selectedModel, statusPresetId]);

  const sidebar = (
    <>
      <div className="border-b px-3 py-3">
        <input
          value={modelFilter}
          onChange={(event) => setModelFilter(event.target.value)}
          placeholder="搜索模型"
          className="w-full rounded-md border px-2 py-1.5 text-sm"
        />
      </div>
      <nav className="flex-1 overflow-auto p-2">
        {filteredModels.map((model) => (
          <Link
            key={model.name}
            to={`/models/${model.name}`}
            className={`mb-1 block rounded-md px-2 py-1.5 text-sm ${
              model.name === selectedModelName ? "bg-accent text-accent-foreground" : "hover:bg-muted"
            }`}
          >
            <span className="font-medium">{model.name}</span>
            {model.pinned ? <span className="ml-2 text-[11px] text-muted-foreground">常用</span> : null}
            {model.readOnlyDefault ? <span className="ml-2 text-[11px] text-amber-700">只读</span> : null}
          </Link>
        ))}
      </nav>
    </>
  );

  return (
    <AdminShell subtitle={subtitle} sidebar={sidebar}>
      <header className="flex items-center justify-between gap-3 border-b bg-white px-5 py-3">
        <div>
          <div className="text-xs text-muted-foreground">
            <Link to="/models" className="underline">
              全部模型
            </Link>
            {selectedModelName ? ` / ${selectedModelName}` : null}
            {recordId ? ` / ${recordId}` : null}
          </div>
          <h1 className="text-lg font-semibold">{selectedModelName || "选择模型"}</h1>
          <p className="text-xs text-muted-foreground">
            浏览、搜索并编辑当前库中的记录。
            {selectedModel?.readOnlyDefault ? (writeUnlocked ? " · 危险表已解锁可写" : " · 默认只读，需开启高级写解锁") : null}
            {copyHint ? ` · ${copyHint}` : null}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {selectedModel ? (
            <StatusFilterBar
              modelName={selectedModel.name}
              activePresetId={statusPresetId}
              onChange={(preset) => {
                const next = new URLSearchParams(searchParams);
                if (preset.id === "all") next.delete("status");
                else next.set("status", preset.id);
                next.set("page", "1");
                setSearchParams(next);
              }}
            />
          ) : null}
          {selectedModel ? (
            <ColumnPicker
              allColumns={allColumns}
              visibleColumns={columns}
              onChange={(nextColumns) => {
                setVisibleColumns(nextColumns);
                saveVisibleColumns(selectedModel.name, nextColumns);
              }}
            />
          ) : null}
          <input
            defaultValue={q}
            key={q}
            placeholder="搜索…"
            className="w-44 rounded-md border px-2 py-1.5 text-sm"
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
          {selectedModel && supportsBatchOps(selectedModel.name) ? (
            <button type="button" className="rounded-md border px-3 py-1.5 text-sm" onClick={() => setBatchOpen(true)}>
              批量
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => {
              setEditingId(null);
              setEditingRecord(null);
              setDrawer("create");
            }}
            className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground"
            disabled={!selectedModel || !canWrite}
          >
            新建
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-auto p-4">
        {listError ? (
          <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{listError}</div>
        ) : null}
        {loadingList ? <div className="text-sm text-muted-foreground">加载中…</div> : null}
        {!loadingList && selectedModel ? (
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
                  const id = String(item[selectedModel.primaryKey] ?? "");
                  return (
                    <tr key={id} className="border-t align-top hover:bg-muted/30">
                      {columns.map((column) => {
                        const field = selectedModel.fields.find((entry) => entry.name === column);
                        const value = item[column];
                        const isFk = Boolean(field?.isForeignKey && field.relationTo && value);
                        return (
                          <td key={column} className="max-w-[16rem] px-3 py-2">
                            {isFk ? (
                              field?.relationTo === "Novel" ? (
                                <Link to={`/novels/${encodeURIComponent(String(value))}`} className="text-sky-700 underline">
                                  {displayCell(value)}
                                </Link>
                              ) : (
                                <Link
                                  to={`/models/${field?.relationTo}/${encodeURIComponent(String(value))}`}
                                  className="text-sky-700 underline"
                                >
                                  {displayCell(value)}
                                </Link>
                              )
                            ) : (
                              <span className="break-all">{displayCell(value)}</span>
                            )}
                          </td>
                        );
                      })}
                      <td className="whitespace-nowrap px-3 py-2">
                        {selectedModel.name === "Novel" ? (
                          <Link to={`/novels/${id}`} className="mr-2 text-sky-700 underline">
                            工作台
                          </Link>
                        ) : null}
                        <button
                          type="button"
                          className="mr-2 text-sky-700 underline"
                          onClick={() => {
                            void copyText(id).then((ok) => setCopyHint(ok ? "已复制 ID" : "复制失败"));
                          }}
                        >
                          复制ID
                        </button>
                        {canWrite ? (
                          <>
                            <button type="button" className="mr-2 text-sky-700 underline" onClick={() => void openEdit(id)}>
                              编辑
                            </button>
                            <button type="button" className="text-destructive underline" onClick={() => setDeleteTargetId(id)}>
                              删除
                            </button>
                          </>
                        ) : (
                          <button type="button" className="mr-2 text-sky-700 underline" onClick={() => void openEdit(id)}>
                            查看
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={columns.length + 1} className="px-3 py-8 text-center text-muted-foreground">
                      暂无数据
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        ) : null}

        <div className="mt-4 flex items-center justify-between text-sm">
          <span className="text-muted-foreground">共 {total} 条</span>
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
      </div>

      {drawer && selectedModel ? (
        <div className="fixed inset-0 z-40 flex justify-end bg-black/30">
          <div className="flex h-full w-full max-w-3xl flex-col bg-white shadow-xl">
            <div className="border-b px-4 py-3">
              <h2 className="font-semibold">
                {drawer === "create" ? `新建 ${selectedModel.name}` : `编辑 ${selectedModel.name}`}
              </h2>
              <p className="text-xs text-muted-foreground">
                {drawer === "edit" ? `ID: ${editingId}` : "仅写入标量字段；关系字段通过外键 ID 维护。"}
              </p>
            </div>
            <div className="min-h-0 flex-1">
              <RecordForm
                key={`${drawer}-${editingId ?? "new"}`}
                model={selectedModel}
                mode={drawer === "create" ? "create" : "edit"}
                initialValues={editingRecord ?? undefined}
                submitting={submitting}
                readOnly={!canWrite}
                onCancel={() => {
                  setDrawer(null);
                  if (recordId && selectedModelName) {
                    navigate(`/models/${selectedModelName}`);
                  }
                }}
                onSubmit={async (values) => {
                  setSubmitting(true);
                  try {
                    if (drawer === "create") {
                      await createAdminRecord(selectedModel.name, values);
                    } else if (editingId) {
                      await updateAdminRecord(selectedModel.name, editingId, values);
                    }
                    setDrawer(null);
                    if (recordId && selectedModelName) {
                      navigate(`/models/${selectedModelName}`);
                    }
                    const presets = getStatusPresets(selectedModel.name);
                    const preset = presets.find((item) => item.id === statusPresetId) ?? presets[0];
                    const result = await fetchAdminList(selectedModel.name, {
                      page,
                      pageSize: 20,
                      q: q || undefined,
                      where: buildStatusWhere(preset),
                    });
                    setItems(result.items);
                    setTotal(result.total);
                  } finally {
                    setSubmitting(false);
                  }
                }}
              />
            </div>
          </div>
        </div>
      ) : null}

      {deleteTargetId && selectedModel ? (
        <DeleteConfirmDialog
          model={selectedModel.name}
          id={deleteTargetId}
          onCancel={() => setDeleteTargetId(null)}
          onDeleted={() => {
            const id = deleteTargetId;
            setDeleteTargetId(null);
            setItems((prev) => prev.filter((item) => String(item[selectedModel.primaryKey]) !== id));
            setTotal((prev) => Math.max(0, prev - 1));
          }}
        />
      ) : null}

      {batchOpen && selectedModel ? (
        <BatchOpsDialog
          model={selectedModel.name}
          baseWhere={batchBaseWhere}
          onCancel={() => setBatchOpen(false)}
          onDone={() => {
            setBatchOpen(false);
            const presets = getStatusPresets(selectedModel.name);
            const preset = presets.find((item) => item.id === statusPresetId) ?? presets[0];
            void fetchAdminList(selectedModel.name, {
              page,
              pageSize: 20,
              q: q || undefined,
              where: buildStatusWhere(preset),
            }).then((result) => {
              setItems(result.items);
              setTotal(result.total);
            });
          }}
        />
      ) : null}
    </AdminShell>
  );
}
