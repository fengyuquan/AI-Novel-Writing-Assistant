import { z } from "zod";
import { AppError } from "../../middleware/errorHandler";
import {
  comicPanelScriptOutputSchema,
  type ComicPanelScriptOutput,
} from "../../prompting/prompts/comic/comic.prompts";
import { extractJSONValue } from "../novel/novelP0Utils";

/** 人工粘贴用：允许更少格数，尽量吃下外部模型输出 */
const manualComicPanelScriptOutputSchema = z.object({
  scenes: comicPanelScriptOutputSchema.shape.scenes,
  panels: z.array(
    z.object({
      order: z.number().int().min(1),
      panelType: z.enum(["establishing", "close_up", "action", "reaction", "transition"]),
      densityLevel: z.enum(["low", "medium", "high"]).default("medium"),
      focus: z.string().trim().min(1).max(120),
      action: z.string().trim().min(1).max(200),
      sceneRef: z.string().trim().max(60).optional(),
      dialogues: z.array(z.object({
        speaker: z.string().trim().min(1),
        text: z.string().trim().min(1).max(60),
        bubbleType: z.enum(["round", "spike", "cloud", "caption"]).default("round"),
        anchorHint: z.string().trim().optional(),
      })).max(3).default([]),
      characterRefs: z.array(z.object({
        name: z.string().trim().min(1),
        costume: z.string().trim().max(60).default("default"),
        expression: z.enum(["neutral", "happy", "angry", "sad", "surprised", "cold"]).default("neutral"),
        lighting: z.string().trim().max(40).optional(),
        props: z.array(z.string().trim().max(60)).max(4).optional(),
      })).max(5).default([]),
      visualPrompt: z.string().trim().min(1).max(400),
      layoutData: z
        .object({
          layout: z.enum(["single", "four_koma"]).default("single"),
          subPanels: z
            .array(z.object({
              order: z.number().int().min(1).max(4),
              beat: z.enum(["起", "承", "转", "合"]),
              visualPrompt: z.string().trim().min(1).max(180),
            }))
            .max(4)
            .optional(),
        })
        .optional(),
    }),
  ).min(1).max(80),
});

export const PANEL_SCRIPT_OUTPUT_REQUIREMENTS = [
  "【硬性输出要求——必须严格遵守】",
  "1. 只返回一个 JSON 对象，不要解释文字。可用 ```json 代码块包裹。",
  "2. 顶层必须是：{ \"scenes\": Scene[], \"panels\": Panel[] }",
  "3. scenes 可选，0–8 个；panels 必须有，建议 10–80 个（按任务目标格数）。",
  "4. 每个 panel 必须含英文字段名（不要用中文当 key）：",
  "   - order: 从 1 递增的整数",
  "   - panelType: establishing | close_up | action | reaction | transition",
  "   - densityLevel: low | medium | high",
  "   - focus: 本格主视觉焦点（短句）",
  "   - action: 本格发生的事（短句）",
  "   - sceneRef: 可选，对应 scenes[].name",
  "   - dialogues: [{ speaker, text, bubbleType: round|spike|cloud|caption, anchorHint? }]，每格最多 3 句",
  "   - characterRefs: [{ name, costume, expression: neutral|happy|angry|sad|surprised|cold, lighting?, props? }]，每格最多 5 个",
  "   - visualPrompt: 画面提示词（含画风前缀，不含气泡文字），建议 ≤400 字",
  "5. scenes 每项：name, sceneType(interior|exterior|landscape|abstract|other), palette, keyElements；可选 materials/ambiance/layout",
  "6. 示例精简：",
  '{"scenes":[{"name":"宗门大殿","sceneType":"interior","palette":"暗金朱红","keyElements":"石柱与香炉"}],"panels":[{"order":1,"panelType":"establishing","densityLevel":"medium","focus":"大殿全景","action":"主角步入大殿","sceneRef":"宗门大殿","dialogues":[],"characterRefs":[{"name":"沈剑心","costume":"default","expression":"cold"}],"visualPrompt":"webtoon style, vibrant colors, clean lines. 宗门大殿纵深，沈剑心背影走入"}]}',
].join("\n");

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function pickString(record: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return "";
}

