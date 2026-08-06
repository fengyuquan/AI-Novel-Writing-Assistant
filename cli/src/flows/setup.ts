import type { NovelCliApi } from "../api.js";
import { ask, choose, confirm } from "../lib/prompt.js";
import {
  printBlank,
  printInfo,
  printKeyValues,
  printSuccess,
  printTitle,
  printWarn,
} from "../lib/print.js";

export async function ensureQuickSetup(api: NovelCliApi): Promise<boolean> {
  const status = (await api.getQuickSetupStatus()).data;
  if (!status) {
    printWarn("无法读取创作环境状态。");
    return false;
  }

  printTitle("创作环境");
  printKeyValues([
    ["是否可创作", status.readyForCreation ? "是" : "否"],
    ["当前厂商", status.selectedProvider ?? "未选择"],
    ["当前模型", status.selectedModel ?? "未选择"],
    ["任务路由覆盖", `${status.routeCoverage.configured}/${status.routeCoverage.total}`],
  ]);

  if (status.readyForCreation) {
    printSuccess("创作环境已就绪，可直接开始写书。");
    return true;
  }

  if (status.blockingReasons.length > 0) {
    printWarn("当前还不能开始 AI 创作：");
    for (const reason of status.blockingReasons) {
      printInfo(`  - ${reason}`);
    }
  }

  const shouldConfigure = await confirm("现在配置一个可用模型吗？", true);
  if (!shouldConfigure) {
    return false;
  }

  const providers = status.providers.filter((item) => item.active || !item.configured);
  if (providers.length === 0) {
    printWarn("没有可用厂商，请先到网页设置页检查。");
    return false;
  }

  const providerId = await choose(
    "选择模型厂商",
    providers.map((provider) => ({
      value: provider.id,
      label: provider.name,
      hint: provider.configured
        ? `已配置 · ${provider.currentModel || provider.defaultModel}`
        : `未配置 · 默认 ${provider.defaultModel}`,
    })),
  );

  const provider = providers.find((item) => item.id === providerId)!;
  const model = await ask(
    "输入模型名称",
    provider.currentModel || provider.defaultModel || "deepseek-v4-flash",
  );
  const baseURL = await ask(
    "API 地址",
    provider.currentBaseURL || provider.defaultBaseURL || "",
  );

  let apiKey: string | undefined;
  if (provider.requiresApiKey && !provider.configured) {
    apiKey = await ask("输入 API Key");
    if (!apiKey.trim()) {
      printWarn("该厂商需要 API Key。");
      return false;
    }
  } else if (provider.requiresApiKey) {
    const replace = await confirm("已有 Key。要更换新的 API Key 吗？", false);
    if (replace) {
      apiKey = await ask("输入新的 API Key");
    }
  }

  printInfo("正在检测连通性并保存配置…");
  const result = (await api.completeQuickSetup({
    providerKind: provider.kind,
    provider: provider.id,
    model: model.trim(),
    baseURL: baseURL.trim() || undefined,
    ...(apiKey?.trim() ? { apiKey: apiKey.trim() } : {}),
  })).data;

  if (!result) {
    printWarn("配置保存失败。");
    return false;
  }

  printBlank();
  printKeyValues([
    ["厂商", String(result.provider)],
    ["模型", result.model],
    ["普通文本", result.plainConnectionReady ? "通过" : "未通过"],
    ["结构化输出", result.structuredConnectionReady ? "通过" : "未通过"],
  ]);

  if (result.status.readyForCreation) {
    printSuccess("创作环境配置完成。");
    return true;
  }

  printWarn("配置已保存，但仍未完全就绪。可到网页设置页继续检查任务路由。");
  return false;
}

export async function showOnboardingHint(api: NovelCliApi): Promise<void> {
  try {
    const guide = (await api.getFirstNovelOnboarding()).data;
    if (!guide || guide.graduated) {
      return;
    }
    printTitle("创作向导");
    printInfo(guide.headline);
    printInfo(guide.description);
    printInfo(`建议下一步：${guide.primaryAction.label}`);
  } catch {
    // optional hint
  }
}
