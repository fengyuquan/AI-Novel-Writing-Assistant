# 卷规划工作流

## Background

卷规划位于故事宏观规划和章节执行之间，负责把整本书的承诺拆成卷级阶段。它不能只回答“分几卷”，还必须回答每卷为什么值得单独存在、承担什么阶段回报、如何保护前期推进秩序，以及后续卷保留多少可调度空间。

目标用户多是写作新手。卷战略如果和卷骨架、节奏板、章节任务脱节，用户很容易把旧骨架误认为已经同步，或者在高风险策略下继续拆章，最终让后续章节反复失焦。因此卷规划需要同时维护数量决策、作者控制权、质量门禁和下游资产一致性。

## Decision

当前卷规划采用 **动态结构区间 + AI 策略判断 + 骨架生成** 的两段式工作流：

```text
故事宏观规划 / 书级合约
-> 卷数与 hard/soft 指导
-> 卷战略 strategy
-> 卷战略审查 critique
-> 卷骨架 skeleton
-> 节奏板 / 拆章 / 章节执行
```

卷数决策不再以固定每卷章节数除法为核心。章节预算只用于给出结构区间，最终卷数由模型结合阶段承诺、卖点切换、局面升级、阶段兑现和卷末牵引来决定。

## Current Rule

动态卷数区间由 `VolumeCountGuidance` 提供：

- `< 60 章`：允许 `1-2` 卷，适合短结构。
- `60-119 章`：推荐 `3-4` 卷，保护三段式或四段式结构。
- `120-249 章`：推荐 `4-6` 卷。
- `250-499 章`：推荐 `6-9` 卷。
- `500-899 章`：推荐 `9-14` 卷。
- `900-1499 章`：推荐 `14-20` 卷。
- `1500+ 章`：推荐 `18-24` 卷。

`allowedVolumeCountRange` 是技术和手动固定范围，当前上限为 `24`。`decisionVolumeCountRange` 是 AI 自动分卷时应遵守的结构决策区间。静态 Prompt Registry、Prompt Workbench 和真实运行路径必须共享同一个上限，不允许一个路径仍停留在旧的 `16` 卷上限。

## Author Control

已有卷草稿和用户固定卷数都属于作者控制权：

- `userPreferredVolumeCount` 优先级最高，schema 必须硬锁 `recommendedVolumeCount`。
- 当用户选择沿用草稿，`respectedExistingVolumeCount` 也必须进入 fixed count，而不是只作为上下文软提示。
- 当用户明确恢复系统建议，才回到 `decisionVolumeCountRange` 内自动判断。

这条规则保护旧项目和用户手动结构。AI 可以解释风险，但不能在“沿用草稿”的路径中擅自改卷数。

## Strategy And Skeleton Consistency

`strategy` 和 `skeleton` 是不同层级的资产：

- strategy 负责卷数、hard/soft 范围、卷级职责和不确定性。
- skeleton 负责具体卷骨架字段、章节范围和可编辑卷工作区。

重跑 strategy 后，旧 skeleton 不再可信。系统必须清空旧 `volumes`、节奏板和相邻卷再平衡结果，让用户明确重新生成卷骨架。不能让“新战略 + 旧骨架”短暂并存，否则新手会误以为骨架已经按新战略同步。

## Critique Boundary

卷战略审查不是纯展示信息。它的边界是：

- `low` / `medium` 风险：允许继续生成 skeleton，但 UI 应展示风险和建议。
- `high` 风险：阻断 skeleton 生成，要求用户重新生成或修订 strategy。
- 自动导演路径在 strategy 后执行 critique，再进入 skeleton；如果 critique 返回高风险，服务端 readiness 和 scope 检查会阻止继续推进。

第一版不引入自动修订 strategy 的新 prompt。后续如果增加自动修订，应保持顺序为：

```text
strategy -> critique(high) -> revise strategy -> critique -> skeleton
```

不要把 critique 做成“能看不能用”的半成品，也不要让高风险策略直接进入卷骨架。

## Story Macro Dependency

