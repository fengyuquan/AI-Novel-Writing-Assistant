import { toast } from "@/components/ui/toast";
import {
  STUCK_DIRECTIONS,
  getTailParagraphSelection,
  locateEvidenceInContent,
} from "../aids/writingAidUtils";
import type { ChapterEditorSelectionRange } from "../chapterEditorTypes";
import type { ChapterEditorRevisionScope } from "@ai-novel/shared/types/novel";

type RunRevision = (
  source: "preset" | "freeform",
  scope: ChapterEditorRevisionScope,
  options?: {
    instruction?: string;
    selectionOverride?: ChapterEditorSelectionRange | null;
  },
) => void;

export function useChapterEditorWritingAssistActions(params: {
  contentDraft: string;
  selection: ChapterEditorSelectionRange | null;
  runRevision: RunRevision;
  setSelection: (range: ChapterEditorSelectionRange | null) => void;
  setSelectedDiagnosticId: (id: string | null) => void;
  setRevisionScope: (scope: ChapterEditorRevisionScope) => void;
  setRevisionInstruction: (value: string) => void;
  setAppendCandidateOnAccept: (value: boolean) => void;
  setMobilePane: (pane: "guide" | "write" | "ai") => void;
  setFocusMode: (value: boolean | ((current: boolean) => boolean)) => void;
}) {
  const {
    contentDraft,
    selection,
    runRevision,
    setSelection,
    setSelectedDiagnosticId,
    setRevisionScope,
    setRevisionInstruction,
    setAppendCandidateOnAccept,
    setMobilePane,
    setFocusMode,
  } = params;

  const handleLocateRange = (range: ChapterEditorSelectionRange) => {
    setSelection(range);
    setSelectedDiagnosticId(null);
    setMobilePane("write");
    setFocusMode(false);
  };

  const handleStuckDirection = (directionId: string) => {
    const direction = STUCK_DIRECTIONS.find((item) => item.id === directionId);
    if (!direction) {
      return;
    }
    const tail = getTailParagraphSelection(contentDraft);
    if (!tail) {
      toast.error("请先写一点正文，再使用卡文续写。");
      return;
    }
    setAppendCandidateOnAccept(true);
    setMobilePane("ai");
    setFocusMode(false);
    setRevisionScope("selection");
    setRevisionInstruction(direction.instruction);
    setSelection(tail);
    runRevision("freeform", "selection", {
      instruction: direction.instruction,
      selectionOverride: tail,
    });
  };

  const handleLocateAuditIssue = (evidence: string, description?: string) => {
    const range = locateEvidenceInContent(contentDraft, evidence, description);
    if (!range) {
      return;
    }
    handleLocateRange(range);
  };

  const handleFixAuditIssue = (fixSuggestion: string, evidence: string, description?: string) => {
    const located = locateEvidenceInContent(contentDraft, evidence, description);
    const target = located ?? selection ?? getTailParagraphSelection(contentDraft);
    if (!target) {
      toast.error("请先选中要修改的正文，或确保章节有内容。");
      return;
    }
    setAppendCandidateOnAccept(false);
    setMobilePane("ai");
    setFocusMode(false);
    setRevisionScope("selection");
    setRevisionInstruction(fixSuggestion);
    setSelection(target);
    runRevision("freeform", "selection", {
      instruction: `请按以下审校建议修改选中正文，保持剧情事实不变：${fixSuggestion}`,
      selectionOverride: target,
    });
  };

  return {
    handleLocateRange,
    handleStuckDirection,
    handleLocateAuditIssue,
    handleFixAuditIssue,
  };
}
