# 漫画原文保真改编（新闻 / 报道）

## Background

部分用户希望把新闻、报道或纪实原文粘贴进漫画工作区，**不改引语、不改事实**，只做分镜与画面化，再沿用现有出图与导出链路。这与「小说改编漫画」不同：后者允许压缩对白、强化钩子与悬念；保真模式则把原文当作对白与事实的唯一依据。

## Decision

保真能力挂在现有 **漫画工作区 → 文本导入**，不另开独立产品路由。改编模式写入 `ComicProject.stylePreset` JSON 的 `adaptationMode` 字段（`faithful` | `creative`），避免新增数据库列。

- `text_import` + `faithful`：新闻/报道默认路径
- `text_import` + `creative`：长文可概括改编，行为接近创意漫画
- 其他来源类型默认 `creative`

内容解析与分格 Prompt 走 **Prompt Registry**，不在 service 内拼 inline prompt。

## Current Rule

### 内容源（adaptation 层）

- [`TextImportSourceAdapter`](../../server/src/services/adaptation/source/TextImportSourceAdapter.ts) + Prompt `adaptation.source.text_bundle@v1`
- 保真解析：抽取 `hardFacts`、`quotedLines`，beats 仅做事件顺序切片，保留 `rawText`
- [`OriginalSourceAdapter`](../../server/src/services/adaptation/source/OriginalSourceAdapter.ts) 供漫画 `original` 创建补齐
- 漫画侧在 [`ComicProjectService`](../../server/src/services/comic/ComicProjectService.ts) 注册上述 adapter（与 `NovelSourceAdapter` 并列）

### 分话

- 保真：`comic.episodeOutline.faithful@v1`，按报道段落/事件块分话，写入每话 `ComicEpisode.sourceText`（原文连续摘录）
- 创意：沿用 `comic.episodeOutline@v1` + rhythmEngine 钩子/卡点

### 分格

- 保真：`comic.panelScript.faithful@v1`，`dialogues[].text` 须为原文连续子串；旁白 `caption` 也不得新增事实
- `ComicPanelScriptService` 对 `text_import` 注入 `sourceText`（优先话级 excerpt，否则 bundle/raw 全文）
- 自动分格完成后异步跑 `comic.fidelityCheck@v1`，结果写入 `ComicEpisode.scriptConfig.qualityDebt`，**不阻断**格子出图

### 用户可编辑边界

- 允许：单格画面脚本、手动改气泡文字（用户自担）
- 不允许在产品层用关键词/正则替代 AI 保真判断（校验由结构化 Prompt 完成）

## Failure Modes

- 模型仍轻微改写引语 → `qualityDebt` 提示 + 用户在分格界面改气泡
- 短文只分 1 话时，整段原文作为 `sourceText` fallback
- 真人肖像：不承诺写实一致；人物用简化形象 + 姓名标注更稳妥

## Related Modules

- `server/src/services/adaptation/` — SourceBundle 契约与 adapter
- `server/src/services/comic/` — 分话、分格、保真校验
- `server/src/prompting/prompts/adaptation/sourceBundle.prompts.ts`
- `server/src/prompting/prompts/comic/comic.prompts.ts` — faithful outline/script/fidelityCheck
- `client/src/pages/comic/ComicWorkspacePage.tsx` — 粘贴原文与保真开关

## Examples

1. 创建项目：来源「粘贴原文」→ 保真改编 → 粘贴新闻 → 创建
2. 项目内：导入内容源 → 生成分话大纲 → 生成分格脚本 → 角色设定 → 格子出图 → 导出
