import { useEffect, useMemo, useState } from "react";
import { RecordForm } from "@/components/RecordForm";
import {
  fetchAdminMeta,
  fetchAdminRecord,
  updateAdminRecord,
  type AdminModelMeta,
  type NovelWorkspacePayload,
  type WorkspaceCharacterCard,
} from "@/lib/api";

interface CharactersPanelProps {
  novelId: string;
  workspace: NovelWorkspacePayload;
  onWorkspaceRefresh: () => Promise<void> | void;
}

type GroupMode = "relation" | "faction" | "flat";

function blurb(text: string | null | undefined, fallback = "暂无"): string {
  const value = (text || "").trim();
  if (!value) return fallback;
  return value.length > 120 ? `${value.slice(0, 120)}…` : value;
}

function groupKey(character: WorkspaceCharacterCard, mode: GroupMode): string {
  if (mode === "faction") {
    return character.factionLabel?.trim() || "未标注阵营";
  }
  if (mode === "relation") {
    return character.relationToProtagonist?.trim() || "未标注与主角关系";
  }
  return "全部角色";
}

export function CharactersPanel(props: CharactersPanelProps) {
  const [selected, setSelected] = useState<WorkspaceCharacterCard | null>(null);
  const [model, setModel] = useState<AdminModelMeta | null>(null);
  const [editRecord, setEditRecord] = useState<Record<string, unknown> | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [groupMode, setGroupMode] = useState<GroupMode>("relation");

  useEffect(() => {
    void fetchAdminMeta()
      .then((meta) => setModel(meta.models.find((item) => item.name === "Character") ?? null))
      .catch(() => setModel(null));
  }, []);

  const groups = useMemo(() => {
    const map = new Map<string, WorkspaceCharacterCard[]>();
    for (const character of props.workspace.characters) {
      const key = groupKey(character, groupMode);
      const list = map.get(key) ?? [];
      list.push(character);
      map.set(key, list);
    }
    return [...map.entries()].sort((left, right) => left[0].localeCompare(right[0], "zh-CN"));
  }, [groupMode, props.workspace.characters]);

  async function openEdit(card: WorkspaceCharacterCard) {
    if (!model) return;
    const result = await fetchAdminRecord("Character", card.id);
    setSelected(card);
    setEditRecord(result.item);
  }

  return (
    <div className="flex-1 overflow-auto p-4 sm:p-6">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">角色</h2>
          <p className="text-sm text-muted-foreground">按与主角关系或阵营分组浏览；点开后可轻量编辑。</p>
        </div>
        <div className="flex gap-1 rounded-md bg-muted p-1 text-xs">
          {(
            [
              ["relation", "按关系"],
              ["faction", "按阵营"],
              ["flat", "平铺"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setGroupMode(id)}
              className={`rounded px-2.5 py-1.5 ${groupMode === id ? "bg-white font-medium shadow-sm" : "text-muted-foreground"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-6">
        {groups.map(([groupName, characters]) => (
          <section key={groupName}>
            {groupMode !== "flat" ? (
              <h3 className="mb-3 text-sm font-semibold text-muted-foreground">
                {groupName}
                <span className="ml-2 font-normal">({characters.length})</span>
              </h3>
            ) : null}
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {characters.map((character) => (
                <button
                  key={character.id}
                  type="button"
                  onClick={() => void openEdit(character)}
                  className="rounded-xl border bg-[hsl(var(--card-surface))] p-4 text-left shadow-sm transition hover:border-sky-300 hover:shadow"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-lg font-semibold tracking-tight">{character.name}</div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {[character.role, character.castRole, character.identityLabel].filter(Boolean).join(" · ") ||
                          "角色"}
                      </div>
                    </div>
                    <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                      {character.gender}
                    </span>
                  </div>
                  <p className="mt-3 text-sm leading-relaxed text-foreground/85">
                    {blurb(character.firstImpression || character.personality)}
                  </p>
                  <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                    <div>关系：{blurb(character.relationToProtagonist, "—")}</div>
                    <div>阵营：{blurb(character.factionLabel, "—")}</div>
                    <div>近况：{blurb(character.currentState, "—")}</div>
                    <div>目标：{blurb(character.currentGoal, "—")}</div>
                  </div>
                </button>
              ))}
            </div>
          </section>
        ))}
        {props.workspace.characters.length === 0 ? (
          <div className="rounded-lg border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
            暂无角色数据
          </div>
        ) : null}
      </div>

      {selected && model && editRecord ? (
        <div className="fixed inset-0 z-40 flex justify-end bg-black/30">
          <div className="flex h-full w-full max-w-2xl flex-col bg-white shadow-xl">
            <div className="border-b px-4 py-3">
              <h2 className="font-semibold">{selected.name}</h2>
              <p className="text-xs text-muted-foreground">编辑角色关键字段</p>
            </div>
            <div className="min-h-0 flex-1">
              <RecordForm
                model={model}
                mode="edit"
                initialValues={editRecord}
                submitting={submitting}
                onCancel={() => {
                  setSelected(null);
                  setEditRecord(null);
                }}
                onSubmit={async (values) => {
                  setSubmitting(true);
                  try {
                    await updateAdminRecord("Character", selected.id, { ...values, novelId: props.novelId });
                    setSelected(null);
                    setEditRecord(null);
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
