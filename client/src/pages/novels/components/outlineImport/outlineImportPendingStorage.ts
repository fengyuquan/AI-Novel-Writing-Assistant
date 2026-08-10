import type { OutlineImportPendingAlignmentItem } from "@ai-novel/shared/types/outlineImportConflict";

function storageKey(novelId: string): string {
  return `outline-import-pending-alignments:${novelId}`;
}

export function loadOutlineImportPendingAlignments(
  novelId: string,
): OutlineImportPendingAlignmentItem[] {
  if (typeof window === "undefined" || !novelId) {
    return [];
  }
  try {
    const raw = window.localStorage.getItem(storageKey(novelId));
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter(
      (item): item is OutlineImportPendingAlignmentItem =>
        Boolean(item && typeof item === "object" && typeof (item as { conflictId?: unknown }).conflictId === "string"),
    );
  } catch {
    return [];
  }
}

export function saveOutlineImportPendingAlignments(
  novelId: string,
  items: OutlineImportPendingAlignmentItem[],
): void {
  if (typeof window === "undefined" || !novelId) {
    return;
  }
  if (!items.length) {
    window.localStorage.removeItem(storageKey(novelId));
    return;
  }
  window.localStorage.setItem(storageKey(novelId), JSON.stringify(items));
}

export function clearOutlineImportPendingAlignments(novelId: string): void {
  if (typeof window === "undefined" || !novelId) {
    return;
  }
  window.localStorage.removeItem(storageKey(novelId));
}
