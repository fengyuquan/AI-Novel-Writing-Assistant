import { useEffect, useMemo, useState } from "react";
import { RecordForm } from "@/components/RecordForm";
import {
  fetchAdminMeta,
  fetchAdminRecord,
  updateAdminRecord,
  type AdminModelMeta,
  type NovelWorkspacePayload,
} from "@/lib/api";

interface OutlinePanelProps {
  novelId: string;
  workspace: NovelWorkspacePayload;
  onWorkspaceRefresh: () => Promise<void> | void;
}

function ReaderBlock(props: { title: string; body: string | null | undefined; empty?: string }) {
  const text = (props.body || "").trim();
  return (
    <section className="reader-prose mb-6 rounded-lg border border-border/70 px-6 py-6 sm:px-8">
      <h2 className="mb-4 text-base font-semibold" style={{ fontFamily: "inherit", textIndent: 0 }}>
        {props.title}
      </h2>
      {text ? (
        text.split(/\n{2,}|\n/).map((line, index) => (
          <p
            key={`${props.title}-${index}`}
            style={line.startsWith("#") || line.startsWith("-") ? { textIndent: 0 } : undefined}
          >
            {line}
          </p>
        ))
      ) : (
        <p className="text-muted-foreground" style={{ textIndent: 0 }}>
          {props.empty || "暂无内容"}
        </p>
      )}
    </section>
  );
}

function StructuredOutlineTree(props: { raw: string | null }) {
  const parsed = useMemo(() => {
    const text = (props.raw || "").trim();
    if (!text) return null;
    try {
      return JSON.parse(text) as unknown;
    } catch {
      return null;
    }
  }, [props.raw]);

  if (!props.raw?.trim()) {
    return (
      <div className="mb-6 rounded-lg border border-dashed px-4 py-6 text-sm text-muted-foreground">
        尚未填写 structuredOutline。
      </div>
    );
  }

  if (!parsed) {
    return <ReaderBlock title="结构化提纲（文本）" body={props.raw} />;
  }

  return (
    <section className="mb-6 rounded-xl border bg-[hsl(var(--card-surface))] p-4">
      <h3 className="mb-3 text-sm font-semibold">结构化提纲</h3>
      <StructuredNode value={parsed} depth={0} />
    </section>
  );
}

function StructuredNode(props: { value: unknown; depth: number; label?: string }) {
  const { value, depth, label } = props;
  if (value === null || value === undefined) return null;

  if (Array.isArray(value)) {
    return (
      <ul className={depth === 0 ? "space-y-2" : "mt-1 space-y-1 border-l border-border/70 pl-3"}>
        {label ? <li className="text-xs font-medium text-muted-foreground">{label}</li> : null}
        {value.map((item, index) => (
          <li key={index}>
            <StructuredNode value={item} depth={depth + 1} />
          </li>
        ))}
      </ul>
    );
  }

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const title =
      (typeof record.title === "string" && record.title) ||
      (typeof record.name === "string" && record.name) ||
      (typeof record.heading === "string" && record.heading) ||
      label ||
      "节点";
    const summary =
      (typeof record.summary === "string" && record.summary) ||
      (typeof record.content === "string" && record.content) ||
      (typeof record.description === "string" && record.description) ||
      null;
    const childrenKeys = Object.keys(record).filter(
      (key) => !["title", "name", "heading", "summary", "content", "description"].includes(key),
    );

    return (
      <div className={depth === 0 ? "" : "py-1"}>
        <div className="text-sm font-medium">{title}</div>
        {summary ? <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{summary}</p> : null}
        {childrenKeys.length > 0 ? (
          <div className="mt-1 space-y-1">
            {childrenKeys.map((key) => (
              <StructuredNode key={key} value={record[key]} depth={depth + 1} label={key} />
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="text-xs text-muted-foreground">
      {label ? <span className="font-medium text-foreground/80">{label}：</span> : null}
      {String(value)}
    </div>
  );
}

export function OutlinePanel(props: OutlinePanelProps) {
  const [editing, setEditing] = useState(false);
  const [model, setModel] = useState<AdminModelMeta | null>(null);
  const [record, setRecord] = useState<Record<string, unknown> | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const novel = props.workspace.novel;
  const structured =
    props.workspace.structuredOutline || novel.structuredOutlinePreview;

  useEffect(() => {
    void fetchAdminMeta()
      .then((meta) => setModel(meta.models.find((item) => item.name === "Novel") ?? null))
      .catch(() => setModel(null));
  }, []);

  async function openEdit() {
    if (!model) return;
    const result = await fetchAdminRecord("Novel", props.novelId);
    setRecord(result.item);
    setEditing(true);
  }

  return (
    <div className="flex-1 overflow-auto p-4 sm:p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">大纲与设定</h2>
          <p className="text-sm text-muted-foreground">阅读全书大纲、结构化提纲树与卷规划。</p>
        </div>
        <button type="button" className="rounded-md border bg-white px-3 py-1.5 text-sm" onClick={() => void openEdit()}>
          编辑小说大纲字段
        </button>
      </div>

      {props.workspace.volumes.length > 0 ? (
        <section className="mb-6 rounded-xl border bg-[hsl(var(--card-surface))] p-4">
          <h3 className="mb-3 text-sm font-semibold">卷规划树</h3>
          <ol className="space-y-3 border-l border-border/70 pl-4">
            {props.workspace.volumes.map((volume) => (
              <li key={volume.id}>
                <div className="text-sm font-medium">
                  卷 {volume.sortOrder} · {volume.title}
                  <span className="ml-2 text-xs text-muted-foreground">{volume.status}</span>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  {volume.summary || "无摘要"}
                </p>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      <StructuredOutlineTree raw={structured} />
      <ReaderBlock title="故事大纲" body={novel.outline} empty="尚未填写 outline。" />

      {props.workspace.bible ? (
        <>
          <ReaderBlock title="核心设定" body={props.workspace.bible.coreSetting} />
          <ReaderBlock title="主承诺" body={props.workspace.bible.mainPromise} />
          <ReaderBlock title="角色弧线" body={props.workspace.bible.characterArcs} />
          <ReaderBlock title="世界规则" body={props.workspace.bible.worldRules} />
        </>
      ) : (
        <div className="mb-6 rounded-lg border border-dashed px-4 py-6 text-sm text-muted-foreground">
          暂无 NovelBible
        </div>
      )}

      {editing && model && record ? (
        <div className="fixed inset-0 z-40 flex justify-end bg-black/30">
          <div className="flex h-full w-full max-w-3xl flex-col bg-white shadow-xl">
            <div className="border-b px-4 py-3">
              <h2 className="font-semibold">编辑小说大纲字段</h2>
            </div>
            <div className="min-h-0 flex-1">
              <RecordForm
                model={model}
                mode="edit"
                initialValues={record}
                submitting={submitting}
                onCancel={() => setEditing(false)}
                onSubmit={async (values) => {
                  setSubmitting(true);
                  try {
                    await updateAdminRecord("Novel", props.novelId, values);
                    setEditing(false);
                    await props.onWorkspaceRefresh();
                  } finally {
                    setSubmitting(false);
                  }
                }}
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
