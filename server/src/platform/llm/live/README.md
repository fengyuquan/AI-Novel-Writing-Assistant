# LLM 实况执行边界

本模块提供 LLM 生成过程的临时可视化事件，不负责业务结果、任务状态或数据库写入。

- `LlmLiveBroker` 维护短期会话、最新预览、订阅，以及每个会话绑定的 `AbortController`；完成、失败或取消会话保留 10 分钟，便于页面重连。
- `llmLiveSession` 将 Prompt 调用元数据映射为可订阅的任务、小说、章节上下文。
- `http/llmLiveRoutes` 以 SSE 输出全局或按任务筛选的快照和增量事件；断开浏览器连接只会取消订阅，不能取消服务端生成。
- 显式中断入口：`POST /sessions/:interactionId/cancel`、`POST /cancel-active`。中断会 abort 会话信号，并把相位标为 `cancelled`。

调用方必须由服务端消费模型流并继续执行原有的解析、校验、修复和保存逻辑；同时把会话 `signal` 合并进模型调用，使「中断」能真正停掉上游请求。实况内容是未校验预览，不能被当作正式小说内容或任务完成依据。
