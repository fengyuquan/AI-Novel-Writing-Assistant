import type { ChapterEditorAiWritingDetectIssue, ChapterEditorAiWritingDetectResponse } from "@ai-novel/shared/types/novel";
import AiButton from "@/components/common/AiButton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface ChapterEditorAiWritingDetectPanelProps {
  isDirty: boolean;
  canRun: boolean;
  isRunning: boolean;
  result: ChapterEditorAiWritingDetectResponse | null;
  errorMessage?: string | null;
  onRun: () => void;
  onLocateIssue: (evidence: string, description?: string) => void;
  onFixIssue: (fixSuggestion: string, evidence: string, description?: string) => void;
}

function SeverityBadge({ severity }: { severity: ChapterEditorAiWritingDetectIssue["severity"] }) {
  const variant = severity === "critical" || severity === "high" ? "default" : "secondary";
  return <Badge variant={variant}>{severity}</Badge>;
}

export default function ChapterEditorAiWritingDetectPanel(props: ChapterEditorAiWritingDetectPanelProps) {
  const {
    isDirty,
    canRun,
    isRunning,
    result,
    errorMessage,
    onRun,
    onLocateIssue,
    onFixIssue,
  } = props;

  return (
    <div className="space-y-3 rounded-2xl border border-amber-200/80 bg-amber-50/40 p-3">
      <div className="space-y-1">
        <div className="text-sm font-medium text-foreground">AI 写法检测</div>
        <div className="text-xs leading-5 text-muted-foreground">
          找出读起来像 AI、模板或说明书的句子，并告诉你怎么改得更像人写的
          {isDirty ? "（会用当前编辑区正文，含未保存修改）" : ""}
          。
        </div>
      </div>

      <AiButton
        size="sm"
        className="w-full"
        onClick={onRun}
        disabled={!canRun || isRunning}
      >
        {isRunning ? "检测中..." : "检测 AI 写法"}
      </AiButton>

      {errorMessage ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs leading-5 text-destructive">
          {errorMessage}
        </div>
      ) : null}

      {result ? (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="font-medium text-foreground">AI痕迹 {result.riskScore}</span>
            <span className="text-muted-foreground">自然度 {result.naturalnessScore}</span>
            <Badge variant={result.issues.length > 0 ? "default" : "outline"}>
              {result.issues.length > 0 ? `${result.issues.length} 处可改` : "暂无明显 AI 味"}
            </Badge>
          </div>
          <div className="text-xs leading-5 text-foreground/90">{result.summary}</div>

          {result.issues.length > 0 ? (
            <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
              {result.issues.map((issue, index) => (
                <div
                  key={`${issue.code}-${index}-${issue.evidence.slice(0, 12)}`}
                  className="rounded-xl border border-border/70 bg-background p-2.5 text-xs leading-5"
                >
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <SeverityBadge severity={issue.severity} />
                    <span className="font-medium text-foreground">{issue.code}</span>
                    {issue.source === "deterministic" ? (
                      <span className="text-[11px] text-muted-foreground">规则快检</span>
                    ) : null}
                  </div>
                  <div className="text-foreground/90">{issue.description}</div>
                  {issue.evidence ? (
                    <div className="mt-1 text-muted-foreground">证据：{issue.evidence}</div>
                  ) : null}
                  {issue.fixSuggestion ? (
                    <div className="mt-1 text-muted-foreground">建议：{issue.fixSuggestion}</div>
                  ) : null}
                  <div className="mt-2 flex flex-wrap gap-2">
                    {issue.evidence ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-xs"
                        onClick={() => onLocateIssue(issue.evidence, issue.description)}
                      >
                        定位到正文
                      </Button>
                    ) : null}
                    {issue.fixSuggestion ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-xs"
                        onClick={() => onFixIssue(issue.fixSuggestion, issue.evidence, issue.description)}
                      >
                        按这条用 AI 改
                      </Button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
