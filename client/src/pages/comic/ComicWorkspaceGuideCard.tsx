import { Button } from "@/components/ui/button";
import { WorkspaceNextAction } from "@/components/workspace";
import { cn } from "@/lib/utils";
import {
  COMIC_GUIDE_STEPS,
  comicGuideStepState,
  type ComicGuideTab,
  type ComicWorkspaceGuide,
} from "@/pages/comic/comicWorkspaceGuide";

export default function ComicWorkspaceGuideCard(props: {
  guide: ComicWorkspaceGuide;
  onGoToTab: (tab: ComicGuideTab) => void;
}) {
  const { guide, onGoToTab } = props;

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <ol className="flex min-w-max items-center gap-1.5 sm:min-w-0 sm:flex-wrap">
          {COMIC_GUIDE_STEPS.map((step, index) => {
            const state = comicGuideStepState(step.id, guide);
            return (
              <li key={step.id} className="flex items-center gap-1.5">
                {index > 0 ? (
                  <span className="px-0.5 text-muted-foreground/50" aria-hidden="true">
                    →
                  </span>
                ) : null}
                <button
                  type="button"
                  onClick={() => onGoToTab(step.tab)}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-xs transition-colors",
                    state === "current" && "border-primary bg-primary/10 font-semibold text-primary",
                    state === "done" && "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
                    state === "upcoming" && "border-border bg-muted/40 text-muted-foreground hover:bg-muted",
                  )}
                >
                  <span className="mr-1 tabular-nums opacity-70">{index + 1}.</span>
                  {step.label}
                </button>
              </li>
            );
          })}
        </ol>
      </div>

      <WorkspaceNextAction
        icon={guide.icon}
        tone={guide.tone}
        title={guide.title}
        description={guide.description}
        consequence={guide.consequence}
        action={(
          <Button type="button" onClick={() => onGoToTab(guide.tab)}>
            {guide.actionLabel}
          </Button>
        )}
      />
    </div>
  );
}