卷战略最应该消费的上游是故事宏观规划：主线卖点、长期对立、推进回路、成长路径、关键兑现点和不可破坏约束。

当前 Prompt Context Policy 中 `macro_constraints` 仍是 preferred block，因为历史项目可能缺少故事宏观规划。规则是：

- 有 Story Macro 时，每卷 `roleLabel` 必须能映射到主线卖点、冲突升级、成长路径或结尾风味。
- 无 Story Macro 时，策略必须降级为更保守的结构，并在 `uncertainties` 中说明缺少主线骨架带来的风险。
- 不允许在缺少 Story Macro 时臆造精细主线阶段。

如果未来产品流程强制所有新项目先生成 Story Macro，可以再把 `macro_constraints` 升级为 required。

## Hard / Soft Planning

hard 和 soft 是卷级规划深度，不是质量高低：

- `<= 3 卷`：全部 hard，保证短中篇结构完整。
- `4-6 卷`：前 `3-4` 卷 hard。
- `7+ 卷`：前 `3-6` 卷 hard，后续 soft。

hard 卷锁定前期承诺、卖点、推进秩序和节奏稳定性；soft 卷保留后续卷的方向和阶段职责，但不提前写死所有细节。

## Beat Sheet Slot Contract

节奏板采用 **固定职能槽位 + 本卷动态短标题**：

- `key` 必须使用系统槽位：`open_hook`、`first_escalation`、`midpoint_turn`、`pressure_lock`、`climax`、`end_hook`；可选扩展位为 `early_complication`、`late_complication`。
- `label` 是稳定职能名，例如「开卷抓手」「首次升级」，供校验、恢复和 UI 分组使用，不允许自由发明。
- `title` 是本卷定制短标题，例如「夜市夺印」，由 AI 按卷骨架动态生成。
- UI 展示优先使用 `职能 · 短标题`；旧数据没有 `title` 时回退为职能名。
- 节奏分段本身仍是卷内 AI 动态规划；hard/soft 只决定卷级规划深度，不直接决定 beat 切分。

这条规则避免两种失败：职能名完全写死导致题材模板感过重，以及职能名完全自由导致后续按 beat 重生、校验和导航失稳。

## Incremental Chapter List By Beat

节奏板仍按整卷生成，拆章默认按单个 beat 增量生成，执行合同继续按单章 JIT 补齐。这样可以让新手先拿到当前节奏段的可写章节，开始细化或开写，而不必等待整卷所有章节标题一次性生成完。

手动工作台的主路径是：如果当前聚焦 beat 尚未完整生成章节，就生成该 beat；否则生成第一个未完整 beat。`full_volume` 仍保留为高级 / 批量操作，用于一次补齐本卷全部章节标题。

`single_beat` 生成成功后只校验目标 beat 的局部覆盖，并把该 beat 合并进 `VolumePlanDocument`，保留其他已生成 beat。未生成 beat 可以继续空缺，卷状态使用 `chapter_list_partial:*` 表示本卷拆章尚未全量完成；这不是执行阻断，已经 sync 的章节仍可细化和开写。

单段生成默认不触发相邻卷 rebalance。只有本卷通过 `full_volume` 完成，或用户 / 导演显式要求校准相邻卷时，才运行相邻卷再平衡，避免每拆一段都扰动后续卷规划。

章节同步必须继续保护已有正文：自动保存走现有 `syncToChapterExecution` 路径，并保持 `preserveContent: true`、`applyDeletes: false`。重生某个 beat 时，已有正文章节默认锁定，系统只能更新无正文的规划字段。

### Auto-Director Readiness Projection

自动导演使用两个投影语义，不把它们混成一个旧的 `chapterListReady` 判断：

- `beatChapterListReady`：当前执行窗口需要的 beat 已经生成并可 sync / 细化 / 开写。
- `volumeChapterListComplete`：本卷 beat 全部生成完成。

全书或卷级自动推进可以在 `beatChapterListReady = true` 且 `volumeChapterListComplete = false` 时进入当前 beat 的章节细化和执行；当前窗口完成后，恢复点应回到 structured outline，继续生成下一个未完成 beat。这样长卷不会因为后半卷标题还没生成，就阻塞第 1 段的正文生产。

