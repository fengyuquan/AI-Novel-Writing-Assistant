export type CopyTextResult =
  | { method: "clipboard" }
  | { method: "execCommand" }
  | { method: "download"; filename: string };

function tryExecCommandOnElement(el: HTMLTextAreaElement | HTMLInputElement): boolean {
  const previousStart = "selectionStart" in el ? el.selectionStart : null;
  const previousEnd = "selectionEnd" in el ? el.selectionEnd : null;
  try {
    el.focus();
    el.select();
    if (typeof el.setSelectionRange === "function") {
      el.setSelectionRange(0, el.value.length);
    }
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    if (
      previousStart != null
      && previousEnd != null
      && typeof el.setSelectionRange === "function"
    ) {
      try {
        el.setSelectionRange(previousStart, previousEnd);
      } catch {
        /* ignore */
      }
    }
  }
}

function tryExecCommandCopy(text: string): boolean {
  if (typeof document === "undefined") {
    return false;
  }
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "true");
  // 放在可视区内，避免部分桌面壳 / Dialog 焦点陷阱把不可见节点当无效复制源
  area.style.position = "fixed";
  area.style.top = "0";
  area.style.left = "0";
  area.style.width = "2px";
  area.style.height = "2px";
  area.style.padding = "0";
  area.style.border = "none";
  area.style.outline = "none";
  area.style.boxShadow = "none";
  area.style.background = "transparent";
  area.style.zIndex = "2147483647";
  document.body.appendChild(area);
  const copied = tryExecCommandOnElement(area);
  document.body.removeChild(area);
  return copied;
}

export function downloadPlainTextFile(text: string, filename: string): void {
  const safeName = filename.trim() || "copy.txt";
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = safeName.endsWith(".txt") ? safeName : `${safeName}.txt`;
  anchor.click();
  URL.revokeObjectURL(url);
}

/**
 * Copy text with fallbacks for non-secure / restricted environments
 * (HTTP LAN, some desktop shells, remote sessions without clipboard).
 * Last resort: download a .txt file.
 */
export async function copyTextWithFallback(
  text: string,
  options?: {
    downloadFilename?: string;
    /** Dialog 内优先用可见输入框复制，避开焦点陷阱导致的 execCommand 失败 */
    sourceElement?: HTMLTextAreaElement | HTMLInputElement | null;
  },
): Promise<CopyTextResult> {
  const downloadFilename = options?.downloadFilename?.trim() || "prompt-pack.txt";
  const value = text ?? "";
  const source = options?.sourceElement;

  if (!value) {
    downloadPlainTextFile("", downloadFilename);
    return { method: "download", filename: downloadFilename };
  }

  // Dialog / 桌面壳里优先用可见输入框 execCommand，比异步 clipboard API 更稳
  if (source) {
    const previousValue = source.value;
    try {
      if (source.value !== value) {
        source.value = value;
      }
      if (tryExecCommandOnElement(source)) {
        return { method: "execCommand" };
      }
    } finally {
      if (source.value !== previousValue) {
        source.value = previousValue;
      }
    }
  }

  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return { method: "clipboard" };
    } catch {
      // fall through
    }
  }

  if (tryExecCommandCopy(value)) {
    return { method: "execCommand" };
  }

  downloadPlainTextFile(value, downloadFilename);
  return { method: "download", filename: downloadFilename };
}

export function describeCopyResult(result: CopyTextResult): string {
  if (result.method === "download") {
    return `当前环境无法写入剪贴板，已改为下载文本文件：${result.filename}`;
  }
  return "已复制到剪贴板。";
}
