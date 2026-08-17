# 漫画项目整包导入/导出

## Background

漫画工作台已有「内容源 SourceBundle 导入」和「话级长图导出」，但缺少可往返的项目备份能力。用户换机、复制项目或保留阶段性成果时，需要把整项目结构（角色、场景、分话、分格、事实、画风）连同可选图片一起带走。

## Decision

提供独立的 **comic-project-transfer** 备份格式：

- `kind: "comic-project-transfer"`
- 显式 `schemaVersion`（当前为 `1`）
- 导入始终 **创建新项目**（不覆盖现有项目），并 remap 所有实体 id
- 图片可选打包（base64）；单文件与整包有体积上限
- **不**包含 `ComicExportJob` / `ComicBatchJob`（运行时任务）

与以下能力区分：

| 能力 | 用途 |
|------|------|
| SourceBundle 导入 | 从小说/文本拉内容源，不是项目备份 |
| 话级长图导出 | 发布用成品图 |
| 整项目备份 | 可再导入的项目快照 |

## Current Rule

1. 导出：`GET /api/comic/projects/:id/project-export?includeImages=true|false`
2. 预览：`POST /api/comic/projects/project-import/preview` body `{ package }`
3. 导入：`POST /api/comic/projects/project-import` body `{ package, titleOverride? }`
4. 前端入口：
   - 项目页「导出」Tab → 下载项目备份
   - 工作台列表 →「导入备份」→ 新建项目并打开
5. 图片路径约定（恢复时 remap id）：
   - `character/{id}/character-sheet|character-expression.{ext}`
   - `asset/{id}/asset.{ext}`
   - `scene/{id}/scene-sheet.{ext}`
   - `panel/{id}/panel.{ext}`
   - `panel-lettered/{id}/lettered.{ext}`
6. JSON 内 `url` 字段在导入后按新 id 重写；历史版本图与参考图元数据不迁移。

## Failure Modes

- `schemaVersion` 不匹配 → 400
- `kind` 错误 → 400
- 话数/格子数/总行超限 → preview `canImport=false`
- 图片超体积 → 导出时跳过并写入 `meta.warnings`；结构仍可导入
- 备份无图 → 导入成功，但画面需重新生成

## Related Modules

- `shared/types/comicProjectTransfer.ts`
- `server/src/modules/comic/transfer/`
- `server/src/modules/comic/http/comicRoutes.ts`
- `client/src/api/comic.ts`
- `client/src/pages/comic/ImportComicProjectDialog.tsx`

## Source Documents

- `docs/public/modules/comic-workspace.md`
