import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Chapter } from "@ai-novel/shared/types/novel";
import {
  createNovelSnapshot,
  getNovelCharacters,
  listNovelSnapshots,
  restoreNovelSnapshot,
} from "@/api/novel";
import { queryKeys } from "@/api/queryKeys";
import AiButton from "@/components/common/AiButton";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import type { ChapterEditorSelectionRange } from "../chapterEditorTypes";
import { buildWordCountHint } from "../chapterEditorPageHelpers";
import {
  SELF_CHECK_ITEMS,
  STUCK_DIRECTIONS,
  buildTaskBulletHints,
  buildWritingCheckpoints,
  detectAwkwardWritingHints,
  type WritingCheckpointKey,
} from "./writingAidUtils";
import {
  loadCheckpointManual,
  loadSelfChecklist,
  saveCheckpointManual,
  saveSelfChecklist,
  type CheckpointManualState,
  type SelfChecklistState,
} from "./writingAidsStorage";

interface WritingAidsPanelProps {
  novelId: string;
  chapter: Chapter;
  contentDraft: string;
  wordCount: number;
  isGeneratingStuck: boolean;
  onStuckDirection: (directionId: string) => void;
  onLocateRange: (range: ChapterEditorSelectionRange) => void;
  onRefreshAfterRestore: () => Promise<void>;
}

function Section(props: { title: string; hint?: string; children: ReactNode }) {
  return (
    <div className="shrink-0 rounded-3xl border border-border/70 bg-background p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="text-sm font-medium text-foreground">{props.title}</div>
        {props.hint ? <span className="text-xs text-muted-foreground">{props.hint}</span> : null}
      </div>
      {props.children}
    </div>
  );
}

