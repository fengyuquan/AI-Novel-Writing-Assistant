const PREFIX = "ai-novel-admin-columns:";

export function loadVisibleColumns(model: string, fallback: string[]): string[] {
  try {
    const raw = localStorage.getItem(`${PREFIX}${model}`);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return fallback;
    const columns = parsed.filter((item): item is string => typeof item === "string");
    return columns.length > 0 ? columns : fallback;
  } catch {
    return fallback;
  }
}

export function saveVisibleColumns(model: string, columns: string[]): void {
  localStorage.setItem(`${PREFIX}${model}`, JSON.stringify(columns));
}

export async function copyText(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
}
