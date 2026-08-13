# 移动端整本小说完成原则

## Background

产品已有手机站点壳与小说工作区壳，但章节执行、任务恢复与自动导演仍容易把桌面三栏密度压到窄屏上。新手在手机上的目标不是“看到全部专家面板”，而是能继续推进整本小说。

## Decision

移动端体验围绕「开书 → 自动导演推进 → 阻塞时恢复 → 写下一章」主链设计。辅助信息进入 Bottom Sheet，每屏只突出一个主操作。

## Current Rule

### 主链

1. 首页或小说壳给出当前下一步。
2. 自动导演任务可从手机小说壳直接打开任务 Sheet。
3. 阻塞 / 可恢复状态展示单一「继续 / 恢复」动作。
4. 恢复链接使用 `/novels/auto-director?taskId=...`，不以 `workspaceTaskId` 顶替导演任务 id。
5. 章节执行页：正文为主视觉；章节队列、洞察、参考进入 Sheet；主 CTA 粘性全宽。

### Sheet 用法

- 共享原语：`client/src/components/ui/sheet.tsx`（vaul，默认 bottom）。
- 任务驾驶舱、章节队列、章节辅助栏、创作中枢的小说/线程辅助在 `≤767px` 使用 Bottom Sheet。
- Sheet 高度上限约 `85dvh`，底部考虑 `safe-area-inset-bottom`。
- 主按钮触控高度不低于 44px，输入字号不低于 16px。
- 底部 Sheet 默认 `handleOnly`：只有拖动手柄会下滑关闭；内容区上滑触顶不再整层消失。关闭仍可用右上角关闭与点遮罩。

### 布局所有权

- 主链页面（首页、小说列表、开书/跟进、章节、创作中枢、设置、运行记录）用 `mobile-page-*` 与页面/契约类自管手机布局。
- 需要手机上保留多列的网格加 `mobile-grid-keep`（或已登记的 `home-status-summary-grid` / `auto-director-follow-up-section-grid`），避免被全局「响应式列塌成一列」覆盖。
- `index.css` 的 `.mobile-route-*` 仅保留薄壳（宽度、overflow、输入字号）与尚未迁移的专家页密化；禁止再给已迁移主链页加强制列数 / 隐藏说明文字。

### 手机导航与浮动控件

- 页面级「回到顶部 / 去到底部」挂在 `MobileScrollEdgeButtons`：站点壳与小说工作区各挂一份，避开章节 Bottom Sheet；底部偏移需躲开粘性主 CTA / 底栏。
- AI 创作实况 compact 触发器在手机上使用 `floating`：可拖动，位置写入 `localStorage`（`ai-novel.live-execution.trigger.position`）；默认右上。轻点打开，拖动超过阈值不打开。
- 小说工作区（含章节执行）绕过站点底栏，必须在 `MobileNovelEditView` 提供左侧「工作区导航」抽屉：首页、我的小说、短剧工作台、漫画工作台、当前工作区、运行记录；有导演任务时提供继续自动导演入口。
- 站点壳底栏「更多」与顶栏九宫格「更多入口」首组为「短剧与漫画」，可直接进入 `/drama` 与 `/comic`；桌面侧栏对应入口可点击，不得再标成「即将推出」。
- `/comic` 与 `/comic/projects/:id` 必须注册手机路由标题（漫画工作台 / 漫画项目），并归入 `creation` 导航组，避免打开漫画页后顶栏标题退化成「更多功能」。

### 小说工作区步骤

- 手机小说壳先展示「当前步骤」与「去推荐步骤」。
- 主线步骤（设定、规划、世界、角色、章节、质量）保留紧凑横滑。
- 卷战略、节奏拆章、版本历史归入「专家能力」，默认折叠。

### 创作中枢手机构图

- 首屏：推荐下一步 + 对话推进。
- 「小说与生产」「创作现场」进入 Bottom Sheet，不抢对话主视觉。
- 重生产动作应引导到自动导演，不把中枢扩成全能聊天台。

### 设置页

- 手机设置页顶部提供快捷配置入口（厂商 / Key / 模型）。
- 完整厂商、路由、RAG 与自动导演偏好保留在页面后部，不挡开书。

### 沉浸章节编辑器

- 手机上正文为唯一主视觉；章节信息与 AI 改写进入 Bottom Sheet。
- 选中片段后提示打开 AI 改写，不使用易挡字的浮动工具栏。
- 底部粘性保存，触控高度不低于 44px。
- 手机正文随页面滚动（非整屏锁死内部滚动），右侧提供回到顶部 / 去到底部。
- 顶部提供工作区导航抽屉（回首页等）与上一章 / 下一章切换；未保存时先提示保存再切章。
- 手机对比改写：选中后可一键优化/扩写/精简；生成开始后收起发起面板，正文保留对比；底部决策条完成「用这个版本 / 不要了 / 再生成」。

### 小说列表与开书

- 手机小说列表主按钮全宽优先「AI 自动导演开书」；短篇与手动创建降为次级。
- 书架在窄屏强制单列，避免过窄双列。
- 工作台卡片进度说明默认可见，不依赖悬停。
- `/novels/auto-director` 注册为独立手机路由标题「自动导演开书」。
- 开书各阶段主按钮在手机上粘性全宽，起始想法页降低纵向居中压力。

### 导演跟进

- 手机上先看列表；点选后再打开详情 Sheet。
- 概览分区保持两列可读标签，不再用全局 CSS 隐藏说明文字。

### 质量债与全局失败

- 章节局部质量问题、可继续的质量债，只作为章节级提醒或债务，不阻断全书自动导演链。
- 仅 `stop_for_replan` / `replan_required` / 无可用章节内容 / 安全与数据完整性失败可停全局链。
- UI 上质量债用警告语气，不伪装成整链失败。

### 禁止

- 把桌面三栏简单纵向堆叠后当作手机完成态。
- 用关键词兜底代替已有投影里的下一步动作。
- 在手机上把 Creative Hub 扩成全能聊天台。

## Examples

推荐：

- 任务 Sheet 顶部展示 `nextActionLabel` + 主按钮。
- 章节页底栏只显示「写本章 / 审校 / 修复」中当前主动作。
- 小说壳 Header 直接露出任务入口。

禁止：

- 恢复入口埋在多层 Dialog / 「更多」深处。
- 质量债文案写成“自动导演已失败，请重开任务”。

## Failure Modes

- 恢复链回到旧 `workflowTaskId + mode=director`：应修正为 `/novels/auto-director?taskId=...`。
- Sheet 与页面双重滚动：正文区单一滚动，Sheet 自带内部滚动。
- 主 CTA 被底栏导航遮挡：小说工作区页面自管安全区，动作条加 `safe-area`。

## Related Modules

- `client/src/components/layout/mobile/`
- `client/src/pages/novels/mobile/`
- `client/src/pages/novels/components/NovelTaskDrawer.tsx`
- `client/src/pages/novels/components/ChapterManagementTab.tsx`
- `client/src/components/autoDirector/AICockpit.tsx`

## Source Documents

- `docs/wiki/product/beginner-first-novel-completion.md`
- `docs/design/product-ui-design-system.md`
- `docs/wiki/workflows/auto-director-runtime.md`
- `docs/wiki/workflows/chapter-production-chain.md`