export default function WritingAidsPanel(props: WritingAidsPanelProps) {
  const {
    novelId,
    chapter,
    contentDraft,
    wordCount,
    isGeneratingStuck,
    onStuckDirection,
    onLocateRange,
    onRefreshAfterRestore,
  } = props;

  const queryClient = useQueryClient();
  const [checklist, setChecklist] = useState<SelfChecklistState>({});
  const [checkpoints, setCheckpoints] = useState<CheckpointManualState>({
    open: false,
    mid: false,
    end: false,
  });
  const [sprintMinutes, setSprintMinutes] = useState(15);
  const [sprintRemaining, setSprintRemaining] = useState<number | null>(null);

  useEffect(() => {
    setChecklist(loadSelfChecklist(chapter.id));
    setCheckpoints(loadCheckpointManual(chapter.id));
  }, [chapter.id]);

  useEffect(() => {
    if (sprintRemaining == null) {
      return;
    }
    if (sprintRemaining <= 0) {
      setSprintRemaining(null);
      toast.success("冲刺时间到。可以先轻审或检查章末钩子。");
      return;
    }
    const timer = window.setTimeout(() => {
      setSprintRemaining((current) => (current == null ? null : current - 1));
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [sprintRemaining]);

  const charactersQuery = useQuery({
    queryKey: queryKeys.novels.characters(novelId),
    queryFn: () => getNovelCharacters(novelId),
    enabled: Boolean(novelId),
  });

  const snapshotsQuery = useQuery({
    queryKey: queryKeys.novels.snapshots(novelId),
    queryFn: () => listNovelSnapshots(novelId),
    enabled: Boolean(novelId),
  });

  const createSnapshotMutation = useMutation({
    mutationFn: () => createNovelSnapshot(novelId, {
      triggerType: "manual",
      label: `chapter-editor:${chapter.order}:${Date.now()}`,
    }),
    onSuccess: async () => {
      toast.success("已保存当前书稿快照。");
      await queryClient.invalidateQueries({ queryKey: queryKeys.novels.snapshots(novelId) });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "创建快照失败。");
    },
  });

  const restoreSnapshotMutation = useMutation({
    mutationFn: (snapshotId: string) => restoreNovelSnapshot(novelId, snapshotId),
    onSuccess: async () => {
      toast.success("已恢复快照，正在刷新章节内容。");
      await onRefreshAfterRestore();
      await queryClient.invalidateQueries({ queryKey: queryKeys.novels.snapshots(novelId) });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "恢复快照失败。");
    },
  });

  const wordHint = buildWordCountHint(wordCount, chapter.targetWordCount);
  const taskBullets = useMemo(() => buildTaskBulletHints(chapter.taskSheet), [chapter.taskSheet]);
  const autoCheckpoints = useMemo(() => buildWritingCheckpoints(contentDraft), [contentDraft]);
  const awkwardHints = useMemo(() => detectAwkwardWritingHints(contentDraft), [contentDraft]);
  const checklistDone = SELF_CHECK_ITEMS.filter((item) => checklist[item.id]).length;
  const checkpointDone = autoCheckpoints.filter((item) => checkpoints[item.key] || item.autoPass).length;
  const progressPercent = Math.round(
    (
      (typeof chapter.targetWordCount === "number" && chapter.targetWordCount > 0
        ? Math.min(1, wordCount / chapter.targetWordCount)
        : Math.min(1, wordCount / 2000))
      * 0.5
      + (checklistDone / SELF_CHECK_ITEMS.length) * 0.25
      + (checkpointDone / 3) * 0.25
    ) * 100,
  );

  const characters = useMemo(() => {
    const all = charactersQuery.data?.data ?? [];
    const mentioned = all.filter((character) => {
      const name = character.name?.trim();
      return name ? contentDraft.includes(name) : false;
    });
    return (mentioned.length > 0 ? mentioned : all).slice(0, 4);
  }, [charactersQuery.data?.data, contentDraft]);

  const recentSnapshots = (snapshotsQuery.data?.data ?? []).slice(0, 6);

  const updateChecklist = (id: string, checked: boolean) => {
    const next = { ...checklist, [id]: checked };
    setChecklist(next);
    saveSelfChecklist(chapter.id, next);
  };

  const toggleCheckpoint = (key: WritingCheckpointKey) => {
    const next = { ...checkpoints, [key]: !checkpoints[key] };
    setCheckpoints(next);
    saveCheckpointManual(chapter.id, next);
  };

  const sprintLabel = sprintRemaining == null
    ? null
    : `${String(Math.floor(sprintRemaining / 60)).padStart(2, "0")}:${String(sprintRemaining % 60).padStart(2, "0")}`;

  return (
    <>
      <Section title="本章完成度" hint={`${progressPercent}%`}>
        <div className="space-y-2">
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-foreground/80 transition-all" style={{ width: `${progressPercent}%` }} />
          </div>
          <div className="text-xs leading-5 text-muted-foreground">
            {wordHint.chipLabel} · 自检 {checklistDone}/{SELF_CHECK_ITEMS.length} · 检查点 {checkpointDone}/3
          </div>
          <div className="text-xs leading-5 text-muted-foreground">{wordHint.detail}</div>
        </div>
      </Section>

      <Section title="本章任务单" hint="写的时候对照">
        <div className="space-y-2 text-sm leading-6 text-muted-foreground">
          {chapter.expectation?.trim() ? (
            <div>
              <div className="font-medium text-foreground">章节目标</div>
              <div>{chapter.expectation.trim()}</div>
            </div>
          ) : null}
          {chapter.mustAvoid?.trim() ? (
            <div>
              <div className="font-medium text-foreground">禁止事项</div>
              <div>{chapter.mustAvoid.trim()}</div>
            </div>
          ) : null}
          {taskBullets.length > 0 ? (
            <ul className="list-disc space-y-1 pl-4">
              {taskBullets.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          ) : chapter.taskSheet?.trim() ? (
            <div className="whitespace-pre-wrap">{chapter.taskSheet.trim()}</div>
          ) : (
            <div>还没有任务单，可先按章节目标写，再到节奏页补任务。</div>
          )}
        </div>
      </Section>

      <Section title="开篇 / 中段 / 结尾" hint="可手动勾选">
        <div className="space-y-2">
          {autoCheckpoints.map((item) => {
            const done = checkpoints[item.key] || item.autoPass;
            return (
              <label
                key={item.key}
                className={`flex cursor-pointer items-start gap-2 rounded-2xl border px-3 py-2 text-sm ${
                  done ? "border-emerald-200 bg-emerald-50/70" : "border-border/70 bg-muted/10"
                }`}
              >
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={done}
                  onChange={() => toggleCheckpoint(item.key)}
                />
                <span>
                  <span className="font-medium text-foreground">{item.label}</span>
                  <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                    {item.hint}
                    {item.autoPass && !checkpoints[item.key] ? " · 系统初步判断已具备" : ""}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      </Section>

      <Section title="卡住了？" hint="给下一句方向">
        <div className="space-y-2">
          <div className="text-xs leading-5 text-muted-foreground">
            会基于章末上文生成可直接接上的续写候选；选好方向后到右侧比较再接受。
          </div>
          <div className="grid grid-cols-1 gap-2">
            {STUCK_DIRECTIONS.map((direction) => (
              <AiButton
                key={direction.id}
                size="sm"
                variant="outline"
                className="w-full"
                disabled={isGeneratingStuck || !contentDraft.trim()}
                onClick={() => onStuckDirection(direction.id)}
              >
                {isGeneratingStuck ? "生成中..." : direction.label}
              </AiButton>
            ))}
          </div>
        </div>
      </Section>

      <Section title="人设与口吻" hint="防 OOC">
        {charactersQuery.isLoading ? (
          <div className="text-sm text-muted-foreground">正在加载角色...</div>
        ) : characters.length === 0 ? (
          <div className="text-sm text-muted-foreground">本书还没有角色卡，可先到角色页补充。</div>
        ) : (
          <div className="space-y-2">
            {characters.map((character) => (
              <div key={character.id} className="rounded-2xl border border-border/70 bg-muted/10 px-3 py-2 text-sm">
                <div className="font-medium text-foreground">{character.name}</div>
                <div className="mt-1 text-xs leading-5 text-muted-foreground">
                  {[
                    character.personality?.trim() ? `性格：${character.personality.trim()}` : null,
                    character.voiceTexture?.trim() ? `口吻：${character.voiceTexture.trim()}` : null,
                    character.currentGoal?.trim() ? `目标：${character.currentGoal.trim()}` : null,
                    Array.isArray(character.prohibitions) && character.prohibitions.length > 0
                      ? `禁忌：${character.prohibitions.slice(0, 3).join("、")}`
                      : null,
                  ].filter(Boolean).join(" · ") || "暂无详细口吻设定"}
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="写完自检" hint="不耗 AI">
        <div className="space-y-2">
          {SELF_CHECK_ITEMS.map((item) => (
            <label key={item.id} className="flex cursor-pointer items-start gap-2 text-sm leading-6">
              <input
                type="checkbox"
                className="mt-1"
                checked={Boolean(checklist[item.id])}
                onChange={(event) => updateChecklist(item.id, event.target.checked)}
              />
              <span className="text-muted-foreground">{item.label}</span>
            </label>
          ))}
        </div>
      </Section>

      <Section title="短时冲刺" hint="专注推进">
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            {[15, 25].map((minutes) => (
              <Button
                key={minutes}
                size="sm"
                variant={sprintMinutes === minutes ? "default" : "outline"}
                onClick={() => setSprintMinutes(minutes)}
                disabled={sprintRemaining != null}
              >
                {minutes} 分钟
              </Button>
            ))}
          </div>
          <div className="text-sm text-muted-foreground">
            {sprintLabel ? `剩余 ${sprintLabel}` : "到点会提醒你去轻审或检查章末钩子。"}
          </div>
          <div className="flex gap-2">
            {sprintRemaining == null ? (
              <Button size="sm" onClick={() => setSprintRemaining(sprintMinutes * 60)}>
                开始冲刺
              </Button>
            ) : (
              <Button size="sm" variant="outline" onClick={() => setSprintRemaining(null)}>
                结束冲刺
              </Button>
            )}
          </div>
        </div>
      </Section>

      <Section title="听感提示" hint="朗读在正文顶栏">
        <div className="space-y-2">
          {awkwardHints.length > 0 ? (
            <div className="space-y-2">
              {awkwardHints.map((hint) => (
                <div key={hint.id} className="rounded-2xl border border-amber-200 bg-amber-50/80 px-3 py-2 text-xs leading-5 text-amber-950">
                  <div className="font-medium">{hint.message}</div>
                  <div className="mt-1 opacity-80">片段：{hint.excerpt}</div>
                  <div className="mt-1 opacity-80">建议：{hint.fixSuggestion}</div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-2 h-7"
                    onClick={() => {
                      const index = contentDraft.indexOf(hint.excerpt);
                      if (index >= 0) {
                        onLocateRange({
                          from: index,
                          to: index + hint.excerpt.length,
                          text: hint.excerpt,
                        });
                      }
                    }}
                  >
                    定位到正文
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-xs text-muted-foreground">
              暂无明显拗口提示。可在正文顶栏朗读，边听边改。
            </div>
          )}
        </div>
      </Section>

      <Section title="改前快照" hint="可回退">
        <div className="space-y-2">
          <Button
            size="sm"
            variant="outline"
            className="w-full"
            disabled={createSnapshotMutation.isPending}
            onClick={() => createSnapshotMutation.mutate()}
          >
            {createSnapshotMutation.isPending ? "保存中..." : "保存当前快照"}
          </Button>
          {recentSnapshots.length === 0 ? (
            <div className="text-xs text-muted-foreground">还没有快照。大改前先存一份更安心。</div>
          ) : (
            <div className="space-y-2">
              {recentSnapshots.map((snapshot) => (
                <div key={snapshot.id} className="rounded-2xl border border-border/70 bg-muted/10 px-3 py-2 text-xs">
                  <div className="font-medium text-foreground">
                    {snapshot.label || snapshot.triggerType}
                  </div>
                  <div className="mt-1 text-muted-foreground">
                    {new Date(snapshot.createdAt).toLocaleString()}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-2 h-7"
                    disabled={restoreSnapshotMutation.isPending}
                    onClick={() => {
                      if (window.confirm("恢复快照会覆盖当前书稿进度，确定继续吗？")) {
                        restoreSnapshotMutation.mutate(snapshot.id);
                      }
                    }}
                  >
                    恢复此快照
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </Section>
    </>
  );
}