`resolveStructuredOutlineRecoveryCursor` 需要识别第一个未完成 beat，并在允许 partial ready 的自动执行路径中只选择已完成 beat 覆盖的章节。checkpoint 修复和继续运行逻辑必须保留 `volumeChapterListComplete = false` 的事实，避免把当前 beat 执行完误判为整卷 / 全书 workflow completed。

### Change Impact Scope

角色注入、局部修订和卖点调整遵守“未写范围最小扰动”：

- 已有正文覆盖的 beat 标记为 `locked_with_draft`，默认不重拆、不改写正文。
- 已生成章节但没有正文的后续 beat 标记为 `stale`，适合重排参与者、补接新角色或刷新规划字段。
- 尚未生成章节的后续 beat 标记为 `pending`，默认动作是把变化接入后续未写段。

UI 和导演事实摘要可以展示 `affectedBeats`、`staleBeatCount`、`lockedBeatCount`、`defaultImpactAction` 和 `advancedImpactActions`，但这些都是投影 / 决策摘要，不需要数据库迁移。只有结构级角色或全局卖点变化明显影响整卷战略时，才提示高级动作，例如重跑节奏板或卷战略。

## External Chapter Outline Import

节奏 / 拆章工作台支持从外部粘贴章节大纲，用于替换当前卷工作区中的章节清单，再继续用系统做细化、评价和正文生产。

### Current Rule

- 入口在「节奏 / 拆章」标题栏的「导入大纲」。
- 解析默认 `auto`：先走确定性模板解析（支持 `## 第N章` 与 `**第N章：标题**` + 章节摘要/目标/任务单）；置信度不足时再调用已注册 Prompt `novel.volume.outline_import@v2`。
- AI 整理只允许改格式/拆字段，禁止润色、概括或改写剧情原文；字段应尽量保留原文原句。
- `POST /novels/:id/volumes/import-outline` **只返回预览结果，不写库**。用户确认后写入前端卷草稿，再点「保存卷工作区」走既有 `updateVolumes` + `syncToChapterExecution`。
- 替换范围是整本卷工作区章节清单；**不与旧拆章做逐章合并**，解析确认后直接覆盖。保留已有卷元信息。导入文本含 `# 第N卷` 时按卷归属，否则全部写入第 1 卷，其余卷章节清空。
- 导入只保证 `title` + `summary`（可选 `purpose` / `mustAvoid` / `taskSheet`），并标记 `conflictLevelSource=user`。不自动生成 beat sheet、sceneCards；这些仍走既有细化 / 批量补任务单。
- 同步默认继续保护已有正文：`preserveContent: true`。导入本身不删除执行区正文章节，也**不做正文冲突检测**。
- 写入草稿时清空当前 beatSheets / rebalanceDecisions，避免旧节奏板与新章节清单错位；用户可重新生成节奏板。
- 大纲里的「章节任务单」只是规划笔记。同步执行区时**不得**因缺少场景卡/边界合同而硬失败；只有已存在 `sceneCards` 的完整执行合同才走质量门禁。完整合同仍靠后续章节细化 / JIT 补齐。

### Setting Conflict Check

写入草稿前，前端会调用 `POST /novels/:id/volumes/import-outline/conflicts`（Prompt `novel.volume.outline_import_conflict@v1`），用 AI 语义对照：

- 要比：角色硬事实、世界观/书级世界规则、卷战略、节奏板。
- 不比：已写正文、旧拆章逐章差异。

每条冲突由用户三选一（建议值可改，不强制）：

| 选择 | 拆章 | 设定资产 |
|---|---|---|
| 跟大纲 | 保留导入章节原文 | 不改库内设定；记「设定待对齐」供后续手动改角色/世界/战略 |
| 跟设定 | 仍覆盖拆章；相关章节 `mustAvoid` 追加合规备注，不擅自改写摘要剧情 | 保持原设定不变 |
| 稍后处理 | 覆盖拆章 | 设定不变；冲突进入页面可见待处理列表，不阻断保存 |

