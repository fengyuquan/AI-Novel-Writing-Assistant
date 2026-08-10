export function truncateText(value: unknown, max = 80): string {
  if (value === null || value === undefined) {
    return "";
  }
  const text = typeof value === "string" ? value : JSON.stringify(value);
  if (text.length <= max) {
    return text;
  }
  return `${text.slice(0, max)}…`;
}

export function displayCell(value: unknown): string {
  if (value === null || value === undefined) {
    return "—";
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  if (typeof value === "object") {
    return truncateText(JSON.stringify(value), 60);
  }
  return truncateText(String(value), 80);
}

export function preferredListColumns(fieldNames: string[], primaryKey: string): string[] {
  const preferred = [primaryKey, "title", "name", "provider", "key", "status", "order", "novelId", "updatedAt", "createdAt"];
  const selected: string[] = [];
  for (const name of preferred) {
    if (fieldNames.includes(name) && !selected.includes(name)) {
      selected.push(name);
    }
  }
  for (const name of fieldNames) {
    if (selected.length >= 8) break;
    if (!selected.includes(name)) {
      selected.push(name);
    }
  }
  return selected;
}