function pickNumber(record: Record<string, unknown>, keys: string[], fallback: number): number {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
    if (typeof value === "string" && value.trim()) {
      const n = Number.parseInt(value.trim(), 10);
      if (Number.isFinite(n)) return n;
    }
  }
  return fallback;
}

function clip(text: string, max: number): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return t.slice(0, max);
}

function mapPanelType(raw: string): "establishing" | "close_up" | "action" | "reaction" | "transition" {
  const v = raw.trim().toLowerCase().replace(/[-\s]/g, "_");
  const table: Record<string, "establishing" | "close_up" | "action" | "reaction" | "transition"> = {
    establishing: "establishing",
    establish: "establishing",
    wide: "establishing",
    全景: "establishing",
    建立: "establishing",
    远景: "establishing",
    开场: "establishing",
    close_up: "close_up",
    closeup: "close_up",
    特写: "close_up",
    近景: "close_up",
    action: "action",
    动作: "action",
    打斗: "action",
    reaction: "reaction",
    反应: "reaction",
    情绪: "reaction",
    transition: "transition",
    转场: "transition",
    过渡: "transition",
  };
  return table[v] ?? table[raw.trim()] ?? "action";
}

function mapDensity(raw: string): "low" | "medium" | "high" {
  const v = raw.trim().toLowerCase();
  if (["low", "低", "舒展", "留白"].includes(v)) return "low";
  if (["high", "高", "紧凑", "密集"].includes(v)) return "high";
  return "medium";
}

function mapBubbleType(raw: string): "round" | "spike" | "cloud" | "caption" {
  const v = raw.trim().toLowerCase();
  if (["spike", "呐喊", "怒吼"].includes(v)) return "spike";
  if (["cloud", "思维", "心里", "心声"].includes(v)) return "cloud";
  if (["caption", "旁白", "解说"].includes(v)) return "caption";
  return "round";
}

function mapExpression(raw: string): "neutral" | "happy" | "angry" | "sad" | "surprised" | "cold" {
  const v = raw.trim().toLowerCase();
  if (["happy", "开心", "笑", "喜悦"].some((x) => v.includes(x))) return "happy";
  if (["angry", "怒", "生气", "愤"].some((x) => v.includes(x))) return "angry";
  if (["sad", "悲", "哭", "难过"].some((x) => v.includes(x))) return "sad";
  if (["surprised", "惊", "吃惊"].some((x) => v.includes(x))) return "surprised";
  if (["cold", "冷", "淡漠"].some((x) => v.includes(x))) return "cold";
  return "neutral";
}

function mapSceneType(raw: string): "interior" | "exterior" | "landscape" | "abstract" | "other" {
  const v = raw.trim().toLowerCase();
  if (["interior", "室内", "内景"].some((x) => v.includes(x))) return "interior";
  if (["exterior", "室外", "外景"].some((x) => v.includes(x))) return "exterior";
  if (["landscape", "风景", "自然"].some((x) => v.includes(x))) return "landscape";
  if (["abstract", "抽象"].some((x) => v.includes(x))) return "abstract";
  return "other";
}

function unwrapRoot(parsed: unknown): { scenes: unknown[]; panels: unknown[] } {
  if (Array.isArray(parsed)) {
    return { scenes: [], panels: parsed };
  }
  const root = asRecord(parsed);
  if (!root) return { scenes: [], panels: [] };

  const nested =
    asRecord(root.data)
    ?? asRecord(root.result)
    ?? asRecord(root.output)
    ?? asRecord(root.script)
    ?? null;
  const source = nested ?? root;

  const panelsCandidate =
    source.panels
    ?? source.panelList
    ?? source.格子
    ?? source.分镜
    ?? source.分格
    ?? source.items
    ?? [];
  const scenesCandidate =
    source.scenes
    ?? source.sceneList
    ?? source.场景
    ?? [];

  return {
    scenes: Array.isArray(scenesCandidate) ? scenesCandidate : [],
    panels: Array.isArray(panelsCandidate) ? panelsCandidate : [],
  };
}

