import { useEffect, useRef, useState, type RefObject } from "react";
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
  maxScroll: number;
  scrollTo: (top: number) => void;
};

function getWindowMetrics(): ScrollMetrics {
  const scrollingElement = document.scrollingElement ?? document.documentElement;
  const scrollTop = window.scrollY || scrollingElement.scrollTop || 0;
  const scrollHeight = scrollingElement.scrollHeight || 0;
  const viewportHeight = window.innerHeight || scrollingElement.clientHeight || 0;
  const maxScroll = Math.max(0, scrollHeight - viewportHeight);
  return {
    scrollTop,
    scrollHeight,
    viewportHeight,
    maxScroll,
    scrollTo: (top) => window.scrollTo({ top, behavior: "smooth" }),
  };
}

function getElementMetrics(element: HTMLElement): ScrollMetrics {
  const scrollTop = element.scrollTop;
  const scrollHeight = element.scrollHeight;
  const viewportHeight = element.clientHeight;
  const maxScroll = Math.max(0, scrollHeight - viewportHeight);
  return {
    scrollTop,
    scrollHeight,
    viewportHeight,
    maxScroll,
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

function pickActiveMetrics(
  scrollContainerRef?: RefObject<HTMLElement | null>,
  scrollContainerSelector?: string,
): ScrollMetrics {
  const element = resolveScrollTarget(scrollContainerRef, scrollContainerSelector);
  const windowMetrics = getWindowMetrics();
  if (!element) {
    return windowMetrics;
  }
  const elementMetrics = getElementMetrics(element);
  if (elementMetrics.maxScroll > 96) {
    return elementMetrics;
  }
  return windowMetrics;
}

export default function MobileScrollEdgeButtons({
  bottomOffsetClassName,
  className,
  scrollContainerRef,
  scrollContainerSelector,
}: MobileScrollEdgeButtonsProps) {
  const [canScrollUp, setCanScrollUp] = useState(false);
  const [canScrollDown, setCanScrollDown] = useState(false);
  const frameRef = useRef(0);
  const lastStateRef = useRef({ up: false, down: false });

  useEffect(() => {
    let attachedElement: HTMLElement | null = null;

    const apply = () => {
      frameRef.current = 0;
      const metrics = pickActiveMetrics(scrollContainerRef, scrollContainerSelector);
      const nextUp = metrics.maxScroll > 96 && metrics.scrollTop > 48;
      const nextDown = metrics.maxScroll > 96 && metrics.scrollTop < metrics.maxScroll - 48;
      if (lastStateRef.current.up === nextUp && lastStateRef.current.down === nextDown) {
        return;
      }
      lastStateRef.current = { up: nextUp, down: nextDown };
      setCanScrollUp(nextUp);
      setCanScrollDown(nextDown);
    };

    const schedule = () => {
      if (frameRef.current) {
        return;
      }
      frameRef.current = window.requestAnimationFrame(apply);
    };

    const attach = () => {
      const element = resolveScrollTarget(scrollContainerRef, scrollContainerSelector);
      if (attachedElement !== element) {
        if (attachedElement) {
          attachedElement.removeEventListener("scroll", schedule);
        }
        attachedElement = element;
        if (attachedElement) {
          attachedElement.addEventListener("scroll", schedule, { passive: true });
        }
      }
      schedule();
    };

    attach();
    // Retry once after paint in case the editor mounts late.
    const retryTimer = window.setTimeout(attach, 300);
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", attach);

    return () => {
      window.clearTimeout(retryTimer);
      if (frameRef.current) {
        window.cancelAnimationFrame(frameRef.current);
      }
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", attach);
      if (attachedElement) {
        attachedElement.removeEventListener("scroll", schedule);
      }
    };
  }, [scrollContainerRef, scrollContainerSelector]);

  if (!canScrollUp && !canScrollDown) {
    return null;
  }

  const scrollByEdge = (edge: "top" | "bottom") => {
    const metrics = pickActiveMetrics(scrollContainerRef, scrollContainerSelector);
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
          className="pointer-events-auto h-10 w-10 rounded-full border-border/70 bg-background/95 shadow-sm"
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
          className="pointer-events-auto h-10 w-10 rounded-full border-border/70 bg-background/95 shadow-sm"
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
