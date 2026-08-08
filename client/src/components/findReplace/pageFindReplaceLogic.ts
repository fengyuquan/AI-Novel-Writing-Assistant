export type FindReplaceFlags = {
  caseSensitive: boolean;
};

export type EditableTargetKind = "input" | "textarea" | "contenteditable";

export type EditableTarget = {
  id: string;
  kind: EditableTargetKind;
  element: HTMLInputElement | HTMLTextAreaElement | HTMLElement;
  label: string;
};

export type FindMatch = {
  targetId: string;
  start: number;
  end: number;
};

const SKIP_INPUT_TYPES = new Set([
  "button",
  "checkbox",
  "color",
  "file",
  "hidden",
  "image",
  "radio",
  "range",
  "reset",
  "submit",
]);

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function createFindRegex(query: string, flags: FindReplaceFlags): RegExp | null {
  const trimmed = query;
  if (!trimmed) {
    return null;
  }
  return new RegExp(escapeRegExp(trimmed), flags.caseSensitive ? "g" : "gi");
}

export function countMatchesInText(text: string, query: string, flags: FindReplaceFlags): number {
  const regex = createFindRegex(query, flags);
  if (!regex) {
    return 0;
  }
  return Array.from(text.matchAll(regex)).length;
}

export function replaceAllInText(text: string, query: string, replacement: string, flags: FindReplaceFlags): {
  nextText: string;
  replacedCount: number;
} {
  const regex = createFindRegex(query, flags);
  if (!regex) {
    return { nextText: text, replacedCount: 0 };
  }
  const matches = Array.from(text.matchAll(regex));
  if (matches.length === 0) {
    return { nextText: text, replacedCount: 0 };
  }
  return {
    nextText: text.replace(regex, () => replacement),
    replacedCount: matches.length,
  };
}

