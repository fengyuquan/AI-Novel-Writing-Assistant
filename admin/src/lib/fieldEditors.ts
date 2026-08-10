import type { AdminFieldMeta } from "@/lib/api";

const LARGE_TEXT_FIELD_NAMES = new Set([
  "content",
  "description",
  "taskSheet",
  "sceneCards",
  "repairHistory",
  "background",
  "development",
  "personality",
  "summary",
  "originalExpression",
  "structuredIntentJson",
  "snapshotData",
  "mustAvoid",
  "hook",
  "expectation",
]);

export function isJsonField(field: AdminFieldMeta): boolean {
  return field.isJsonLike || field.type === "Json" || /Json$/i.test(field.name);
}

export function isLargeTextField(field: AdminFieldMeta, value = ""): boolean {
  if (isJsonField(field)) return true;
  if (LARGE_TEXT_FIELD_NAMES.has(field.name)) return true;
  if (field.type !== "String") return false;
  if (value.length >= 120) return true;
  return /(content|summary|prompt|text|body|note|detail|guidance)/i.test(field.name);
}

export function tryFormatJson(raw: string): { ok: true; value: string } | { ok: false; error: string } {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: true, value: "" };
  }
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    return { ok: true, value: JSON.stringify(parsed, null, 2) };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "JSON 无法解析",
    };
  }
}

export function validateJsonText(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    JSON.parse(trimmed);
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : "JSON 无法解析";
  }
}

/** For Prisma Json columns return object; for String *Json keep string. */
export function coerceJsonFieldValue(field: AdminFieldMeta, raw: string): unknown {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (field.type === "Json") {
    return JSON.parse(trimmed) as unknown;
  }
  // Keep storage as string for String columns, but ensure valid JSON when name ends with Json.
  if (/Json$/i.test(field.name) || field.isJsonLike) {
    JSON.parse(trimmed);
    return trimmed;
  }
  return raw;
}

export function prettyInitialJson(raw: string): string {
  const formatted = tryFormatJson(raw);
  return formatted.ok ? formatted.value : raw;
}
