import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  NOVEL_WORKSPACE_FLOW_STEPS,
  NOVEL_WORKSPACE_TOOL_TABS,
  getNovelWorkspaceTabLabel,
  type NovelWorkspaceTab,
} from "../novelWorkspaceNavigation";

interface MobileNovelStepNavProps {
  activeTab: NovelWorkspaceTab;
  workflowCurrentTab: NovelWorkspaceTab;
  onSelectTab: (tab: NovelWorkspaceTab) => void;
}

/** Beginner-facing core steps stay visible in the compact strip; expert steps stay in the expanded list. */
const CORE_STEP_KEYS = new Set<NovelWorkspaceTab>([
  "basic",
  "story_macro",
  "world",
  "character",
  "chapter",
  "pipeline",
]);

export default function MobileNovelStepNav({
  activeTab,
  workflowCurrentTab,
  onSelectTab,
}: MobileNovelStepNavProps) {
  const [expanded, setExpanded] = useState(false);
  const recommendedLabel = getNovelWorkspaceTabLabel(workflowCurrentTab);
  const activeLabel = getNovelWorkspaceTabLabel(activeTab);
  const recommendationDiffers = workflowCurrentTab !== activeTab;
  const coreSteps = NOVEL_WORKSPACE_FLOW_STEPS.filter((step) => CORE_STEP_KEYS.has(step.key));
  const expertSteps = [
    ...NOVEL_WORKSPACE_FLOW_STEPS.filter((step) => !CORE_STEP_KEYS.has(step.key)),
    ...NOVEL_WORKSPACE_TOOL_TABS,
  ];

  return (
    <nav className="mobile-novel-step-nav space-y-2" aria-label="小说创作步骤">
      <div className="rounded-xl border border-primary/20 bg-primary/5 px-3 py-2.5">
        <div className="flex min-w-0 items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[11px] text-muted-foreground">当前步骤</div>
            <div className="mt-0.5 truncate text-sm font-semibold text-foreground">{activeLabel}</div>
            {recommendationDiffers ? (
              <p className="mt-1 text-xs leading-5 text-muted-foreground [overflow-wrap:anywhere]">
                流程推荐下一步：{recommendedLabel}
              </p>
            ) : (
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                按推荐继续即可推进这本书。
              </p>
            )}
          </div>
          {recommendationDiffers ? (
            <Button
              type="button"
              size="sm"
              className="h-10 shrink-0 px-3"
              onClick={() => onSelectTab(workflowCurrentTab)}
            >
              去推荐步骤
            </Button>
          ) : null}
        </div>
      </div>

      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {coreSteps.map((step) => {
          const isActive = activeTab === step.key;
          const isRecommended = workflowCurrentTab === step.key;
          return (
            <Button
              key={step.key}
              type="button"
              variant={isActive ? "default" : "outline"}
              size="sm"
              className={cn(
                "h-10 shrink-0 rounded-full px-3",
                isRecommended && !isActive ? "border-primary/50 bg-primary/5 text-primary" : null,
              )}
              aria-current={isActive ? "step" : undefined}
              onClick={() => onSelectTab(step.key)}
            >
              <span className="flex items-center gap-1.5">
                <span className="max-w-28 truncate">{step.label}</span>
                {isRecommended ? (
                  <Badge variant="secondary" className="rounded-full px-1.5 py-0 text-[10px]">
                    推荐
                  </Badge>
                ) : null}
              </span>
            </Button>
          );
        })}
      </div>

      <Button
        type="button"
        variant="ghost"
        className="h-10 w-full justify-between px-2 text-sm text-muted-foreground"
        onClick={() => setExpanded((current) => !current)}
        aria-expanded={expanded}
      >
        <span>{expanded ? "收起全部步骤" : "查看全部步骤与专家能力"}</span>
        {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </Button>

      {expanded ? (
        <div className="space-y-3 rounded-xl border border-border/70 bg-muted/15 p-3">
          <div>
            <div className="text-xs font-medium text-foreground">创作主线</div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {coreSteps.map((step) => {
                const isActive = activeTab === step.key;
                return (
                  <Button
                    key={`all-core-${step.key}`}
                    type="button"
                    variant={isActive ? "default" : "outline"}
                    className="h-11 justify-start px-3 text-left text-sm"
                    onClick={() => {
                      onSelectTab(step.key);
                      setExpanded(false);
                    }}
                  >
                    <span className="truncate">{step.label}</span>
                  </Button>
                );
              })}
            </div>
          </div>

          <div>
            <div className="text-xs font-medium text-foreground">专家能力</div>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              卷战略、节奏拆章和版本历史可在需要时再打开，不影响继续写正文。
            </p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {expertSteps.map((step) => {
                const isActive = activeTab === step.key;
                const isRecommended = workflowCurrentTab === step.key;
                return (
                  <Button
                    key={`expert-${step.key}`}
                    type="button"
                    variant={isActive ? "default" : "outline"}
                    className={cn(
                      "h-11 justify-start px-3 text-left text-sm",
                      isRecommended && !isActive ? "border-primary/50" : null,
                    )}
                    onClick={() => {
                      onSelectTab(step.key);
                      setExpanded(false);
                    }}
                  >
                    <span className="truncate">{step.label}</span>
                  </Button>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}
    </nav>
  );
}
