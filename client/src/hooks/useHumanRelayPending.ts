import { useEffect, useState } from "react";
import type {
  LlmHumanRelayPendingList,
  LlmHumanRelayPendingRequest,
  LlmHumanRelayStreamFrame,
} from "@ai-novel/shared/types/llmHumanRelay";
import { API_BASE_URL } from "@/lib/constants";
import { listLlmHumanRelayPending } from "@/api/llmHumanRelay";

function sortPending(items: LlmHumanRelayPendingRequest[]): LlmHumanRelayPendingRequest[] {
  return [...items].sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}

export function useHumanRelayPending(enabled: boolean) {
  const [pending, setPending] = useState<LlmHumanRelayPendingList>({
    enabled: false,
    items: [],
  });
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setPending({ enabled: false, items: [] });
      setConnected(false);
      return;
    }

    let disposed = false;
    const controller = new AbortController();

    const applyList = (next: LlmHumanRelayPendingList) => {
      if (disposed) {
        return;
      }
      setPending({
        enabled: next.enabled,
        items: sortPending(next.items),
      });
    };

    const refresh = async () => {
      try {
        const response = await listLlmHumanRelayPending();
        if (response.data) {
          applyList(response.data);
        }
      } catch {
        // Keep last known pending list; SSE/reconnect will refresh.
      }
    };

    const connect = async () => {
      let attempt = 0;
      while (!disposed && !controller.signal.aborted) {
        try {
          const response = await fetch(`${API_BASE_URL}/llm/human-relay/stream`, {
            signal: controller.signal,
          });
          if (!response.ok || !response.body) {
            throw new Error("人工中继连接失败");
          }
          attempt = 0;
          if (!disposed) {
            setConnected(true);
          }
          const reader = response.body.getReader();
          const decoder = new TextDecoder("utf-8");
          let buffer = "";
          while (!controller.signal.aborted) {
            const { value, done } = await reader.read();
            if (done) {
              break;
            }
            buffer += decoder.decode(value, { stream: true });
            const frames = buffer.split("\n\n");
            buffer = frames.pop() ?? "";
            for (const rawFrame of frames) {
              const dataLine = rawFrame.split("\n").find((line) => line.startsWith("data: "));
              if (!dataLine) {
                continue;
              }
              const frame = JSON.parse(dataLine.slice(6)) as LlmHumanRelayStreamFrame;
              if (frame.type === "snapshot") {
                applyList(frame.pending);
                continue;
              }
              if (frame.type === "event") {
                const event = frame.event;
                if (event.type === "pending_added") {
                  setPending((current) => ({
                    ...current,
                    items: sortPending([
                      ...current.items.filter((item) => item.id !== event.item.id),
                      event.item,
                    ]),
                  }));
                } else if (event.type === "pending_resolved") {
                  setPending((current) => ({
                    ...current,
                    items: current.items.filter((item) => item.id !== event.id),
                  }));
                } else if (event.type === "settings_changed") {
                  setPending((current) => ({
                    ...current,
                    enabled: event.enabled,
                    items: event.enabled ? current.items : [],
                  }));
                }
              }
            }
          }
        } catch {
          // Fall through to reconnect / poll.
        }

        if (disposed || controller.signal.aborted) {
          break;
        }
        if (!disposed) {
          setConnected(false);
        }
        attempt += 1;
        const delayMs = Math.min(30_000, 1_000 * 2 ** Math.min(attempt, 4));
        await new Promise<void>((resolve) => {
          window.setTimeout(resolve, delayMs);
        });
      }
    };

    void refresh();
    void connect();
    const poll = window.setInterval(() => {
      void refresh();
    }, 8_000);

    return () => {
      disposed = true;
      controller.abort();
      window.clearInterval(poll);
      setConnected(false);
    };
  }, [enabled]);

  return {
    connected,
    enabled: pending.enabled,
    items: pending.items,
    active: pending.items[0] ?? null,
    queueCount: pending.items.length,
  };
}
