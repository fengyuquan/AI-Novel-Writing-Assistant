# LLM 提示词调用记录

本模块把发往模型 API 的**请求提示词**持久化到数据库，供设置页查看与导出。

## 边界

| 能力 | 职责 | 是否长期存储 |
| --- | --- | --- |
| 本模块 `promptLog` | 只记请求 messages / payload | 是（SQLite / Postgres，可开关与保留条数） |
| `llm/debugLogging` + `.logs/*.llm.jsonl` | 开发期控制台与文件调试日志（含请求与回复） | 文件级，非产品 UI |
| `platform/llm/live` AI 实况 | 临时输出预览与阶段事件 | 否（内存，短保留） |
| `DirectorLlmUsageRecord` | Token / 调用次数归因 | 是，但不含提示词正文 |

## 拦截点

所有经 `getLLM` → `attachLLMDebugLogging` 装饰的调用，在真正发出请求前序列化 messages，并异步写入 `LlmPromptInvocationLog`。  
写入失败只记 warn，不阻塞 LLM 调用。

## 设置

- `llm.promptLog.enabled`：默认开启
- `llm.promptLog.retentionCount`：默认 200，超出自动清理最旧记录
- 单条 `messagesJson` 超过约 512KB 会截断并标记 `truncated=true`

## HTTP

挂载于 `/api/llm/prompt-logs`：列表、详情、导出、清空、读写设置。
