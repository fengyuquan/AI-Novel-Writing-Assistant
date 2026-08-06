# LLM 人工中继

## 背景

部分场景下，用户希望系统仍然组装提示词并走完整创作链路，但实际模型调用改由自己在外部 API / 网页版模型完成。需要在系统和出站 API 之间插入一次可交互的人工接力，而不是改写产品意图路由。

## 决策

在 `createLLMFromResolvedOptions` 的最外层装饰 `attachLLMHumanRelay`：

1. 设置项 `llm.humanRelay.enabled` 开启后，拦截 `invoke` / `stream` / `batch`。
2. 服务端登记待处理请求，并通过 SSE/轮询通知前端。
3. 全局弹窗展示可复制提示词；用户粘贴外部返回后 `resolve`，系统把该文本当作模型输出继续。
4. 关闭开关或取消请求会拒绝等待中的 Promise，避免任务永久挂起。

这是传输层能力，不替代 Prompt Registry、结构化输出或自动导演决策。

## 当前规则

- 默认关闭；入口在「系统设置 → 系统维护 → 人工中继」。
- 拦截发生在限流装饰之外，人工等待不占用 provider 并发槽。
- 人工中继开启时，`runWithEnforcedTimeout` 会跳过请求超时，避免粘贴等待被自动掐断；任务主动 Abort 仍会取消等待。
- `stream` 返回单段合成 chunk，保证依赖 `for await` 的链路可继续。
- `batch` 按条目顺序分别等待粘贴。
- 粘贴内容有上限（约 200 万字符）；空内容不可提交。
- 下游 JSON 解析 / repair 仍会执行；若外部返回不是合法结构化结果，可能再次触发修复调用并再次弹窗。

## 示例

推荐：

- 本地暂无可用密钥，但要用外部网页版模型完成单次规划或试写。
- 排查提示词时，先复制系统组装结果，再手工交给外部模型验证。

不推荐：

- 在自动导演全书生产时长期开启（会频繁弹窗）。
- 把人工中继当成产品意图识别的关键词分流。

## 失败模式

- 开启后无弹窗：确认设置已保存，并确认调用走了 `getLLM` / `createLLMFromResolvedOptions`。
- 提交后任务仍失败：检查粘贴内容是否符合该提示词要求的结构化 JSON。
- 关闭开关后旧任务报错：属于预期，待处理 waiter 会被取消。

## 相关模块

- `server/src/platform/llm/humanRelay/`
- `shared/types/llmHumanRelay.ts`
- `client/src/components/humanRelay/HumanRelayDialog.tsx`
- AI 实况：`../workflows/llm-live-execution.md`
- 提示词记录：`./llm-prompt-invocation-log.md`
