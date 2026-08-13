# 当前模型选择与厂商默认模型边界

## 背景

顶部模型选择会影响 Creative Hub、自动导演、章节生产、写法引擎、世界观与角色生成等多条 AI 调用入口。过去如果当前选择只存在浏览器本地存储，项目重启、桌面 userData 变化、浏览器 origin 变化或本地缓存被清理后，界面会回到前端内置默认值。内置默认值又可能落到某个厂商的旧模型名，导致新手用户在不理解模型配置细节时直接遇到不可用模型。

模型厂商配置和当前模型选择必须分清事实源：厂商配置说明“这个厂商如何连接、默认模型是什么、是否可运行”；当前模型选择说明“顶部工作区现在要用哪一个厂商和模型”。

## 决策

当前顶部模型选择以服务端 `AppSetting` 为主要事实源。前端状态只作为本次页面运行时的投影，不再用浏览器 localStorage 决定长期默认模型。

当没有已保存的当前选择，或已保存的厂商不可运行时，系统从已配置、启用且有模型列表的厂商中解析一个可运行选择。解析顺序优先尊重用户保存的厂商和模型；只有保存值缺失或失效时，才使用可运行厂商列表的首个候选。

内置厂商的静态模型清单只能作为设置页的候选提示或已有配置的兜底，不应在未保存模型时直接成为顶部当前模型。未保存模型时应优先使用服务端能获取到的模型目录；获取不到目录时，让厂商保持不可运行状态，引导用户在设置页明确选择或填写模型。

## 当前规则

- 顶部当前模型选择保存到 `AppSetting` 的 `llm.currentSelection`，内容包含 provider、model、temperature 和可选 maxTokens。
- 前端 `useLLMStore` 保存的是运行时投影；页面启动后由设置接口和当前选择接口共同水合。
- `LLMSelector` 只展示已配置、启用、且存在可用模型的厂商。
- 用户在顶部切换厂商或模型后，前端应同步保存到服务端当前选择。
- 手机端站点壳、小说工作区、章节编辑页顶部也提供同一套模型切换（`MobileLLMHeaderBar`），与桌面 Navbar 共用当前选择事实源。
- 每个厂商的可用模型列表优先读取浏览器本地缓存（`ai-novel.provider-models-cache.v1`，按 `provider::baseURL` 分键）。未缓存时才回退到 `/settings/api-keys` 返回的模型列表。
- 切换厂商时不自动向远端拉取模型目录；只有用户点击刷新按钮（顶部选择器或设置页厂商卡片）时才调用 `POST /settings/api-keys/:provider/refresh-models`，并写回本地缓存。
- 没有保存模型的内置厂商不应因为 `PROVIDERS.*.defaultModel` 存在就被视为可运行；需要保存模型、环境模型或可拉取的模型目录。
- 模型路由、结构化兜底和各任务的显式模型覆盖仍属于独立配置；它们不等同于顶部当前模型。
- 当请求未显式传入 provider/model 时，`resolveLLMClientOptions` 优先使用已保存的 `llm.currentSelection`，再回退到任务路由或内置 DeepSeek 默认。短剧流水线等未带模型参数的后台路径依赖这一规则，避免误打到未配置余额的 DeepSeek。
- 短剧工作台与小说生产一致：前端文本类 AI 请求应附带当前顶部选择的 provider/model/temperature。
- 默认图片选择保存在 `AppSetting` 的 `image.currentSelection`（`provider` + `model`）。
- 系统设置「开始创作必需」提供「默认图片模型」卡片：先选图片供应商，再选图像模型；漫画工作台页内与生图确认弹窗同构。
- 文本类漫画任务（大纲、分镜脚本等）不走图片默认，继续使用顶部文本模型 / `llm.currentSelection`。
- 出图 runtime（`runImageGeneration`）解析模型顺序：请求显式 `model` / `modelOverride` → 全局 `image.currentSelection`（仅当 provider 一致）→ 厂商 `provider.imageModel.*` 默认。
- 「刷新模型」会调用 `/settings/api-keys/:provider/refresh-models`：刷新文本模型目录，同时从目录中筛出疑似图像模型，写入 `provider.imageModelCatalog.{provider}`，并回填到设置页 / 漫画页的图像模型下拉。
- 所有带独立供应商/模型下拉的出图入口（短剧关键帧与角色设计稿、角色库生图、小说封面、统一生图确认弹窗）打开时都必须优先读取 `image.currentSelection`；仅当全局选择不可用时，才回退到首个可出图供应商。
- 拆书创建等带本地 LLM 选择器的文本入口，在本地尚未选中时优先跟随顶部 `llm.currentSelection` / `useLLMStore`，避免水合前落到空值或首个厂商。

## 示例

推荐做法：

- 用户在顶部从 DeepSeek 切到 Qwen 后，重启项目仍从服务端读取 Qwen 和对应模型。
- 某厂商配置了 API Key 但没有保存模型时，服务端先尝试读取该厂商模型目录，并把目录首项作为当前可用模型。
- 如果模型目录无法读取，设置页继续允许用户手动填写模型，但顶部不自动选择内置旧模型名。

禁止或不推荐做法：

- 在前端状态初始化时写死 `deepseek/deepseek-v4-flash` 或其他内置默认模型名。
- 因为某个 provider 的静态 defaultModel 存在，就把未完成配置的厂商显示为可运行。
- 用关键词、特殊厂商分支或一次性迁移脚本掩盖模型目录和当前选择事实源不一致的问题。

## 失败模式

- 重启后顶部模型跳回旧默认：先查 `AppSetting.llm.currentSelection` 是否存在，再查前端是否完成水合，最后查当前厂商是否仍在 `/api/settings/api-keys` 的可运行列表中。
- 顶部显示的模型不可用：检查厂商是否只有静态默认模型、是否没有保存模型、模型目录是否拉取失败。
- 设置页能看到厂商但顶部没有它：确认 `isConfigured`、`isActive` 和模型列表是否同时满足，未配置模型的厂商不应进入顶部候选。

## 相关模块

- `server/src/services/settings/LLMSelectionSettingsService.ts`
- `server/src/services/settings/ImageSelectionSettingsService.ts`
- `server/src/llm/factory.ts`（无显式模型时回退到 `llm.currentSelection`）
- `client/src/pages/drama/dramaLlmOptions.ts`
- `server/src/routes/settings/llmSelectionRoutes.ts`
- `server/src/routes/settings/imageSelectionRoutes.ts`
- `server/src/routes/settings.ts`
- `client/src/pages/settings/components/DefaultImageProviderSettingsCard.tsx`
- `server/src/llm/modelCatalog.ts`
- `client/src/components/layout/LLMSelectionBootstrap.tsx`
- `client/src/components/common/LLMSelector.tsx`
- `client/src/store/llmStore.ts`
- `client/src/lib/providerModelsCache.ts`
- `client/src/lib/imageSelection.ts`（`resolvePreferredImageSelection`）
- `client/src/pages/drama/components/DramaVisualPanel.tsx`
- `client/src/pages/drama/components/DramaCharactersPanel.tsx`
- `client/src/pages/characters/components/CharacterImageDialog.tsx`
- `client/src/pages/novels/components/cover/NovelCoverDialog.tsx`
- `client/src/components/image/ImageGenerationConfirmDialog.tsx`

## 来源文档

- [模块边界与文档治理](./module-boundaries.md)
- [项目协作规则](../../../AGENTS.md)