function normalizeDialogue(raw: unknown): Record<string, unknown> | null {
  if (typeof raw === "string" && raw.trim()) {
    return { speaker: "旁白", text: clip(raw, 60), bubbleType: "caption" };
  }
  const rec = asRecord(raw);
  if (!rec) return null;
  const speaker = pickString(rec, ["speaker", "name", "角色", "说话人", "who"]) || "旁白";
  const text = pickString(rec, ["text", "content", "台词", "对白", "line", "dialogue"]);
  if (!text) return null;
  const bubbleRaw = pickString(rec, ["bubbleType", "bubble", "type", "气泡"]);
  return {
    speaker: clip(speaker, 40),
    text: clip(text, 60),
    bubbleType: mapBubbleType(bubbleRaw || "round"),
    ...(pickString(rec, ["anchorHint", "anchor", "位置"])
      ? { anchorHint: pickString(rec, ["anchorHint", "anchor", "位置"]) }
      : {}),
  };
}

function normalizeCharacterRef(raw: unknown): Record<string, unknown> | null {
  if (typeof raw === "string" && raw.trim()) {
    return { name: clip(raw, 40), costume: "default", expression: "neutral" };
  }
  const rec = asRecord(raw);
  if (!rec) return null;
  const name = pickString(rec, ["name", "character", "角色", "角色名"]);
  if (!name) return null;
  const expressionRaw = pickString(rec, ["expression", "表情", "emotion"]);
  const costume = pickString(rec, ["costume", "outfit", "服装"]) || "default";
  const lighting = pickString(rec, ["lighting", "光影", "光照"]);
  const propsRaw = rec.props ?? rec.道具 ?? rec.weapons;
  const props = Array.isArray(propsRaw)
    ? propsRaw.map((p) => String(p).trim()).filter(Boolean).slice(0, 4)
    : undefined;
  return {
    name: clip(name, 40),
    costume: clip(costume, 60),
    expression: mapExpression(expressionRaw || "neutral"),
    ...(lighting ? { lighting: clip(lighting, 40) } : {}),
    ...(props && props.length > 0 ? { props } : {}),
  };
}

function normalizeScene(raw: unknown, index: number): Record<string, unknown> | null {
  const rec = asRecord(raw);
  if (!rec) return null;
  const name = pickString(rec, ["name", "scene", "场景", "地点", "title"]) || `场景${index + 1}`;
  const sceneTypeRaw = pickString(rec, ["sceneType", "type", "类型"]);
  const palette = pickString(rec, ["palette", "色调", "主色", "colors"]) || "未指定色调";
  const keyElements = pickString(rec, ["keyElements", "elements", "标志物", "要素", "描述"]) || name;
  return {
    name: clip(name, 60),
    sceneType: mapSceneType(sceneTypeRaw || "interior"),
    palette: clip(palette, 120),
    keyElements: clip(keyElements, 200),
    ...(pickString(rec, ["materials", "材质"]) ? { materials: clip(pickString(rec, ["materials", "材质"]), 120) } : {}),
    ...(pickString(rec, ["ambiance", "氛围", "光照氛围"]) ? { ambiance: clip(pickString(rec, ["ambiance", "氛围", "光照氛围"]), 120) } : {}),
    ...(pickString(rec, ["layout", "布局", "空间"]) ? { layout: clip(pickString(rec, ["layout", "布局", "空间"]), 160) } : {}),
  };
}

function normalizePanel(raw: unknown, index: number): Record<string, unknown> | null {
  const rec = asRecord(raw);
  if (!rec) return null;

  const visualPrompt = pickString(rec, [
    "visualPrompt",
    "prompt",
    "imagePrompt",
    "画面",
    "画面描述",
    "画面提示",
    "生图提示",
    "description",
  ]);
  const focus = pickString(rec, ["focus", "焦点", "主焦点", "subject"])
    || (visualPrompt ? clip(visualPrompt, 120) : `第${index + 1}格焦点`);
  const action = pickString(rec, ["action", "动作", "情节", "内容", "beat"])
    || focus;
  if (!visualPrompt && !focus && !action) return null;

  const panelTypeRaw = pickString(rec, ["panelType", "type", "镜头", "镜头类型", "shot"]);
  const densityRaw = pickString(rec, ["densityLevel", "density", "密度"]);
  const dialoguesRaw = rec.dialogues ?? rec.dialogue ?? rec.对白 ?? rec.气泡 ?? [];
  const characterRefsRaw = rec.characterRefs ?? rec.characters ?? rec.角色 ?? rec.refs ?? [];

  const dialogues = (Array.isArray(dialoguesRaw) ? dialoguesRaw : [])
    .map(normalizeDialogue)
    .filter((item): item is Record<string, unknown> => Boolean(item))
    .slice(0, 3);
  const characterRefs = (Array.isArray(characterRefsRaw) ? characterRefsRaw : [])
    .map(normalizeCharacterRef)
    .filter((item): item is Record<string, unknown> => Boolean(item))
    .slice(0, 5);

  const finalVisual = clip(visualPrompt || `${focus}. ${action}`, 400);
  const sceneRef = pickString(rec, ["sceneRef", "scene", "场景", "场景名"]);

  return {
    order: Math.max(1, pickNumber(rec, ["order", "index", "序号", "格号", "no"], index + 1)),
    panelType: mapPanelType(panelTypeRaw || "action"),
    densityLevel: mapDensity(densityRaw || "medium"),
    focus: clip(focus, 120),
    action: clip(action, 200),
    ...(sceneRef ? { sceneRef: clip(sceneRef, 60) } : {}),
    dialogues,
    characterRefs,
    visualPrompt: finalVisual,
  };
}

