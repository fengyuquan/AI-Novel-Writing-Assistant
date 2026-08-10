import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Chapter } from "@ai-novel/shared/types/novel";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import {
  auditNovelChapter,
  getChapterAuditReports,
  resolveAuditIssue,
} from "@/api/novel";
import { queryKeys } from "@/api/queryKeys";
import { toast } from "@/components/ui/toast";
import type { ChapterEditorAuditResult } from "../ChapterEditorAuditPanel";
import { buildLightAuditExcerpt } from "../chapterEditorPageHelpers";
import type { ChapterEditorSelectionRange } from "../chapterEditorTypes";

type LlmSelection = {
  provider?: LLMProvider;
  model?: string;
};

export function useChapterEditorAuditActions(params: {
  novelId: string;
  chapter: Chapter | undefined;
  contentDraft: string;
  selection: ChapterEditorSelectionRange | null;
  llm: LlmSelection;
  onInvalidateRelated: () => Promise<void>;
  resetToken: string;
}) {
  const {
    novelId,
    chapter,
    contentDraft,
    selection,
    llm,
    onInvalidateRelated,
    resetToken,
  } = params;
  const queryClient = useQueryClient();
  const [auditResult, setAuditResult] = useState<ChapterEditorAuditResult | null>(null);
  const [auditErrorMessage, setAuditErrorMessage] = useState<string | null>(null);

  const chapterAuditReportsQuery = useQuery({
    queryKey: queryKeys.novels.chapterAuditReports(novelId, chapter?.id || "none"),
    queryFn: () => getChapterAuditReports(novelId, chapter!.id),
    enabled: Boolean(novelId && chapter?.id),
  });

  useEffect(() => {
    setAuditResult(null);
    setAuditErrorMessage(null);
  }, [resetToken]);

  useEffect(() => {
    if (auditResult) {
      return;
    }
    const reports = chapterAuditReportsQuery.data?.data ?? [];
    if (reports.length === 0) {
      return;
    }
    const overallScore = reports.find((report) => typeof report.overallScore === "number")?.overallScore ?? 0;
    setAuditResult({
      score: {
        coherence: overallScore,
        repetition: overallScore,
        pacing: overallScore,
        voice: overallScore,
        engagement: overallScore,
        overall: overallScore,
      },
      issues: [],
      auditReports: reports,
    });
  }, [auditResult, chapterAuditReportsQuery.data?.data]);

  const applyAuditResponse = async (
    response: Awaited<ReturnType<typeof auditNovelChapter>>,
    successMessage: string,
  ) => {
    const data = response.data;
    if (!data) {
      setAuditErrorMessage("审校未返回结果，请重试。");
      return;
    }
    setAuditResult({
      score: data.score,
      issues: data.issues,
      auditReports: data.auditReports,
    });
    setAuditErrorMessage(null);
    toast.success(successMessage);
    if (!chapter) {
      return;
    }
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.novels.chapterAuditReports(novelId, chapter.id) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.novels.chapterEditorWorkspace(novelId, chapter.id) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.novels.qualityReport(novelId) }),
      onInvalidateRelated(),
    ]);
  };

  const fullAuditMutation = useMutation({
    mutationFn: async () => {
      if (!chapter) {
        throw new Error("当前未选中章节。");
      }
      if (!contentDraft.trim()) {
        throw new Error("当前正文为空，请先写入或粘贴章节内容再审校。");
      }
      return auditNovelChapter(novelId, chapter.id, "full", {
        provider: llm.provider,
        model: llm.model,
        temperature: 0.1,
        content: contentDraft,
      });
    },
    onMutate: () => {
      setAuditErrorMessage(null);
    },
    onSuccess: async (response) => {
      await applyAuditResponse(response, "完整审校已完成，可在保存按钮下方查看问题。");
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "完整审校失败，请重试。";
      setAuditErrorMessage(message);
      toast.error(message);
    },
  });

  const lightAuditMutation = useMutation({
    mutationFn: async () => {
      if (!chapter) {
        throw new Error("当前未选中章节。");
      }
      const { excerpt, label } = buildLightAuditExcerpt(contentDraft, selection);
      if (!excerpt.trim()) {
        throw new Error("当前正文为空，请先写入内容再轻审。");
      }
      return {
        response: await auditNovelChapter(novelId, chapter.id, "mode_fit", {
          provider: llm.provider,
          model: llm.model,
          temperature: 0.1,
          content: excerpt,
        }),
        label,
      };
    },
    onMutate: () => {
      setAuditErrorMessage(null);
    },
    onSuccess: async ({ response, label }) => {
      await applyAuditResponse(response, `轻审（${label}）已完成，可在保存按钮下方查看问题。`);
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "轻审失败，请重试。";
      setAuditErrorMessage(message);
      toast.error(message);
    },
  });

  const resolveIssueMutation = useMutation({
    mutationFn: async (issueId: string) => {
      if (!chapter) {
        throw new Error("当前未选中章节。");
      }
      return resolveAuditIssue(novelId, issueId);
    },
    onSuccess: async (_response, issueId) => {
      setAuditResult((current) => {
        if (!current) {
          return current;
        }
        return {
          ...current,
          auditReports: current.auditReports.map((report) => ({
            ...report,
            issues: report.issues.map((issue) => (
              issue.id === issueId ? { ...issue, status: "resolved" as const } : issue
            )),
          })),
        };
      });
      toast.success("已将该问题标为已处理。");
      if (chapter) {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: queryKeys.novels.chapterAuditReports(novelId, chapter.id) }),
          queryClient.invalidateQueries({ queryKey: queryKeys.novels.chapterEditorWorkspace(novelId, chapter.id) }),
        ]);
      }
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "标记已处理失败，请重试。");
    },
  });

  return {
    auditResult,
    auditErrorMessage,
    fullAuditMutation,
    lightAuditMutation,
    resolveIssueMutation,
  };
}
