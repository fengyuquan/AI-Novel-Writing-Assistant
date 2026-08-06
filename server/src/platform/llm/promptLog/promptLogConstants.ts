export const LLM_PROMPT_LOG_ENABLED_KEY = "llm.promptLog.enabled";
export const LLM_PROMPT_LOG_RETENTION_COUNT_KEY = "llm.promptLog.retentionCount";

export const LLM_PROMPT_LOG_SETTING_KEYS = [
  LLM_PROMPT_LOG_ENABLED_KEY,
  LLM_PROMPT_LOG_RETENTION_COUNT_KEY,
] as const;

export const LLM_PROMPT_LOG_DEFAULT_ENABLED = true;
export const LLM_PROMPT_LOG_DEFAULT_RETENTION_COUNT = 200;
export const LLM_PROMPT_LOG_MIN_RETENTION_COUNT = 10;
export const LLM_PROMPT_LOG_MAX_RETENTION_COUNT = 2000;
/** Soft max for a single messagesJson payload (characters). */
export const LLM_PROMPT_LOG_MAX_MESSAGE_CHARS = 512 * 1024;