function tryParseJsonCandidates(rawText: string): unknown {
  const trimmed = rawText.trim();
  const candidates: string[] = [];
  try {
    candidates.push(extractJSONValue(trimmed));
  } catch {
    /* ignore */
  }
  const fenced = trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  if (fenced && fenced !== trimmed) candidates.push(fenced);
  const objectStart = trimmed.indexOf("{");
  const arrayStart = trimmed.indexOf("[");
  if (objectStart >= 0) candidates.push(trimmed.slice(objectStart));
  if (arrayStart >= 0) candidates.push(trimmed.slice(arrayStart));
  candidates.push(trimmed);

  let lastError: unknown;
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch (error) {
      lastError = error;
      // 尝试截到最后一个 } 或 ]
      const endObj = candidate.lastIndexOf("}");
      const endArr = candidate.lastIndexOf("]");
      const end = Math.max(endObj, endArr);
      if (end > 0) {
        try {
          return JSON.parse(candidate.slice(0, end + 1));
        } catch (inner) {
          lastError = inner;
        }
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error("JSON parse failed");
}

/**
 * 尽最大努力识别外部模型粘贴回来的分格脚本。
 * 只做确定性归一化，不调用 LLM。
 */
export function parseManualPanelScriptOutput(rawText: string): ComicPanelScriptOutput {
  const trimmed = rawText.trim();
  if (!trimmed) {
    throw new AppError("请粘贴外部模型返回的分格脚本 JSON。", 400);
  }

  let parsed: unknown;
  try {
    parsed = tryParseJsonCandidates(trimmed);
  } catch {
    throw new AppError("未能识别为 JSON。请确认外部模型返回的是 JSON 对象（可含 ```json 代码块）。", 400);
  }

  const unwrapped = unwrapRoot(parsed);
  const scenes = unwrapped.scenes
    .map((item, index) => normalizeScene(item, index))
    .filter((item): item is Record<string, unknown> => Boolean(item))
    .slice(0, 8);
  const panels = unwrapped.panels
    .map((item, index) => normalizePanel(item, index))
    .filter((item): item is Record<string, unknown> => Boolean(item))
    .slice(0, 80)
    .map((panel, index) => ({ ...panel, order: index + 1 }));

  if (panels.length === 0) {
    throw new AppError("已识别到文本，但没有可用的 panels 格子。请确认 JSON 里包含 panels 数组。", 400);
  }

  const normalized = { scenes, panels };
  const result = manualComicPanelScriptOutputSchema.safeParse(normalized);
  if (result.success) {
    return result.data as ComicPanelScriptOutput;
  }

  // 再兜底：用正式 schema（若格数够）或返回更可读错误
  const strict = comicPanelScriptOutputSchema.safeParse(normalized);
  if (strict.success) return strict.data;

  const detail = result.error.issues.slice(0, 3).map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join(".") : "根对象";
    return `${path}: ${issue.message}`;
  }).join("；");
  throw new AppError(
    `已尽量识别，但仍有 ${panels.length} 格无法完整归一化（${detail}）。请让外部模型按提示词中的 JSON 字段名重新输出。`,
    400,
  );
}
