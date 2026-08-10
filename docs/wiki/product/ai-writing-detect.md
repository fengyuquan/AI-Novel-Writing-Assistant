# 章节编辑器：AI 写法检测

## Background

写作新手很难判断「这段是不是像 AI」。章节编辑器需要一个独立、可操作的检测入口：指出可疑句子、给出改法，并支持定位与一键改写。

## Decision

- 使用独立 PromptAsset：`novel.chapter_editor.ai_writing_detect@v1`。
- 不新增 Prisma `AuditType`，避免污染 continuity/character/plot/mode_fit 审校链路。
- 结果默认不落库，仅服务当前编辑会话（与编辑器即时改稿一致）。
- 可叠加确定性正文快检（否定翻转、AI 自述、占位符泄漏等），再由 LLM 做主检测。

## Current Rule

1. 入口：章节编辑器左侧「AI 写法检测」。
2. 请求：`POST /api/novels/:id/chapters/:chapterId/editor/ai-writing-detect`，可带未保存 `content`。
3. 输出：`riskScore`、`naturalnessScore`、`summary`、`issues[]`；每条含 `evidence`（可定位原文）与 `fixSuggestion`。
4. 定位 / AI 改：复用编辑器现有 `locateEvidenceInContent` 与片段修正流程。
5. 不得因本检测结果自动阻断全书自动导演；它属于章级改稿辅助。

## Failure Modes

- evidence 只写抽象现象、不含原文 → 定位失败；Prompt 已要求短摘录。
- 把正常网文爽点误判为 AI → Prompt 明确要求避免。
- 章节正文为空 → 返回可理解的业务错误。

## Related Modules

- Prompt：`server/src/prompting/prompts/novel/chapterEditor/aiWritingDetect.prompts.ts`
- Service：`NovelChapterEditorService.detectAiWriting`
- Client：`ChapterEditorAiWritingDetectPanel`、`useChapterEditorAiWritingDetectActions`
- Related：`ProseQualityDetector`、`style.detection`（书级写法合同检测，能力相邻但入口不同）