新手默认推荐：角色/世界硬规则偏 `keep_setting`；卷战略/节奏与刚导入大纲冲突偏 `keep_outline`。冲突分析接口本身不写库。

### Failure Modes

- 自由文本没有章节标题：模板置信度低，应走 AI 整理；若 AI 仍无章节则报错，不写入草稿。
- 用户只解析预览却忘记保存：执行区不会变化，页面应继续显示「含未保存草稿」。
- 把导入误当成生产就绪：缺少 task sheet / scene cards 时仍需细化后才能稳定进入正文生产门禁。
- 冲突分析失败：应提示重试；不要用关键词表本地“猜冲突”掩盖 AI 失败。
- 「跟大纲」被误当成自动改设定：当前只记账待对齐，不会静默改角色卡或世界库。

## Create Novel From Outline

新手可带着完整章节大纲直接开新书，不必先手填空小说再导入。

### Background

已有书上的「导入大纲」依赖 `novelId`，且冲突检查面向既有设定。开新书路径没有可对照设定，需要把解析、开书草稿抽取与落库编排成一条独立流程。

### Decision

- 入口：`/novels/create-from-outline`（小说列表、空状态、手动创建页均可进入）。
- 两段式 API：
  - `POST /novels/create-from-outline/preview`：无 `novelId` 解析章节 + Prompt `novel.create.from_outline_bootstrap@v2` 抽出书名/简介/framing/角色/世界观文稿；**不写库**。
  - `POST /novels/create-from-outline`：用户确认后 `createNovel` → 合并拆章并写入卷战略/节奏板 → `syncToChapterExecution` → 灌入故事宏观规划与书级合约 → 创建勾选角色 → 世界文稿走 `world.import.extract` 再绑定本书；`manual_create` workflow 附上 `novelId`。
  - 若执行区连接失败但卷工作区已落库，开书接口仍应成功返回，并把连接失败写入 `warnings`；用户可到节奏页再同步。不要因为大纲任务单笔记让整次开书失败。
- **不做**设定冲突三选一（新书无设定）；不自动进入自动导演。
- 章节清单仍以解析结果为准；bootstrap Prompt 只抽取设定，禁止改写章节剧情原文。
- 开书草稿抽取采用 **AI 结构化输出 + 大纲前序确定性线索补全**：`extractOutlineBootstrapHints` 从已标注的书名/世界观/前30章/主角名段落抬升线索，注入 Prompt，并在 AI 字段为空时回填，避免富大纲仍出现空白书名/世界/角色。
- 开书落库必须同时灌入下游可消费的规划层，避免新手进入编辑页后宏观规划 0%、卷战略空白、节奏板无章节分组：
  - `buildOutlineStrategyAndBeatSheets`：卷骨架字段 + `strategyPlan` + `beatSheets`，并给章节挂上 `beatKey`（优先按 `第N阶段` 分组）。
  - `OutlineCreatePlanningHydrationService`：用大纲拼装 `storyInput` 调用既有 `StoryMacroPlanService.decompose`，并写入 `BookContract`。
  - 工作区合并时，若请求显式带了 `beatSheets` / `rebalanceDecisions`，不得因卷结构变更而静默清空。

### Current Rule

- 解析复用 `OutlineImportService.parseOutlineText`（模板 / auto / AI），不再强制先有小说。
- 长线「第N卷」规划标题若下面没有具体章节体，解析后丢弃这些空卷，只保留真正落了章节的卷，避免预览出现一排空卷。
- `### 第N阶段` 标题记入章节 `stageLabel`，供节奏板分组；不是卷标题。
- 角色/世界/宏观规划失败不回滚小说与拆章，以 `warnings` 返回，引导用户到对应页补齐。
- 成功后进入编辑页 `stage=structured`，并同步章节壳到执行区；此时不要求每章已有完整执行合同。
- 大纲任务单可写入 `taskSheet`，但不会因此触发「执行合同质量门禁」阻断开书。
- 开书核对页应展示章节摘要 / 目标 / 任务单，避免用户误以为字段未导入。
- `Chapter.expectation` 只对应规划侧「章节目标 / purpose」；hydrate 不得用它覆盖「章节摘要 / summary」。从大纲开书后若摘要被冲成目标文案，属于边界回归，见 `docs/wiki/architecture/chapter-identity-and-planning-boundary.md`。

