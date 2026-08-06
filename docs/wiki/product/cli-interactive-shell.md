# 命令行交互壳边界

## 背景

产品主界面仍是网页 / 桌面工作台。部分用户希望在终端里用菜单和问答完成同一套开书与推进操作，而不另起一套业务逻辑。

## 决策

新增 `@ai-novel/cli` 作为**薄交互壳**：

- 只调用现有后端 `/api`
- 与网页端共享同一数据库中的小说、导演任务、章节与设置
- 不修改网页端信息架构，不复制自动导演 / 章节生产业务规则

## 当前规则

- 入口：`pnpm dev:cli`（需先有后端，如 `pnpm dev` / `pnpm dev:server`）
- 默认 API：`http://localhost:3000/api`
- MVP 能力：创作环境快捷配置、选择/新建小说、大纲优先开书、启动自动导演、确认候选方向、查看/修订故事规划（自然语言校准步骤）、查看进度、继续/批准关卡、订阅短时 AI 实况、浏览章节、运行记录概览、导出章节大纲
- 大纲优先配置保存在本机 `~/.ai-novel-writing-assistant/cli-profile.json`，默认 800 章 / 每章不少于 3000 字；导演停在开写前，不自动进入正文生产。
- 修订故事规划优先走导演 `calibrate_step`（`improve` / `regenerate` + 自然语言 `instruction`），改完停在步骤复核；用户确认后再 `accept_manual_changes_and_continue`。不要用章节 `/replan` 当大纲修订。
- 进度展示以导演任务快照轮询为主，AI 实况 SSE 为辅
- 复杂编辑（世界观细调、提示词编辑器、漫画/短剧等）仍走网页端

## 失败模式

- 连不上后端：提示先启动 `pnpm dev` 或 `pnpm dev:server`
- 创作环境未就绪：引导命令行快捷配置；仍失败时到网页设置页检查任务路由
- 导演命令长时间无结果：提示到网页运行记录查看，CLI 不阻塞全局链

## 相关模块

- `cli/`
- `server/src` 现有 `/api/novels`、`/api/novels/director`、`/api/settings`、`/api/tasks`、`/api/llm-live`

## 来源文档

- [cli/README.md](../../../cli/README.md)
- [自动导演质量门禁规则](../../../AGENTS.md)
