export const LLM_HUMAN_RELAY_ENABLED_KEY = "llm.humanRelay.enabled";
export const LLM_HUMAN_RELAY_SETTING_KEYS = [LLM_HUMAN_RELAY_ENABLED_KEY] as const;
export const LLM_HUMAN_RELAY_DEFAULT_ENABLED = false;
/** 单次粘贴结果最大字符数，防止异常超大 payload。 */
export const LLM_HUMAN_RELAY_MAX_RESPONSE_CHARS = 2_000_000;
