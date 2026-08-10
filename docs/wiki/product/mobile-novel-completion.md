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
- 任务驾驶舱、章节队列、章节辅助栏在 `≤767px` 使用 Bottom Sheet。
- Sheet 高度上限约 `85dvh`，底部考虑 `safe-area-inset-bottom`。
- 主按钮触控高度不低于 44px，输入字号不低于 16px。

### 质量债与全局失败

- 章节局部质量问题、可继续的质量债，只作为章节级提醒或债务，不阻断全书自动导演链。
- 仅 `stop_for_replan` / `replan_required` / 无可用章节内容 / 安全与数据完整性失败可停全局链。
- UI 上质量债用警告语气，不伪装成整链失败。

### 禁止

- 把桌面三栏简单纵向堆叠后当作手机完成态。
- 用关键词兜底代替已有投影里的下一步动作。
- 在手机上把 Creative Hub 扩成全能聊天台（后续阶段再做手机构图）。

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
