import { useEffect, useState } from "react";
import { ArrowDownToLine, ArrowUpToLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type MobileScrollEdgeButtonsProps = {
  /** Extra bottom offset for sticky action bars (e.g. chapter CTA). */
  bottomOffsetClassName?: string;
  className?: string;
};

function getScrollMetrics() {
  const scrollingElement = document.scrollingElement ?? document.documentElement;
  const scrollTop = window.scrollY || scrollingElement.scrollTop || 0;
  const scrollHeight = scrollingElement.scrollHeight || 0;
  const viewportHeight = window.innerHeight || scrollingElement.clientHeight || 0;
  return { scrollTop, scrollHeight, viewportHeight };
}

export default function MobileScrollEdgeButtons({
  bottomOffsetClassName,
  className,
}: MobileScrollEdgeButtonsProps) {
  const [canScrollUp, setCanScrollUp] = useState(false);
  const [canScrollDown, setCanScrollDown] = useState(false);

  useEffect(() => {
    const update = () => {
      const { scrollTop, scrollHeight, viewportHeight } = getScrollMetrics();
      const maxScroll = Math.max(0, scrollHeight - viewportHeight);
      setCanScrollUp(scrollTop > 48);
      setCanScrollDown(maxScroll > 96 && scrollTop < maxScroll - 48);
    };

    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  if (!canScrollUp && !canScrollDown) {
    return null;
  }

  return (
    <div
      className={cn(
        "pointer-events-none fixed right-3 z-30 flex flex-col gap-2",
        bottomOffsetClassName ?? "bottom-[calc(5.5rem+env(safe-area-inset-bottom))]",
        className,
      )}
      aria-label="页面滚动快捷入口"
    >
      {canScrollUp ? (
        <Button
          type="button"
          size="icon"
          variant="outline"
          className="pointer-events-auto h-10 w-10 rounded-full border-border/70 bg-background/95 shadow-sm backdrop-blur"
          aria-label="回到顶部"
          title="回到顶部"
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        >
          <ArrowUpToLine className="h-4 w-4" aria-hidden="true" />
        </Button>
      ) : null}
      {canScrollDown ? (
        <Button
          type="button"
          size="icon"
          variant="outline"
          className="pointer-events-auto h-10 w-10 rounded-full border-border/70 bg-background/95 shadow-sm backdrop-blur"
          aria-label="去到底部"
          title="去到底部"
          onClick={() => {
            const { scrollHeight } = getScrollMetrics();
            window.scrollTo({ top: scrollHeight, behavior: "smooth" });
          }}
        >
          <ArrowDownToLine className="h-4 w-4" aria-hidden="true" />
        </Button>
      ) : null}
    </div>
  );
}
