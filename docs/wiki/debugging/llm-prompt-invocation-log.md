# 提示词调用记录

## 背景

排查生成质量时，经常需要确认「系统实际发给模型的提示词」是什么。项目里已有三类相关能力，职责不同：

- 文件级 `LLM_DEBUG` / `.llm.jsonl`：开发期请求与回复调试日志
- AI 实况：面向用户的临时输出预览，不存提示词正文
- Token 用量记录：只记调用与 token，不含 messages

需要一个可在产品设置页查看、导出的**请求提示词**账本，且不能污染新手主创作路径。

## 决策

在 LLM 出站装饰层（`attachLLMDebugLogging`）统一拦截发往 API 的请求 messages，异步写入 `LlmPromptInvocationLog`。  
只存请求，不存模型回复。默认开启，可用设置关闭，并按保留条数自动清理。

## 当前规则

- 拦截覆盖所有经 `getLLM` 装饰的调用（含 Prompt Registry、repair、workbench）。
- 持久化失败只记 warn，不得阻塞或改变 LLM 调用结果。
- 产品 UI 入口在「系统设置 → 系统维护 → 提示词调用记录」，不并入 AI 实况、任务中心主路径。
- 单条 messages 超过约 512KB 时截断并标记 `truncated=true`。
- 保留条数默认 200，可在 10–2000 调整；超额删除最旧记录。
- 文件 JSONL debug 日志与本模块并行存在，互不替代。

## 示例

推荐：

- 生成结果异常时，到设置页打开对应记录，核对 prompt 资产、上下文与任务类型。
- 需要外发分析时，导出当前筛选的 JSONL。

不推荐：

- 把提示词正文塞进 `DirectorLlmUsageRecord` 或 AI 实况事件。
- 用关键字匹配绕过 Prompt Registry，单独再拼一套日志路径。

## 失败模式

- 设置页没有新记录：先确认开关已开启，再确认调用是否走了 `getLLM`；表未创建时服务端会 warn 并跳过写入，重启/`db push` 后重试。
- 记录被截断：检查单次上下文是否过大；导出里会带 `truncated` 标记。
- 磁盘/库膨胀：调低保留条数或清空筛选结果。

## 相关模块

- `server/src/platform/llm/promptLog/`
- `server/src/llm/debugLogging.ts`
- `client/src/pages/settings/PromptLogsPage.tsx`
- `shared/types/llmPromptLog.ts`

## 来源文档

- 模块说明：`server/src/platform/llm/promptLog/README.md`
- AI 实况边界：`server/src/platform/llm/live/README.md`
- 文件日志保留：`./log-retention.md`
