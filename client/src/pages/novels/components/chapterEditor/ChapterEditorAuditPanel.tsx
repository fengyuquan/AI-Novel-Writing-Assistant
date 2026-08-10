import type { AuditIssue, AuditReport, QualityScore, ReviewIssue } from "@ai-novel/shared/types/novel";
import AiButton from "@/components/common/AiButton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export type ChapterEditorAuditResult = {
  score: QualityScore;
  issues: ReviewIssue[];
  auditReports: AuditReport[];
};

interface ChapterEditorAuditPanelProps {
  isDirty: boolean;
  hasSelection: boolean;
  isRunningFull: boolean;
  isRunningLight: boolean;
  isResolvingIssue: boolean;
  canRun: boolean;
  result: ChapterEditorAuditResult | null;
  errorMessage?: string | null;
  onRunFull: () => void;
  onRunLight: () => void;
  onResolveIssue?: (issueId: string) => void;
  onLocateIssue?: (evidence: string, description?: string) => void;
  onFixIssue?: (fixSuggestion: string, evidence: string, description?: string) => void;
}

function SeverityBadge({ severity }: { severity: string }) {
  const variant = severity === "critical" || severity === "high" ? "default" : "secondary";
  return <Badge variant={variant}>{severity}</Badge>;
}

function collectOpenIssues(result: ChapterEditorAuditResult | null): Array<{
  key: string;
  issueId?: string;
  severity: string;
  title: string;
  description: string;
  evidence: string;
  fixSuggestion: string;
}> {
  if (!result) {
    return [];
  }

  const structured: AuditIssue[] = result.auditReports
    .flatMap((report) => report.issues)
    .filter((issue) => issue.status === "open");

  if (structured.length > 0) {
    return structured.slice(0, 8).map((issue) => ({
      key: issue.id,
      issueId: issue.id,
      severity: issue.severity,
      title: issue.code,
      description: issue.description,
      evidence: issue.evidence,
      fixSuggestion: issue.fixSuggestion,
    }));
  }

  return result.issues.slice(0, 8).map((issue, index) => ({
    key: `${issue.category}-${index}`,
    severity: issue.severity,
    title: issue.category,
    description: issue.fixSuggestion || "发现问题，建议按证据修改。",
    evidence: issue.evidence,
    fixSuggestion: issue.fixSuggestion,
  }));
}

export default function ChapterEditorAuditPanel(props: ChapterEditorAuditPanelProps) {
  const {
    isDirty,
    hasSelection,
    isRunningFull,
    isRunningLight,
    isResolvingIssue,
    canRun,
    result,
    errorMessage,
    onRunFull,
    onRunLight,
    onResolveIssue,
    onLocateIssue,
    onFixIssue,
  } = props;
  const isRunning = isRunningFull || isRunningLight;
  const openIssues = collectOpenIssues(result);
  const overallScore = result?.score.overall
    ?? result?.auditReports.find((report) => typeof report.overallScore === "number")?.overallScore
    ?? null;

  return (
    <div className="space-y-3 rounded-2xl border border-border/70 bg-muted/10 p-3">
      <div className="space-y-1">
        <div className="text-sm font-medium text-foreground">审校检查</div>
        <div className="text-xs leading-5 text-muted-foreground">
          用当前编辑区正文检查问题
          {isDirty ? "（含尚未保存的修改）" : ""}
          。轻审更快；完整审校更全面。
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2">
        <AiButton
          size="sm"
          variant="outline"
          className="w-full"
          onClick={onRunLight}
          disabled={!canRun || isRunning}
        >
          {isRunningLight
            ? "轻审中..."
            : hasSelection
              ? "轻审当前选段"
              : "轻审开头与结尾"}
        </AiButton>
        <AiButton
          size="sm"
          variant="outline"
          className="w-full"
          onClick={onRunFull}
          disabled={!canRun || isRunning}
        >
          {isRunningFull ? "完整审校中..." : "运行完整审校"}
        </AiButton>
      </div>

      {errorMessage ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs leading-5 text-destructive">
          {errorMessage}
        </div>
      ) : null}

      {result ? (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {typeof overallScore === "number" ? (
              <span className="font-medium text-foreground">总分 {overallScore}</span>
            ) : null}
            <Badge variant={openIssues.length > 0 ? "default" : "outline"}>
              {openIssues.length > 0 ? `${openIssues.length} 条待处理` : "暂无待处理问题"}
            </Badge>
          </div>

          {openIssues.length > 0 ? (
            <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
              {openIssues.map((issue) => (
                <div key={issue.key} className="rounded-xl border border-border/70 bg-background p-2.5 text-xs leading-5">
                  <div className="mb-1 flex items-center gap-2">
                    <SeverityBadge severity={issue.severity} />
                    <span className="font-medium text-foreground">{issue.title}</span>
                  </div>
                  <div className="text-foreground/90">{issue.description}</div>
                  {issue.evidence ? (
                    <div className="mt-1 text-muted-foreground">证据：{issue.evidence}</div>
                  ) : null}
                  {issue.fixSuggestion ? (
                    <div className="mt-1 text-muted-foreground">建议：{issue.fixSuggestion}</div>
                  ) : null}
                  <div className="mt-2 flex flex-wrap gap-2">
                    {onLocateIssue && issue.evidence ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-xs"
                        onClick={() => onLocateIssue(issue.evidence, issue.description)}
                      >
                        定位到正文
                      </Button>
                    ) : null}
                    {onFixIssue && issue.fixSuggestion ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-xs"
                        onClick={() => onFixIssue(issue.fixSuggestion, issue.evidence, issue.description)}
                      >
                        按这条用 AI 改
                      </Button>
                    ) : null}
                    {issue.issueId && onResolveIssue ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-xs"
                        disabled={isResolvingIssue}
                        onClick={() => onResolveIssue(issue.issueId!)}
                      >
                        标为已处理
                      </Button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-xs leading-5 text-muted-foreground">
              本轮审校没有列出待处理问题。你可继续改稿后再次运行。
            </div>
          )}
        </div>
      ) : !isRunning && !errorMessage ? (
        <div className="text-xs leading-5 text-muted-foreground">
          改完后可先轻审快速扫一眼，再按需跑完整审校。
        </div>
      ) : null}
    </div>
  );
}
