# 数据管理控制台（Admin DB Console）

## 背景

本产品默认是单实例写作环境，运维时经常需要直接查看或修正库内数据。Prisma Studio 可用，但缺少项目内统一入口、口令保护和敏感字段脱敏。控制台以「一本小说的内容」为主路径，通用表 CRUD 降为高级能力，方便日常读内容与轻量改数，而不是做成多租户 SaaS 管理端。

## 决策

- 独立前端包 `admin/`（React + Vite，端口 5174），复用现有 Express/Prisma 服务。
- **主路径内容驱动**：小说库 → 单本小说工作台（总览 / 章节阅读 / 角色卡 / 大纲 / 任务时间线）。
- **高级路径表驱动**：工作台内「高级表」与全局 `/models` 仍基于 Prisma DMMF 通用 CRUD。
- 使用环境变量 `ADMIN_TOKEN` 作为唯一管理口令；未配置时整个 `/api/admin` 写/读数据入口不可用。
- 不开放 raw SQL、批量 truncate、`migrate reset`。

## 当前规则

### 信息架构

- 默认入口：`/novels` 小说卡片库。
- 工作台：`/novels/:novelId` 及 `/chapters`、`/characters`、`/outline`、`/tasks`、`/advanced`。
- 旧路径 `/novels/:novelId/:ModelName` 重定向到 `/novels/:novelId/advanced/:ModelName`。
- 全局全表：`/models`；审计：`/audit`。

### 内容投影 API

- `GET /api/admin/novels/:novelId/workspace`：小说摘要、章节目录（`hasContent`，不拉全文）、角色卡字段、最近工作流/生成任务、卷规划、NovelBible 摘要、子表计数。
- `GET /api/admin/novels/:novelId/chapters/:chapterId`：单章元数据 + 完整 `content` 与字数，供阅读器使用。
- 写操作仍走通用 `POST/PATCH/DELETE /api/admin/models/:model`；投影 API 只读。
- 章节阅读支持上下章导航；工作台侧栏可快速切换小说。

### 安全与改数纪律

- 启用条件：`server/.env` 中设置非空 `ADMIN_TOKEN`。
- 鉴权：`POST /api/admin/login`；后续请求带 `Authorization: Bearer <token>`。
- 敏感字段：`APIKey.key` 脱敏；更新时留空表示不修改。
- 删除必须 `confirm=true`；删除预览展示关联影响；Novel 或关联 ≥20 行需输入 `DELETE`。
- 创建/更新/删除写入 `admin-audit.jsonl`，UI `/audit` 可查。
- where/orderBy 仅允许 schema 真实字段与白名单运算符。
- 危险表默认只读；写操作需 `X-Admin-Write-Unlock: true`（UI「高级写解锁」，session 级）。
- 侧栏备份提示；不提供自动 reset。
- 受控批量仅 `NovelWorkflowTask` / `GenerationJob` / `AgentRun`：必须 where、先 preview 再 execute、单次最多 200（硬顶 500）。
- `GET /api/admin/novels/:novelId/export` 导出该小说 JSON 切片（每表最多 500 行）。
- 受控导入：`POST .../import/preview` → `POST .../import/execute`（需输入 `IMPORT`）。
  - 只 upsert 内容白名单表（Chapter / Character / NovelBible / VolumePlan / PlotBeat 等），强制绑定目标 `novelId`。
  - **不删除**库内已有行；任务/运行时/快照表忽略；主键冲突且归属其他小说则跳过。
  - 会更新目标小说的标量字段；导入前 UI/文案要求备份。
- 大字段 / JSON 字段使用大文本编辑器（格式化与校验）。

### 阅读体验与运维快捷能力

- 章节与大纲使用独立阅读字体与纸面色；阅读器支持字号/行宽/夜间偏好（localStorage）。
- 章节面板支持标题+正文搜索（`GET .../chapters/search`）。
- 大纲分区优先展示卷规划树与 `structuredOutline` JSON 树；失败则回退纯文本。
- 角色可按 `relationToProtagonist` / `factionLabel` 分组。
- 任务时间线支持单条：取消 / 标失败 / 清 `pendingManualRecovery`。
- 总览含导演/流水线摘要（运行中、需关注、检查点摘要）。
- `POST /api/admin/backup`：SQLite 复制到 `backups/dev-<timestamp>.db` 并校验大小；Postgres 仅提示自行 dump。
- 导入预览含小说字段 diff、章节/角色数量对比、冲突 ID 列表。

## 示例

推荐：

1. 在 `server/.env` 设置 `ADMIN_TOKEN`。
2. 启动 API：`pnpm dev:server`。
3. 启动控制台：`pnpm dev:admin`，打开 `http://localhost:5174`。
4. 登录后从小说库进入一本小说，先读章节/角色/任务；需要改任意关联表时再进「高级表」。

禁止：

- 把 Admin API 暴露到公网且不设强口令。
- 用该控制台执行任意 SQL 或数据库重置。
- 把本地口令提交进仓库。

## 失败模式

- 登录页提示未启用：检查 `ADMIN_TOKEN` 是否配置并已重启 server。
- 401：重新登录。
- 章节正文空白：确认 `Chapter.content` 是否为空，而非前端渲染问题。
- 危险表保存 403：开启「高级写解锁」后再写。
- 更新失败：以外键/枚举/必填的 Prisma 错误为准修正数据。

## 相关模块

- `admin/src/pages/NovelLibraryPage.tsx`
- `admin/src/pages/NovelWorkspacePage.tsx`
- `admin/src/pages/workspace/`
- `admin/src/components/reader/ChapterReader.tsx`
- `admin/src/pages/ModelBrowserPage.tsx`
- `admin/src/pages/AuditPage.tsx`
- `server/src/modules/admin/`
- `server/src/modules/admin/application/adminNovelWorkspaceService.ts`
- `server/src/modules/admin/application/adminDrilldownService.ts`
- `server/src/modules/admin/application/adminNovelExportService.ts`
- `server/src/modules/admin/application/adminNovelImportService.ts`
- `admin/src/components/ImportNovelDialog.tsx`
- `server/src/modules/admin/application/adminBatchService.ts`
- `server/src/modules/admin/infrastructure/adminAuditStore.ts`

## 来源文档

- 功能计划：后台数据管理控制台（Admin DB Console）
- 内容驱动工作台迭代（1A 小说工作台 + 2C 阅读体验优先）
