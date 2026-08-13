import type { DramaLLMOptions } from "@/api/drama";
import { useLLMStore } from "@/store/llmStore";

/** Build drama LLM request options from the current top-bar model selection. */
export function getDramaLlmOptions(): DramaLLMOptions {
  const { provider, model, temperature } = useLLMStore.getState();
  return {
    ...(provider ? { provider } : {}),
    ...(model ? { model } : {}),
    temperature,
  };
}