### Failure Modes

- 0 章大纲：preview/create 均阻断。
- bootstrap AI 失败：提示重试；禁止关键词表本地猜角色/世界。
- 世界抽取或绑定失败：书与拆章保留，warning 说明可稍后补。
- 误把大纲任务单当完整执行合同：同步不应报「执行合同未通过质量门禁」；用户应继续到节奏页做章节细化后再开写。

### Related Modules

- `server/src/services/novel/volume/OutlineCreateBootstrapService.ts`
- `server/src/prompting/prompts/novel/create/fromOutlineBootstrap.prompts.ts`
- `shared/types/outlineCreateBootstrap.ts`
- `client/src/pages/novels/NovelCreateFromOutline.tsx`

## Downstream Gap

卷规划的价值最终要进入章节执行。当前已存在 `VolumeWindowContext.keyMilestoneGuards` 字段，但卷规划服务尚未完整填充它。这个缺口会导致章节生成仍可能提前兑现后续里程碑或重复卷级高潮。

后续修复应让 skeleton 或 beat sheet 生成关键里程碑守卫，并在 `volume_window` 上下文中注入目标章节范围、事件、禁止提前兑现点和节奏说明。

## Related Modules

- `shared/types/volumePlanning.ts`：动态卷数区间、hard/soft 范围和作者控制权计算。
- `shared/types/volumeBeatSlots.ts`：节奏板固定职能槽位、别名归一与展示文案。
- `server/src/services/novel/volume/volumeGenerationOrchestrator.ts`：strategy、critique、skeleton 的运行顺序和 fixed count 传递。
- `server/src/services/novel/volume/volumeGenerationHelpers.ts`：scope readiness 与 strategy/skeleton 合并规则。
- `server/src/services/novel/volume/volumeWorkspaceDocument.ts`：工作区 readiness。
- `server/src/services/novel/director/recovery/novelDirectorStructuredOutlineRecovery.ts`：自动导演 structured outline 恢复点、partial beat-ready 投影。
- `server/src/services/novel/volume/volumePlanChangeDetection.ts`：卷级变更和后续 beat 影响范围投影。
- `server/src/services/novel/dynamics/CharacterDynamicsMutationService.ts`：角色动态变更后的后续未写 beat 影响记录。
- `server/src/prompting/prompts/novel/volume/strategy.prompts.ts`：卷战略 PromptAsset。
- `server/src/prompting/prompts/novel/volume/skeleton.prompts.ts`：卷骨架 PromptAsset。
- `server/src/prompting/prompts/novel/volume/beatSheet.prompts.ts`：节奏板 PromptAsset（固定槽位 + 动态短标题）。
- `shared/utils/outlineImport.ts`：外部大纲 Markdown 解析与卷章节合并。
- `shared/types/outlineImportConflict.ts` / `shared/utils/outlineImportConflictApply.ts`：设定冲突模型与选择应用。
- `shared/types/outlineCreateBootstrap.ts`：从大纲开书的草稿模型。
- `server/src/services/novel/volume/OutlineImportService.ts`：导入预览与 AI 回退（含无 novelId 解析）。
- `server/src/services/novel/volume/OutlineImportConflictService.ts`：设定冲突分析（不写库）。
- `server/src/services/novel/volume/OutlineCreateBootstrapService.ts`：从大纲开新书编排。
- `server/src/prompting/prompts/novel/volume/outlineImport.prompts.ts`：外部大纲整理 PromptAsset。
- `server/src/prompting/prompts/novel/volume/outlineImportConflict.prompts.ts`：设定冲突分析 PromptAsset。
- `server/src/prompting/prompts/novel/create/fromOutlineBootstrap.prompts.ts`：开书草稿抽取 PromptAsset。
- `docs/wiki/prompts/novel-generation-quality-guards.md`：卷级关键节点守卫缺口。
