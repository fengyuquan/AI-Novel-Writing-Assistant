export class LlmRequestCancelledError extends Error {
  override readonly name = "LlmRequestCancelledError";

  constructor(message = "用户已中断本次模型请求") {
    super(message);
  }
}

export function isLlmRequestCancelledError(error: unknown): boolean {
  if (error instanceof LlmRequestCancelledError) {
    return true;
  }
  if (!error || typeof error !== "object") {
    return false;
  }
  const name = (error as { name?: unknown }).name;
  if (name === "LlmRequestCancelledError" || name === "AbortError") {
    return true;
  }
  const message = error instanceof Error ? error.message : String(error);
  return /用户已中断|Request aborted|aborted/i.test(message);
}
