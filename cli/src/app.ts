import { createApi, type NovelCliApi } from "./api.js";
import { loadConfig, type CliConfig } from "./config.js";
import { browseChapters } from "./flows/chapters.js";
import { runAutoDirectorFlow } from "./flows/director.js";
import { reviseOutlineFlow } from "./flows/outline.js";
import { describeOutlineFirstShortcut, outlineFirstMenu } from "./flows/outlineFirst.js";
import {
  resumeDirectorActions,
  showDirectorProgress,
  showTaskOverview,
  watchLlmLiveBriefly,
} from "./flows/progress.js";
import { selectOrCreateNovel } from "./flows/novels.js";
import { ensureQuickSetup, showOnboardingHint } from "./flows/setup.js";
import { ApiClient, CliHttpError } from "./lib/http.js";
import {
  printBlank,
  printError,
  printInfo,
  printSuccess,
  printTitle,
  printWarn,
} from "./lib/print.js";
import { choose, closePrompt } from "./lib/prompt.js";
import { createSession, describeSession, type CliSession } from "./session.js";

export async function runCli(argv = process.argv.slice(2)): Promise<number> {
  const config = loadConfig(argv);
  const client = new ApiClient(config.apiBaseUrl);
  const api = createApi(client);
  const session = createSession();

  printTitle("AI 小说创作 · 命令行壳");
  printInfo("这个命令行入口复用现有后端能力，效果与网页端操作同一套数据。");
  printInfo(`API：${config.apiBaseUrl}`);

  try {
    const health = await api.health();
    if (health.data?.status !== "ok") {
      printWarn("后端已响应，但健康状态不是 ok。");
    } else {
      printSuccess("后端已连接。");
    }
  } catch (error) {
    printError(error instanceof Error ? error.message : String(error));
    return 1;
  }

  await ensureQuickSetup(api);
  await showOnboardingHint(api);

  let running = true;
  while (running) {
    printBlank();
    printInfo(describeSession(session));
    const action = await choose("主菜单", [
      { value: "setup", label: "检查 / 配置创作环境", hint: "模型与 API Key" },
      { value: "novel", label: "小说项目", hint: "新建、选择当前小说" },
      {
        value: "outline_first",
        label: "大纲优先开书",
        hint: describeOutlineFirstShortcut(),
      },
      { value: "director", label: "启动自动导演（含正文推进）", hint: "输入灵感 → 选方案 → 继续开书" },
      { value: "outline", label: "修改故事规划", hint: "看大纲 + 一句话让 AI 改" },
      { value: "progress", label: "查看导演进度", hint: "阶段、关卡、书级状态" },
      { value: "resume", label: "继续 / 批准导演", hint: "发送 continue 或 approve_gate" },
      { value: "live", label: "订阅 AI 实况", hint: "看模型正在生成什么" },
      { value: "chapters", label: "查看章节", hint: "浏览已生成正文" },
      { value: "tasks", label: "运行记录概览", hint: "排队 / 失败 / 可恢复" },
      { value: "exit", label: "退出" },
    ]);

    try {
      switch (action) {
        case "setup":
          await ensureQuickSetup(api);
          break;
        case "novel":
          await selectOrCreateNovel(api, session);
          break;
        case "outline_first":
          await outlineFirstMenu(api, session, config.pollIntervalMs);
          break;
        case "director":
          await runAutoDirectorFlow(api, session, config.pollIntervalMs);
          break;
        case "outline":
          await reviseOutlineFlow(api, session, config.pollIntervalMs);
          break;
        case "progress":
          await showDirectorProgress(api, session);
          break;
        case "resume":
          await resumeDirectorActions(api, session, config.pollIntervalMs);
          break;
        case "live":
          await watchLlmLiveBriefly(api, session);
          break;
        case "chapters":
          await browseChapters(api, session);
          break;
        case "tasks":
          await showTaskOverview(api);
          break;
        case "exit":
          running = false;
          break;
        default:
          break;
      }
    } catch (error) {
      handleFlowError(error);
    }
  }

  closePrompt();
  printSuccess("已退出命令行壳。网页端不受影响。");
  return 0;
}

function handleFlowError(error: unknown): void {
  if (error instanceof CliHttpError) {
    printError(error.message);
    return;
  }
  printError(error instanceof Error ? error.message : String(error));
}

export type { CliConfig, CliSession, NovelCliApi };
