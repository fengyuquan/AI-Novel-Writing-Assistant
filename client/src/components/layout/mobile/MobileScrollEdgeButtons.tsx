import { useEffect, useState, type RefObject } from "react";
import { ArrowDownToLine, ArrowUpToLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type MobileScrollEdgeButtonsProps = {
  /** Extra bottom offset for sticky action bars (e.g. chapter CTA). */
  bottomOffsetClassName?: string;
  className?: string;
  /** Prefer this element as the scroll target when available. */
  scrollContainerRef?: RefObject<HTMLElement | null>;
  /** Fallback selector for an in-page scroll container (e.g. chapter editor body). */
  scrollContainerSelector?: string;
};

type ScrollMetrics = {
  scrollTop: number;
  scrollHeight: number;
  viewportHeight: number;
  scrollTo: (top: number) => void;
};

function getWindowMetrics(): ScrollMetrics {
  const scrollingElement = document.scrollingElement ?? document.documentElement;
  const scrollTop = window.scrollY || scrollingElement.scrollTop || 0;
  const scrollHeight = scrollingElement.scrollHeight || 0;
  const viewportHeight = window.innerHeight || scrollingElement.clientHeight || 0;
  return {
    scrollTop,
    scrollHeight,
    viewportHeight,
    scrollTo: (top) => window.scrollTo({ top, behavior: "smooth" }),
  };
}

function getElementMetrics(element: HTMLElement): ScrollMetrics {
  return {
    scrollTop: element.scrollTop,
    scrollHeight: element.scrollHeight,
    viewportHeight: element.clientHeight,
    scrollTo: (top) => element.scrollTo({ top, behavior: "smooth" }),
  };
}

function resolveScrollTarget(
  scrollContainerRef?: RefObject<HTMLElement | null>,
  scrollContainerSelector?: string,
): HTMLElement | null {
  if (scrollContainerRef?.current) {
    return scrollContainerRef.current;
  }
  if (scrollContainerSelector) {
    return document.querySelector<HTMLElement>(scrollContainerSelector);
  }
  return null;
}

export default function MobileScrollEdgeButtons({
  bottomOffsetClassName,
  className,
  scrollContainerRef,
  scrollContainerSelector,
}: MobileScrollEdgeButtonsProps) {
  const [canScrollUp, setCanScrollUp] = useState(false);
  const [canScrollDown, setCanScrollDown] = useState(false);

  useEffect(() => {
    let attachedElement: HTMLElement | null = null;
    let frame = 0;

    const update = () => {
      const element = resolveScrollTarget(scrollContainerRef, scrollContainerSelector);
      const metrics = element ? getElementMetrics(element) : getWindowMetrics();
      const maxScroll = Math.max(0, metrics.scrollHeight - metrics.viewportHeight);
      setCanScrollUp(scrollableEnough(maxScroll) && metrics.scrollTop > 48);
      setCanScrollDown(scrollableEnough(maxScroll) && metrics.scrollTop < maxScroll - 48);
    };

    const attach = () => {
      const element = resolveScrollTarget(scrollContainerRef, scrollContainerSelector);
      if (attachedElement === element) {
        update();
        return;
      }
      if (attachedElement) {
        attachedElement.removeEventListener("scroll", update);
      }
      attachedElement = element;
      if (attachedElement) {
        attachedElement.addEventListener("scroll", update, { passive: true });
      }
      update();
    };

    attach();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", attach);
    const observer = new MutationObserver(() => {
      cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(attach);
    });
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", attach);
      observer.disconnect();
      if (attachedElement) {
        attachedElement.removeEventListener("scroll", update);
      }
    };
  }, [scrollContainerRef, scrollContainerSelector]);

  if (!canScrollUp && !canScrollDown) {
    return null;
  }

  const scrollByEdge = (edge: "top" | "bottom") => {
    const element = resolveScrollTarget(scrollContainerRef, scrollContainerSelector);
    const metrics = element ? getElementMetrics(element) : getWindowMetrics();
    metrics.scrollTo(edge === "top" ? 0 : metrics.scrollHeight);
  };

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
          onClick={() => scrollByEdge("top")}
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
          onClick={() => scrollByEdge("bottom")}
        >
          <ArrowDownToLine className="h-4 w-4" aria-hidden="true" />
        </Button>
      ) : null}
    </div>
  );
}

function scrollableEnough(maxScroll: number): boolean {
  return maxScroll > 96;
}
