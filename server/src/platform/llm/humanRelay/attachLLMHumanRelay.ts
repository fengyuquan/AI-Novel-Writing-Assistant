import { AIMessage, AIMessageChunk } from "@langchain/core/messages";
import type { ChatOpenAI } from "@langchain/openai";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import type { LlmHumanRelayMessagesPayload } from "@ai-novel/shared/types/llmHumanRelay";
import type { TaskType } from "../../../llm/modelRouter";
import type { PromptInvocationMeta } from "../../../prompting/core/promptTypes";
import { serializeLLMInputForJson } from "../../../llm/debugLogging";
import { humanRelayService } from "./HumanRelayService";

const LLM_HUMAN_RELAY_PATCHED = Symbol("LLM_HUMAN_RELAY_PATCHED");

export interface LLMHumanRelayMeta {
  provider: LLMProvider;
  model: string;
  taskType?: TaskType;
  promptMeta?: PromptInvocationMeta;
}

type PatchableChatOpenAI = ChatOpenAI & {
  [LLM_HUMAN_RELAY_PATCHED]?: boolean;
};

function formatPromptText(messages: unknown): string {
  if (typeof messages === "string") {
    return messages;
  }
  if (!Array.isArray(messages)) {
    try {
      return JSON.stringify(messages, null, 2);
    } catch {
      return String(messages);
    }
  }
  if (messages.length > 0 && typeof messages[0] === "object" && messages[0] && "payload" in (messages[0] as object)) {
    return (messages as Array<{ index: number; payload: unknown }>).map((entry) => {
      return [
        `===== batch_input_${entry.index + 1} =====`,
        formatPromptText(entry.payload),
      ].join("\n");
    }).join("\n\n");
  }
  return (messages as Array<{ role?: string; content?: string }>).map((entry, index) => {
    const role = entry.role?.trim() || `message_${index + 1}`;
    const content = typeof entry.content === "string" ? entry.content : String(entry.content ?? "");
    return `----- ${role} -----\n${content}`;
  }).join("\n\n");
}

function toMessagesPayload(method: "invoke" | "stream" | "batch", input: unknown): LlmHumanRelayMessagesPayload {
  return serializeLLMInputForJson(method, input) as LlmHumanRelayMessagesPayload;
}

function extractCallSignal(options: unknown): AbortSignal | undefined {
  if (!options || typeof options !== "object") {
    return undefined;
  }
  const signal = (options as { signal?: unknown }).signal;
  return signal instanceof AbortSignal ? signal : undefined;
}

async function waitHumanResponse(
  method: "invoke" | "stream" | "batch",
  input: unknown,
  meta: LLMHumanRelayMeta,
  options: unknown,
): Promise<string> {
  const messages = toMessagesPayload(method, input);
  return humanRelayService.waitForResponse({
    provider: meta.provider,
    model: meta.model,
    taskType: meta.taskType ?? null,
    method,
    promptAssetKey: meta.promptMeta?.promptId
      ? `${meta.promptMeta.promptId}@${meta.promptMeta.promptVersion ?? "unknown"}`
      : null,
    promptVersion: meta.promptMeta?.promptVersion ?? null,
    novelId: meta.promptMeta?.novelId ?? null,
    taskId: meta.promptMeta?.taskId ?? null,
    chapterId: meta.promptMeta?.chapterId ?? null,
    promptText: formatPromptText(messages),
    messages,
    signal: extractCallSignal(options),
  });
}

function createSyntheticMessage(text: string): AIMessage {
  return new AIMessage({
    content: text,
    response_metadata: {
      humanRelay: true,
    },
  });
}

function createSyntheticStream(text: string): AsyncIterable<AIMessageChunk> {
  return {
    async *[Symbol.asyncIterator]() {
      yield new AIMessageChunk({
        content: text,
        response_metadata: {
          humanRelay: true,
        },
      });
    },
  };
}

/**
 * Outermost LLM decorator: when human relay is enabled, short-circuit the
 * provider call and wait for a pasted external API response.
 */
export function attachLLMHumanRelay(llm: ChatOpenAI, meta: LLMHumanRelayMeta): ChatOpenAI {
  const patchable = llm as PatchableChatOpenAI;
  if (patchable[LLM_HUMAN_RELAY_PATCHED]) {
    return llm;
  }

  const originalInvoke = llm.invoke.bind(llm);
  const originalStream = llm.stream.bind(llm);
  const originalBatch = llm.batch.bind(llm);

  patchable.invoke = (async (...args: Parameters<ChatOpenAI["invoke"]>) => {
    if (!(await humanRelayService.isEnabled())) {
      return originalInvoke(...args);
    }
    const text = await waitHumanResponse("invoke", args[0], meta, args[1]);
    return createSyntheticMessage(text) as Awaited<ReturnType<ChatOpenAI["invoke"]>>;
  }) as ChatOpenAI["invoke"];

  patchable.stream = (async (...args: Parameters<ChatOpenAI["stream"]>) => {
    if (!(await humanRelayService.isEnabled())) {
      return originalStream(...args);
    }
    const text = await waitHumanResponse("stream", args[0], meta, args[1]);
    return createSyntheticStream(text) as Awaited<ReturnType<ChatOpenAI["stream"]>>;
  }) as ChatOpenAI["stream"];

  patchable.batch = (async (...args: Parameters<ChatOpenAI["batch"]>) => {
    if (!(await humanRelayService.isEnabled())) {
      return originalBatch(...args);
    }
    const inputs = Array.isArray(args[0]) ? args[0] : [];
    const results: AIMessage[] = [];
    for (const entry of inputs) {
      const text = await waitHumanResponse("batch", entry, meta, args[1]);
      results.push(createSyntheticMessage(text));
    }
    return results as Awaited<ReturnType<ChatOpenAI["batch"]>>;
  }) as ChatOpenAI["batch"];

  Object.defineProperty(patchable, LLM_HUMAN_RELAY_PATCHED, {
    value: true,
    configurable: false,
    enumerable: false,
    writable: false,
  });

  return llm;
}
