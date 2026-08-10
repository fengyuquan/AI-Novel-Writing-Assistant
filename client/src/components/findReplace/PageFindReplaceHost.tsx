import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import {
  collectEditableTargets,
  collectMatches,
  focusTargetMatch,
  readTargetText,
  replaceAllAcrossTargets,
  replaceAllInText,
  resolveSearchRoot,
  writeTargetText,
  type EditableTarget,
  type FindMatch,
} from "./pageFindReplaceLogic";

export const OPEN_PAGE_FIND_REPLACE_EVENT = "ai-novel:open-page-find-replace";

export function openPageFindReplace(): void {
  window.dispatchEvent(new CustomEvent(OPEN_PAGE_FIND_REPLACE_EVENT));
}

function isTypingInFindPanel(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  return Boolean(target.closest("[data-find-replace-panel='true']"));
}

/**
 * 页面级查找替换：覆盖当前页 main 内所有可见 input / textarea / contenteditable。
 * 通过 Ctrl/Cmd+H 或 openPageFindReplace() 打开浮动面板（不抢焦点 modal）。
 */
export default function PageFindReplaceHost() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [replacement, setReplacement] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [targets, setTargets] = useState<EditableTarget[]>([]);
  const [matches, setMatches] = useState<FindMatch[]>([]);
  const [activeMatchIndex, setActiveMatchIndex] = useState(0);

  const flags = useMemo(() => ({ caseSensitive }), [caseSensitive]);

  const refreshTargetsAndMatches = useCallback((nextQuery = query) => {
    const nextTargets = collectEditableTargets(resolveSearchRoot());
    const nextMatches = collectMatches(nextTargets, nextQuery, { caseSensitive });
    setTargets(nextTargets);
    setMatches(nextMatches);
    setActiveMatchIndex((current) => {
      if (nextMatches.length === 0) {
        return 0;
      }
      return Math.min(current, nextMatches.length - 1);
    });
    return { nextTargets, nextMatches };
  }, [caseSensitive, query]);

  useEffect(() => {
    if (!open) {
      return;
    }
    refreshTargetsAndMatches();
  }, [open, query, caseSensitive, refreshTargetsAndMatches]);

  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener(OPEN_PAGE_FIND_REPLACE_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_PAGE_FIND_REPLACE_EVENT, onOpen);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      const isMod = event.ctrlKey || event.metaKey;

      if (isMod && key === "h") {
        event.preventDefault();
        setOpen(true);
        return;
      }
      if (event.key === "Escape" && open) {
        event.preventDefault();
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  const jumpToMatch = useCallback((index: number, list: FindMatch[] = matches, listTargets: EditableTarget[] = targets) => {
    if (list.length === 0) {
      return;
    }
    const normalized = ((index % list.length) + list.length) % list.length;
    const match = list[normalized];
    const target = listTargets.find((item) => item.id === match.targetId);
    if (!target) {
      return;
    }
    setActiveMatchIndex(normalized);
    focusTargetMatch(target, match.start, match.end);
  }, [matches, targets]);

  const handleFindNext = () => {
    const { nextTargets, nextMatches } = refreshTargetsAndMatches();
    if (nextMatches.length === 0) {
      toast.error("未找到匹配内容");
      return;
    }
    jumpToMatch(activeMatchIndex + (matches.length > 0 ? 1 : 0), nextMatches, nextTargets);
  };

  const handleReplaceOne = () => {
    const { nextTargets, nextMatches } = refreshTargetsAndMatches();
    if (nextMatches.length === 0) {
      toast.error("没有可替换的匹配项");
      return;
    }
    const index = Math.min(activeMatchIndex, nextMatches.length - 1);
    const match = nextMatches[index];
    const target = nextTargets.find((item) => item.id === match.targetId);
    if (!target) {
      return;
    }
    const current = readTargetText(target);
    const before = current.slice(0, match.start);
    const after = current.slice(match.end);
    const matched = current.slice(match.start, match.end);
    const nextText = `${before}${replacement}${after}`;
    if (!writeTargetText(target, nextText)) {
      toast.error("替换失败：当前编辑区域无法写入");
      return;
    }
    toast.success(`已替换 1 处：「${matched}」→「${replacement || "（空）"}」`);
    const refreshed = refreshTargetsAndMatches();
    if (refreshed.nextMatches.length > 0) {
      jumpToMatch(index, refreshed.nextMatches, refreshed.nextTargets);
    }
  };

  const handleReplaceAll = () => {
    if (!query) {
      toast.error("请先输入要查找的文字");
      return;
    }
    const nextTargets = collectEditableTargets(resolveSearchRoot());
    const previewCount = nextTargets.reduce((sum, target) => {
      return sum + replaceAllInText(readTargetText(target), query, replacement, flags).replacedCount;
    }, 0);
    if (previewCount === 0) {
      toast.error("未找到可替换内容");
      setTargets(nextTargets);
      setMatches([]);
      return;
    }
    const result = replaceAllAcrossTargets(nextTargets, query, replacement, flags);
    refreshTargetsAndMatches();
    toast.success(`已全部替换 ${result.replacedCount} 处（涉及 ${result.affectedTargets} 个编辑区域）`);
  };

  if (!open) {
    return null;
  }

  return (
    <div
      data-find-replace-panel="true"
      className="fixed bottom-4 right-4 z-[80] w-[min(100vw-2rem,24rem)] rounded-xl border border-border/80 bg-background p-3 shadow-xl"
      onKeyDown={(event) => {
        if (event.key === "Enter" && !event.shiftKey && isTypingInFindPanel(event.target)) {
          event.preventDefault();
          handleFindNext();
        }
      }}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="text-sm font-medium text-foreground">页面查找替换</div>
        <button
          type="button"
          className="text-xs text-muted-foreground hover:text-foreground"
          onClick={() => setOpen(false)}
        >
          关闭
        </button>
      </div>
      <p className="mb-3 text-xs text-muted-foreground">
        会处理当前页面里所有可编辑输入框和正文编辑区。快捷键 Ctrl+H。
      </p>

      <div className="space-y-2">
        <label className="block space-y-1">
          <span className="text-xs text-muted-foreground">查找</span>
          <Input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="输入要查找的文字"
          />
        </label>
        <label className="block space-y-1">
          <span className="text-xs text-muted-foreground">替换为</span>
          <Input
            value={replacement}
            onChange={(event) => setReplacement(event.target.value)}
            placeholder="输入替换后的文字，可留空表示删除"
          />
        </label>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={caseSensitive}
            onChange={(event) => setCaseSensitive(event.target.checked)}
          />
          区分大小写
        </label>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" variant="outline" onClick={handleFindNext}>
          查找下一个
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={handleReplaceOne}>
          替换
        </Button>
        <Button type="button" size="sm" onClick={handleReplaceAll}>
          全部替换
        </Button>
      </div>

      <div className="mt-2 text-xs text-muted-foreground">
        {query
          ? `匹配 ${matches.length} 处 · 可编辑区域 ${targets.length} 个`
          : `当前页面可编辑区域 ${targets.length} 个`}
        {matches.length > 0 ? ` · 当前第 ${activeMatchIndex + 1} 处` : ""}
      </div>
    </div>
  );
}
