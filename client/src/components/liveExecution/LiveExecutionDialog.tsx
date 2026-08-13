import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ChevronDown, ChevronRight, Eraser, GripHorizontal, Maximize2, Minimize2, Radio, Square, X } from "lucide-react";
import type { LlmLiveSessionSnapshot } from "@ai-novel/shared/types/llmLive";
import { cancelActiveLlmLiveSessions, cancelLlmLiveSession } from "@/api/llmLive";
import { useLlmLiveFeed } from "@/hooks/useLlmLiveFeed";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

function phaseLabel(phase: string): string {
  const labels: Record<string, string> = {
    requesting: "正在连接",
    streaming: "正在生成",
    assembling: "正在整理",
    validating: "正在检查",
    repairing: "正在修复",
    applying: "正在应用",
    persisting: "正在保存",
    completed: "已完成",
    failed: "生成失败",
    cancelled: "已取消",
  };
  return labels[phase] ?? "正在处理";
}

function isActive(phase: string): boolean {
  return !["completed", "failed", "cancelled"].includes(phase);
}

function sessionId(session: LlmLiveSessionSnapshot): string {
  return session.context.interactionId;
}

interface LiveExecutionDialogProps {
  compact?: boolean;
  /** Fixed floating trigger that can be dragged; position persists in localStorage. */
  floating?: boolean;
  className?: string;
  taskId?: string | null;
  autoOpenOnActivity?: boolean;
}

const TRIGGER_POSITION_STORAGE_KEY = "ai-novel.live-execution.trigger.position";
const TRIGGER_SIZE_PX = 36;
const DRAG_THRESHOLD_PX = 8;

type TriggerPosition = {
  left: number;
  top: number;
};

function clampTriggerPosition(position: TriggerPosition): TriggerPosition {
  const maxLeft = Math.max(8, window.innerWidth - TRIGGER_SIZE_PX - 8);
  const maxTop = Math.max(8, window.innerHeight - TRIGGER_SIZE_PX - 8);
  return {
    left: Math.min(Math.max(8, position.left), maxLeft),
    top: Math.min(Math.max(8, position.top), maxTop),
  };
}

