import { Button } from "@/components/ui/button";

export function StyleBenchmarkCompareGuideBanner(props: {
  hasCompareResult: boolean;
  onDismiss: () => void;
}) {
  const { hasCompareResult, onDismiss } = props;
  return (
    <div className="shrink-0 border-b border-sky-200/70 bg-sky-50/60 px-3 py-2 sm:px-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 space-y-1 text-xs leading-5 text-sky-950">
          <div className="font-medium">怎么对照（3 步）</div>
          <ol className="list-decimal space-y-0.5 pl-4 text-sky-900/90">
            <li>先看开场几段：你的 vs 范文，感受节奏和压迫感差在哪。</li>
            <li>
              {hasCompareResult
                ? "点「下一段弱段」跳到更弱的段落，对着范文改你的正文。"
                : "需要时点「AI 点评」，再按弱段逐段改。"}
            </li>
            <li>左右段数对不齐时，用「空出本段 / 并入上段」对齐后再比。</li>
          </ol>
        </div>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 shrink-0 px-2 text-xs text-sky-900"
          onClick={onDismiss}
        >
          知道了
        </Button>
      </div>
    </div>
  );
}

export function StyleBenchmarkCompareAlignTip(props: {
  userParagraphCount: number;
  benchmarkParagraphCount: number;
  onDismiss: () => void;
}) {
  const { userParagraphCount, benchmarkParagraphCount, onDismiss } = props;
  return (
    <div className="shrink-0 border-b border-amber-200/80 bg-amber-50/70 px-3 py-2 sm:px-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 text-xs leading-5 text-amber-950">
          <span className="font-medium">段落可能错位了：</span>
          你的正文 {userParagraphCount} 段，主范文 {benchmarkParagraphCount} 段。
          在某一侧点「空出本段」或「并入上段」，让同一行对上同一情节。
        </div>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 shrink-0 px-2 text-xs text-amber-950"
          onClick={onDismiss}
        >
          知道了
        </Button>
      </div>
    </div>
  );
}

export function StyleBenchmarkCompareWeakTip(props: {
  tip: string;
}) {
  return (
    <div className="shrink-0 border-b border-amber-200/70 bg-amber-50/50 px-3 py-1.5 sm:px-4">
      <div className="text-xs leading-5 text-amber-950">
        <span className="font-medium">当前段偏弱：</span>
        {props.tip}
      </div>
    </div>
  );
}
