# 生成数量设置

## 背景

产品里多处「一次生成几条」原先散落在 Prompt 文案、服务默认常量和 schema 上限中，用户无法在界面统一调整。需要把**产品向默认生成数量**收敛到可热更新的设置项。

## 决策

用 `AppSetting` + 系统设置「写作质量增强 → 生成数量」托管这些默认值：

- 设置项只影响**未显式传 count 的默认路径**；单次 API 若已带数量，仍以请求为准。
- Prompt / 服务在组装或发起前通过 `getGenerationCount(key)` 读取。
- 卷规划等仍保留代码硬顶（如 `MAX_VOLUME_COUNT`），设置值不能突破硬顶。

## 当前规则

入口：系统设置 → 写作质量增强 → 生成数量。

当前字段（key → 含义）：

- `generation.ideaInspirationCount`：开书灵感条数
- `generation.titleCandidateCount`：书名候选数
- `generation.estimatedChapterDefault`：预估章数默认
- `generation.maxVolumeCount`：卷规划上限（不超过硬顶 24）
- `generation.directorCandidateCount`：导演方向候选套数
- `generation.directorTitleOptionsMax`：导演书名备选最多
- `generation.worldAxiomCount`：世界核心公理条数
- `generation.characterCandidateDefaultCount`：角色候选默认建议数
- `generation.coverImageCount`：封面图张数
- `generation.comicSceneMax`：漫画分镜场景最多识别
- `generation.bookAnalysisCharacterMax`：拆书未指定角色时最多生成

不进入本页：RAG topK、日志保留、质量账本条目、章节证据条数等内部上限。

## 失败模式

- 改了设置但旧结果没变：预期如此，只影响之后的新生成。
- 开书灵感/公理数量与模型返回不一致：检查对应 Prompt 是否按设置注入，以及 output schema 是否按 count 重建。
- 卷数设得很大仍被截断：命中 `MAX_VOLUME_COUNT` 硬顶。

## 相关模块

- `shared/types/generationCounts.ts`
- `server/src/services/settings/GenerationCountSettingsService.ts`
- `client/src/pages/settings/components/GenerationCountSettingsCard.tsx`
- 配置规范：`../architecture/configuration-conventions.md`