function readStoredTriggerPosition(): TriggerPosition | null {
  try {
    const raw = window.localStorage.getItem(TRIGGER_POSITION_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Partial<TriggerPosition>;
    if (typeof parsed.left !== "number" || typeof parsed.top !== "number") {
      return null;
    }
    return clampTriggerPosition({ left: parsed.left, top: parsed.top });
  } catch {
    return null;
  }
}

function writeStoredTriggerPosition(position: TriggerPosition): void {
  window.localStorage.setItem(TRIGGER_POSITION_STORAGE_KEY, JSON.stringify(clampTriggerPosition(position)));
}

export default function LiveExecutionDialog(props: LiveExecutionDialogProps) {
  const [open, setOpen] = useState(false);
  const [briefMode, setBriefMode] = useState(true);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [followingLatest, setFollowingLatest] = useState(true);
  const [collapsedSessionIds, setCollapsedSessionIds] = useState<Set<string>>(() => new Set());
  const [triggerPosition, setTriggerPosition] = useState<TriggerPosition | null>(null);
  const [cancellingIds, setCancellingIds] = useState<Set<string>>(() => new Set());
  const [cancellingAll, setCancellingAll] = useState(false);
  const logRef = useRef<HTMLDivElement | null>(null);
  const latestSessionRef = useRef<HTMLDivElement | null>(null);
  const dragStartRef = useRef<{ pointerX: number; pointerY: number; offsetX: number; offsetY: number } | null>(null);
  const triggerDragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originLeft: number;
    originTop: number;
    moved: boolean;
  } | null>(null);
  const suppressTriggerClickRef = useRef(false);
  const followLatestRef = useRef(true);
  const latestSessionIdRef = useRef<string | null>(null);
  const autoOpenedSessionIdsRef = useRef(new Set<string>());
  const userDismissedWhileActiveRef = useRef(false);
  const { clearSessions, connected, sessions } = useLlmLiveFeed({
    enabled: true,
    taskId: props.taskId,
  });
  const orderedSessions = useMemo(
    () => [...sessions],
    [sessions],
  );
  const latestSession = orderedSessions[orderedSessions.length - 1] ?? null;
  const latestSessionId = latestSession ? sessionId(latestSession) : null;
  const latestPreview = latestSession?.preview
    ? latestSession.preview.slice(-1200)
    : "等待模型开始返回内容…";
  const activeCount = sessions.filter((session) => isActive(session.phase)).length;
  const floating = Boolean(props.floating);

  useEffect(() => {
    if (!floating) {
      return;
    }
    setTriggerPosition(readStoredTriggerPosition());
  }, [floating]);

  useEffect(() => {
    if (!floating) {
      return;
    }
    const onResize = () => {
      setTriggerPosition((current) => (current ? clampTriggerPosition(current) : current));
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [floating]);

  useEffect(() => {
    if (!props.autoOpenOnActivity) {
      return;
    }
    const hasActiveSession = orderedSessions.some((session) => isActive(session.phase));
    if (!hasActiveSession) {
      // 本轮活动结束后允许下一轮再次自动打开一次。
      userDismissedWhileActiveRef.current = false;
      return;
    }
    if (userDismissedWhileActiveRef.current) {
      return;
    }
    const unseenActiveSession = orderedSessions.find((session) => (
      isActive(session.phase)
      && !autoOpenedSessionIdsRef.current.has(sessionId(session))
    ));
    if (!unseenActiveSession) {
      return;
    }
    for (const session of orderedSessions) {
      if (isActive(session.phase)) {
        autoOpenedSessionIdsRef.current.add(sessionId(session));
      }
    }
    setOpen(true);
    followLatestRef.current = true;
    setFollowingLatest(true);
  }, [orderedSessions, props.autoOpenOnActivity]);

  useLayoutEffect(() => {
    if (!open || !followLatestRef.current || !latestSessionRef.current) {
      return;
    }
    const frame = window.requestAnimationFrame(() => {
      if (latestSessionRef.current && followLatestRef.current) {
        latestSessionRef.current.scrollIntoView({ block: "end" });
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [latestSession?.preview, latestSession?.phase, latestSession?.phaseMessage, latestSessionId, open]);

  useEffect(() => {
    if (!latestSessionId || latestSessionIdRef.current === latestSessionId) {
      return;
    }
    latestSessionIdRef.current = latestSessionId;
    followLatestRef.current = true;
    setFollowingLatest(true);
    setCollapsedSessionIds((previous) => {
      const next = new Set(previous);
      for (const session of orderedSessions) {
        const interactionId = sessionId(session);
        if (interactionId !== latestSessionId && !isActive(session.phase)) {
          next.add(interactionId);
        }
      }
      next.delete(latestSessionId);
      return next;
    });
  }, [latestSessionId, orderedSessions]);

  const scrollToLatest = () => {
    followLatestRef.current = true;
    setFollowingLatest(true);
    if (logRef.current) {
      latestSessionRef.current?.scrollIntoView({ block: "end" });
    }
  };

  const toggleSession = (interactionId: string) => {
    setCollapsedSessionIds((previous) => {
      const next = new Set(previous);
      if (next.has(interactionId)) {
        next.delete(interactionId);
      } else {
        next.add(interactionId);
      }
      return next;
    });
  };

  const clearFrontendLog = () => {
    clearSessions();
    latestSessionIdRef.current = null;
    setCollapsedSessionIds(new Set());
    followLatestRef.current = true;
    setFollowingLatest(true);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      followLatestRef.current = true;
      setFollowingLatest(true);
      userDismissedWhileActiveRef.current = false;
    } else if (props.autoOpenOnActivity) {
      const hasActiveSession = sessions.some((session) => isActive(session.phase));
      if (hasActiveSession) {
        // 用户在仍有活动生成时手动关闭：本轮不再自动弹窗。
        userDismissedWhileActiveRef.current = true;
      }
    }
    setOpen(nextOpen);
  };

  const toggleDisplayMode = () => {
    setBriefMode((current) => !current);
    followLatestRef.current = true;
    setFollowingLatest(true);
  };

  const resolveDefaultTriggerPosition = (element: HTMLElement): TriggerPosition => {
    const rect = element.getBoundingClientRect();
    return clampTriggerPosition({ left: rect.left, top: rect.top });
  };

  const handleTriggerPointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!floating || event.button !== 0) {
      return;
    }
    const element = event.currentTarget;
    const origin = triggerPosition ?? resolveDefaultTriggerPosition(element);
    triggerDragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originLeft: origin.left,
      originTop: origin.top,
      moved: false,
    };
    element.setPointerCapture(event.pointerId);
  };

  const handleTriggerPointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = triggerDragRef.current;
    if (!floating || !drag || drag.pointerId !== event.pointerId) {
      return;
    }
    const deltaX = event.clientX - drag.startX;
    const deltaY = event.clientY - drag.startY;
    if (!drag.moved && Math.hypot(deltaX, deltaY) < DRAG_THRESHOLD_PX) {
      return;
    }
    drag.moved = true;
    const next = clampTriggerPosition({
      left: drag.originLeft + deltaX,
      top: drag.originTop + deltaY,
    });
    setTriggerPosition(next);
  };

  const finishTriggerDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = triggerDragRef.current;
    if (!floating || !drag || drag.pointerId !== event.pointerId) {
      return;
    }
    if (drag.moved) {
      suppressTriggerClickRef.current = true;
      setTriggerPosition((current) => {
        if (current) {
          writeStoredTriggerPosition(current);
        }
        return current;
      });
    }
    triggerDragRef.current = null;
  };

  const handleTriggerClick = () => {
    if (suppressTriggerClickRef.current) {
      suppressTriggerClickRef.current = false;
      return;
    }
    handleOpenChange(true);
  };

  const markCancelling = (interactionId: string, pending: boolean) => {
    setCancellingIds((current) => {
      const next = new Set(current);
      if (pending) next.add(interactionId);
      else next.delete(interactionId);
      return next;
    });
  };

  const handleCancelSession = async (interactionId: string) => {
    markCancelling(interactionId, true);
    try {
      await cancelLlmLiveSession(interactionId);
      toast.success("已发送中断请求");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "中断失败");
    } finally {
      markCancelling(interactionId, false);
    }
  };

  const handleCancelActive = async () => {
    setCancellingAll(true);
    try {
      const result = await cancelActiveLlmLiveSessions({
        taskId: props.taskId ?? undefined,
      });
      if (result.cancelledCount === 0) {
        toast.error("当前没有可中断的模型请求");
      } else {
        toast.success(`已中断 ${result.cancelledCount} 次模型请求`);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "中断失败");
    } finally {
      setCancellingAll(false);
    }
  };

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className={cn(
          "relative",
          floating && "fixed z-50 h-9 w-9 touch-none bg-background px-0 shadow-sm",
          floating && !triggerPosition && "right-3 top-3",
          props.className,
        )}
        style={
          floating && triggerPosition
            ? { left: triggerPosition.left, top: triggerPosition.top, right: "auto" }
            : undefined
        }
        onPointerDown={handleTriggerPointerDown}
        onPointerMove={handleTriggerPointerMove}
        onPointerUp={finishTriggerDrag}
        onPointerCancel={finishTriggerDrag}
        onClick={handleTriggerClick}
        title={floating ? "查看 AI 创作实况（可拖动位置）" : "查看 AI 创作实况"}
        aria-label="查看 AI 创作实况"
      >
        <Radio className={cn("h-3.5 w-3.5", activeCount > 0 ? "animate-pulse text-primary" : null, !props.compact && "mr-1.5")} aria-hidden="true" />
        {!props.compact ? <span className="hidden sm:inline">AI 实况</span> : null}
        {activeCount > 0 ? (
          <Badge
            className={cn("h-5 min-w-5 px-1.5 text-[10px]", props.compact ? "absolute -right-1 -top-1" : "ml-1.5")}
            aria-label={`${activeCount} 项 AI 生成正在进行`}
          >
            {activeCount}
          </Badge>
        ) : null}
      </Button>

      <DialogPrimitive.Root modal={false} open={open} onOpenChange={handleOpenChange}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Content
            className={cn(
              "fixed right-4 top-20 z-[70] flex w-[min(42rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-xl border border-emerald-400/45 bg-[#080d0c] text-emerald-50 shadow-2xl shadow-emerald-950/40 outline-none transition-[height] duration-200 ease-out",
              briefMode
                ? "h-[13rem] max-h-[calc(100dvh-6rem)]"
                : "h-[min(42rem,calc(100dvh-6rem))]",
            )}
            style={{ transform: `translate(${dragOffset.x}px, ${dragOffset.y}px)` }}
            aria-describedby="live-execution-description"
          >
            <header
              className={cn(
                "flex shrink-0 touch-none items-start gap-3 border-b border-emerald-400/25 bg-[#0d1714] px-3 select-none",
                briefMode ? "py-2.5" : "py-3",
              )}
              onPointerDown={(event) => {
                if (event.button !== 0) return;
                dragStartRef.current = {
                  pointerX: event.clientX,
                  pointerY: event.clientY,
                  offsetX: dragOffset.x,
                  offsetY: dragOffset.y,
                };
                event.currentTarget.setPointerCapture(event.pointerId);
              }}
              onPointerMove={(event) => {
                const start = dragStartRef.current;
                if (!start) return;
                setDragOffset({
                  x: start.offsetX + event.clientX - start.pointerX,
                  y: start.offsetY + event.clientY - start.pointerY,
                });
              }}
              onPointerUp={() => {
                dragStartRef.current = null;
              }}
              onPointerCancel={() => {
                dragStartRef.current = null;
              }}
            >
              <GripHorizontal className="mt-1 h-4 w-4 shrink-0 text-emerald-400/80" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <DialogPrimitive.Title className="font-mono text-sm font-semibold tracking-wide text-emerald-100">AI 创作实况 / LIVE LOG</DialogPrimitive.Title>
                <DialogPrimitive.Description
                  id="live-execution-description"
                  className={cn("mt-1 text-xs leading-5 text-emerald-100/65", briefMode && "sr-only")}
                >
                  每次调用独立显示。新调用会自动聚焦，已完成调用会收起；清空只影响当前窗口。
                </DialogPrimitive.Description>
              </div>
              <Badge variant="outline" className="shrink-0 border-emerald-400/50 bg-emerald-400/10 font-mono text-emerald-200">
                {activeCount > 0 ? `${activeCount} 项进行中` : connected ? "等待生成" : "正在连接"}
              </Badge>
              {activeCount > 0 ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 shrink-0 gap-1.5 px-2 font-mono text-xs text-rose-200 hover:bg-rose-400/10 hover:text-rose-50"
                  disabled={cancellingAll}
                  onClick={() => void handleCancelActive()}
                  onPointerDown={(event) => event.stopPropagation()}
                  onPointerMove={(event) => event.stopPropagation()}
                  onPointerUp={(event) => event.stopPropagation()}
                  aria-label="中断当前进行中的模型请求"
                  title="停止正在请求大模型的生成"
                >
                  <Square className="h-3.5 w-3.5 fill-current" />
                  {cancellingAll ? "中断中…" : "中断"}
                </Button>
              ) : null}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 shrink-0 gap-1.5 px-2 font-mono text-xs text-emerald-200 hover:bg-emerald-400/10 hover:text-emerald-50"
                onClick={toggleDisplayMode}
                onPointerDown={(event) => event.stopPropagation()}
                onPointerMove={(event) => event.stopPropagation()}
                onPointerUp={(event) => event.stopPropagation()}
                aria-label={briefMode ? "切换到详细模式" : "切换到简略模式"}
                title={briefMode ? "查看全部调用" : "只看最新输出"}
              >
                {briefMode ? <Maximize2 className="h-3.5 w-3.5" /> : <Minimize2 className="h-3.5 w-3.5" />}
                {briefMode ? "详细" : "简略"}
              </Button>
              {!briefMode ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 shrink-0 gap-1.5 px-2 font-mono text-xs text-emerald-200 hover:bg-emerald-400/10 hover:text-emerald-50"
                onClick={clearFrontendLog}
                onPointerDown={(event) => event.stopPropagation()}
                onPointerMove={(event) => event.stopPropagation()}
                onPointerUp={(event) => event.stopPropagation()}
              >
                <Eraser className="h-3.5 w-3.5" />
                清空前台
              </Button>
              ) : null}
              <DialogPrimitive.Close asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="-mr-1 -mt-1 h-8 w-8 shrink-0 text-emerald-100 hover:bg-emerald-400/10 hover:text-emerald-50"
                  aria-label="关闭 AI 创作实况"
                  onPointerDown={(event) => event.stopPropagation()}
                  onPointerMove={(event) => event.stopPropagation()}
                  onPointerUp={(event) => event.stopPropagation()}
                >
                  <X className="h-4 w-4" />
                </Button>
              </DialogPrimitive.Close>
            </header>

            <div
              ref={logRef}
              className={cn(
                "live-execution-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain bg-[radial-gradient(circle_at_top_right,rgba(16,185,129,0.09),transparent_42%),linear-gradient(to_bottom,#080d0c,#050807)] font-mono text-xs leading-6 text-emerald-100",
                briefMode ? "px-3 py-2.5" : "px-4 py-3",
              )}
              onScroll={(event) => {
                const element = event.currentTarget;
                const shouldFollow = element.scrollHeight - element.scrollTop - element.clientHeight < 32;
                followLatestRef.current = shouldFollow;
                setFollowingLatest(shouldFollow);
              }}
            >
              {briefMode && latestSession ? (
                <section ref={latestSessionRef} className="min-h-full">
                  <div className="mb-1.5 flex items-center gap-2 text-[11px]">
                    <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", isActive(latestSession.phase) ? "animate-pulse bg-emerald-300" : "bg-emerald-500/60")} />
                    <span className="min-w-0 flex-1 truncate font-semibold text-emerald-50">{latestSession.context.label}</span>
                    <span className="shrink-0 text-emerald-100/55">{phaseLabel(latestSession.phase)}</span>
                    {isActive(latestSession.phase) ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-6 shrink-0 gap-1 px-1.5 font-mono text-[10px] text-rose-200 hover:bg-rose-400/10 hover:text-rose-50"
                        disabled={cancellingIds.has(sessionId(latestSession)) || cancellingAll}
                        onClick={() => void handleCancelSession(sessionId(latestSession))}
                      >
                        <Square className="h-3 w-3 fill-current" />
                        中断
                      </Button>
                    ) : null}
                  </div>
                  <div className="mb-1 truncate text-[11px] text-emerald-100/45">{latestSession.phaseMessage}</div>
                  <pre className="m-0 whitespace-pre-wrap break-words text-emerald-100/90">{latestPreview}</pre>
                </section>
              ) : orderedSessions.length > 0 ? (
                <div className="space-y-2">
                  {orderedSessions.map((session) => {
                    const interactionId = sessionId(session);
                    const collapsed = collapsedSessionIds.has(interactionId);
                    const active = isActive(session.phase);
                    return (
                      <section
                        key={interactionId}
                        ref={interactionId === latestSessionId ? latestSessionRef : undefined}
                        className={cn(
                          "overflow-hidden rounded-lg border bg-[#07100d]/80",
                          active ? "border-emerald-400/50 shadow-[0_0_0_1px_rgba(52,211,153,0.08)]" : "border-emerald-400/20",
                        )}
                      >
                        <div className="flex w-full items-center gap-2 bg-emerald-400/[0.04] px-3 py-2">
                          <button
                            type="button"
                            className="flex min-w-0 flex-1 items-center gap-2 text-left transition-colors hover:text-emerald-50"
                            onClick={() => toggleSession(interactionId)}
                            aria-expanded={!collapsed}
                          >
                            {collapsed ? <ChevronRight className="h-4 w-4 shrink-0 text-emerald-300" /> : <ChevronDown className="h-4 w-4 shrink-0 text-emerald-300" />}
                            <span className="min-w-0 flex-1 truncate font-semibold text-emerald-50">{session.context.label}</span>
                            <span className="shrink-0 text-[11px] text-emerald-100/55">{session.totalChars.toLocaleString()} 字符</span>
                            <span className={cn("shrink-0 rounded border px-1.5 py-0.5 text-[10px]", active ? "border-emerald-400/45 text-emerald-200" : "border-emerald-400/20 text-emerald-100/65")}>
                              {phaseLabel(session.phase)}
                            </span>
                          </button>
                          {active ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="h-7 shrink-0 gap-1 px-2 font-mono text-[10px] text-rose-200 hover:bg-rose-400/10 hover:text-rose-50"
                              disabled={cancellingIds.has(interactionId) || cancellingAll}
                              onClick={() => void handleCancelSession(interactionId)}
                            >
                              <Square className="h-3 w-3 fill-current" />
                              中断
                            </Button>
                          ) : null}
                        </div>
                        {!collapsed ? (
                          <div className="border-t border-emerald-400/15 px-3 py-2">
                            <div className="mb-2 text-[11px] text-emerald-100/60">{session.phaseMessage}</div>
                            <pre className="m-0 whitespace-pre-wrap break-words text-emerald-100">{session.preview || "等待模型开始返回内容…"}</pre>
                          </div>
                        ) : null}
                      </section>
                    );
                  })}
                </div>
              ) : (
                <div className="text-emerald-200/65">
                  {connected ? "前台日志已清空，等待新的 AI 生成开始…" : "正在连接 AI 实况服务…"}
                </div>
              )}
            </div>

            <footer className={cn(
              "flex shrink-0 items-center justify-between gap-3 border-t border-emerald-400/25 bg-[#0d1714] px-3 text-xs text-emerald-100/65",
              briefMode ? "py-1.5" : "py-2",
            )}>
              <span>{followingLatest ? "正在跟随最新输出" : "已停留在当前阅读位置"}</span>
              {!briefMode ? (
                <Button type="button" size="sm" variant="ghost" className="h-7 px-2 font-mono text-xs text-emerald-200 hover:bg-emerald-400/10 hover:text-emerald-50" onClick={scrollToLatest}>
                  回到最新输出
                </Button>
              ) : (
                <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-emerald-300/60">Live</span>
              )}
            </footer>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </>
  );
}