function isVisible(element: HTMLElement): boolean {
  if (element.closest("[data-find-replace-panel='true']")) {
    return false;
  }
  if (element.getAttribute("aria-hidden") === "true") {
    return false;
  }
  const style = window.getComputedStyle(element);
  if (style.display === "none" || style.visibility === "hidden") {
    return false;
  }
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function describeTarget(element: HTMLElement, index: number): string {
  const labelledBy = element.getAttribute("aria-labelledby");
  if (labelledBy) {
    const labelText = labelledBy
      .split(/\s+/)
      .map((id) => document.getElementById(id)?.textContent?.trim() ?? "")
      .filter(Boolean)
      .join(" ");
    if (labelText) {
      return labelText.slice(0, 40);
    }
  }
  const ariaLabel = element.getAttribute("aria-label")?.trim();
  if (ariaLabel) {
    return ariaLabel.slice(0, 40);
  }
  const placeholder = (element as HTMLInputElement).placeholder?.trim();
  if (placeholder) {
    return placeholder.slice(0, 40);
  }
  const name = (element as HTMLInputElement).name?.trim();
  if (name) {
    return name.slice(0, 40);
  }
  return `可编辑区域 ${index + 1}`;
}

export function resolveSearchRoot(): HTMLElement {
  return (
    document.querySelector("main")
    ?? document.querySelector("[data-find-replace-root='true']")
    ?? document.body
  );
}

export function collectEditableTargets(root: ParentNode = resolveSearchRoot()): EditableTarget[] {
  const nodes = Array.from(
    root.querySelectorAll<HTMLElement>("input, textarea, [contenteditable='true']"),
  );
  const targets: EditableTarget[] = [];

  nodes.forEach((element, index) => {
    if (!isVisible(element)) {
      return;
    }
    if (element instanceof HTMLInputElement) {
      const type = (element.type || "text").toLowerCase();
      if (SKIP_INPUT_TYPES.has(type) || element.disabled || element.readOnly) {
        return;
      }
      targets.push({
        id: `input-${index}`,
        kind: "input",
        element,
        label: describeTarget(element, index),
      });
      return;
    }
    if (element instanceof HTMLTextAreaElement) {
      if (element.disabled || element.readOnly) {
        return;
      }
      targets.push({
        id: `textarea-${index}`,
        kind: "textarea",
        element,
        label: describeTarget(element, index),
      });
      return;
    }
    if (element.isContentEditable) {
      if (element.getAttribute("contenteditable") === "false") {
        return;
      }
      // Plate 外层可能套了多个 contenteditable；优先叶子节点
      if (element.querySelector("[contenteditable='true']")) {
        return;
      }
      targets.push({
        id: `contenteditable-${index}`,
        kind: "contenteditable",
        element,
        label: describeTarget(element, index),
      });
    }
  });

  return targets;
}

export function readTargetText(target: EditableTarget): string {
  if (target.kind === "input" || target.kind === "textarea") {
    return (target.element as HTMLInputElement | HTMLTextAreaElement).value ?? "";
  }
  const blocks = target.element.querySelectorAll('[data-slate-node="element"]');
  if (blocks.length > 0) {
    return Array.from(blocks)
      .map((block) => (block.textContent ?? "").replace(/\uFEFF/g, ""))
      .join("\n\n");
  }
  return (target.element.innerText ?? "").replace(/\r\n/g, "\n");
}

function setNativeInputValue(element: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const prototype = element instanceof HTMLTextAreaElement
    ? HTMLTextAreaElement.prototype
    : HTMLInputElement.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
  descriptor?.set?.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
}

function setContentEditableText(element: HTMLElement, value: string): boolean {
  element.focus();
  const selection = window.getSelection();
  if (!selection) {
    return false;
  }
  const range = document.createRange();
  range.selectNodeContents(element);
  selection.removeAllRanges();
  selection.addRange(range);

  const inserted = document.execCommand("insertText", false, value);
  if (inserted) {
    return true;
  }

  element.textContent = value;
  element.dispatchEvent(new InputEvent("input", {
    bubbles: true,
    cancelable: true,
    inputType: "insertText",
    data: value,
  }));
  return true;
}

export function writeTargetText(target: EditableTarget, value: string): boolean {
  if (target.kind === "input" || target.kind === "textarea") {
    const element = target.element as HTMLInputElement | HTMLTextAreaElement;
    setNativeInputValue(element, value);
    return true;
  }
  return setContentEditableText(target.element, value);
}

export function focusTargetMatch(target: EditableTarget, start: number, end: number): void {
  if (target.kind === "input" || target.kind === "textarea") {
    const element = target.element as HTMLInputElement | HTMLTextAreaElement;
    element.focus();
    element.setSelectionRange(start, end);
    element.scrollIntoView({ block: "center", behavior: "smooth" });
    return;
  }
  target.element.focus();
  target.element.scrollIntoView({ block: "center", behavior: "smooth" });
}

export function collectMatches(targets: EditableTarget[], query: string, flags: FindReplaceFlags): FindMatch[] {
  const regex = createFindRegex(query, flags);
  if (!regex) {
    return [];
  }
  const matches: FindMatch[] = [];
  for (const target of targets) {
    const text = readTargetText(target);
    for (const match of text.matchAll(regex)) {
      const start = match.index ?? 0;
      matches.push({
        targetId: target.id,
        start,
        end: start + match[0].length,
      });
    }
  }
  return matches;
}

export function replaceAllAcrossTargets(
  targets: EditableTarget[],
  query: string,
  replacement: string,
  flags: FindReplaceFlags,
): { replacedCount: number; affectedTargets: number } {
  let replacedCount = 0;
  let affectedTargets = 0;
  for (const target of targets) {
    const current = readTargetText(target);
    const { nextText, replacedCount: count } = replaceAllInText(current, query, replacement, flags);
    if (count === 0) {
      continue;
    }
    if (writeTargetText(target, nextText)) {
      replacedCount += count;
      affectedTargets += 1;
    }
  }
  return { replacedCount, affectedTargets };
}
