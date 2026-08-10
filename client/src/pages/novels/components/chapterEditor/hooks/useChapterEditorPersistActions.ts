import { useMutation } from "@tanstack/react-query";
import type { Chapter } from "@ai-novel/shared/types/novel";
import { updateNovelChapter } from "@/api/novel";
import { toast } from "@/components/ui/toast";
import type { ChapterEditorPersistStatus, ChapterEditorSyncStatus } from "../chapterEditorUtils";

export function useChapterEditorPersistActions(params: {
  novelId: string;
  chapter: Chapter | undefined;
  contentDraft: string;
  savedContent: string;
  setSavedContent: (next: string) => void;
  setSyncedContent: (next: string) => void;
  setSaveStatus: (next: ChapterEditorPersistStatus | ((current: ChapterEditorPersistStatus) => ChapterEditorPersistStatus)) => void;
  setSyncStatus: (next: ChapterEditorSyncStatus) => void;
  onSynced: () => Promise<void>;
}) {
  const {
    novelId,
    chapter,
    contentDraft,
    savedContent,
    setSavedContent,
    setSyncedContent,
    setSaveStatus,
    setSyncStatus,
    onSynced,
  } = params;

  const saveMutation = useMutation({
    mutationFn: async (nextContent: string) => {
      if (!chapter) {
        throw new Error("当前未选中章节。");
      }
      return updateNovelChapter(novelId, chapter.id, {
        content: nextContent,
        syncArtifacts: false,
      });
    },
    onMutate: () => {
      setSaveStatus("saving");
    },
    onSuccess: (_response, nextContent) => {
      setSavedContent(nextContent);
      setSaveStatus("saved");
      toast.success("正文已保存。");
    },
    onError: (error) => {
      setSaveStatus("error");
      toast.error(error instanceof Error ? error.message : "章节保存失败。");
    },
  });

  const syncSaveMutation = useMutation({
    mutationFn: async (nextContent: string) => {
      if (!chapter) {
        throw new Error("当前未选中章节。");
      }
      return updateNovelChapter(novelId, chapter.id, {
        content: nextContent,
        syncArtifacts: true,
      });
    },
    onMutate: () => {
      setSyncStatus("syncing");
      setSaveStatus((current) => (contentDraft !== savedContent ? "saving" : current));
    },
    onSuccess: async (_response, nextContent) => {
      setSavedContent(nextContent);
      setSyncedContent(nextContent);
      setSaveStatus("saved");
      setSyncStatus("synced");
      await onSynced();
      toast.success("已同步保存：摘要与检索资料已更新。");
    },
    onError: (error) => {
      setSyncStatus("error");
      setSaveStatus((current) => (current === "saving" ? "error" : current));
      toast.error(error instanceof Error ? error.message : "同步保存失败。");
    },
  });

  return {
    saveMutation,
    syncSaveMutation,
  };
}
