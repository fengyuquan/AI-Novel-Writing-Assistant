export type CopyTextResult =
  | { method: "clipboard" }
  | { method: "execCommand" }
  | { method: "download"; filename: string };

/**
 * 最稳的复制路径：在用户手势触发的 copy 事件里直接写入 clipboardData。
 * 不依赖选区，也不依赖 Clipboard API 权限；Dialog / 桌面壳里也更可靠。
 */
function tryCopyViaClipboardEvent(text: string): boolean {
  if (typeof document === "undefined") return false;
  let written = false;
  const onCopy = (event: ClipboardEvent) => {
    try {
      event.clipboardData?.setData("text/plain", text);
      event.preventDefault();
      written = true;
    } catch {
      written = false;
    }
  };
  document.addEventListener("copy", onCopy, true);
  try {
    const ok = document.execCommand("copy");
    return Boolean(ok && written);
  } catch {
    return false;
  } finally {
    document.removeEventListener("copy", onCopy, true);
  }
}

function tryExecCommandOnElement(el: HTMLTextAreaElement | HTMLInputElement): boolean {
  const previousStart = "selectionStart" in el ? el.selectionStart : null;
  const previousEnd = "selectionEnd" in el ? el.selectionEnd : null;
  try {
    el.focus({ preventScroll: true });
    el.select();
    if (typeof el.setSelectionRange === "function") {
      el.setSelectionRange(0, el.value.length);
    }
    // 先走事件注入，选区失败时也能写入
    if (tryCopyViaClipboardEvent(el.value)) {
      return true;
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
  if (tryCopyViaClipboardEvent(text)) {
    return true;
  }
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "true");
  // 放在可视区内，避免部分桌面壳 / Dialog 焦点陷阱把不可见节点当无效复制源
  area.style.position = "fixed";
  area.style.top = "1px";
  area.style.left = "1px";
  area.style.width = "1px";
  area.style.height = "1px";
  area.style.padding = "0";
  area.style.margin = "0";
  area.style.border = "none";
  area.style.outline = "none";
  area.style.opacity = "0.01";
  area.style.zIndex = "2147483647";
  document.body.appendChild(area);
  const copied = tryExecCommandOnElement(area);
  document.body.removeChild(area);
  return copied;
}

async function tryClipboardApiWrite(text: string): Promise<boolean> {
  if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
    return false;
  }
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    return false;
  }

  // 有些环境 writeText resolve 了但系统剪贴板其实没变；能读回就校验
  if (typeof navigator.clipboard.readText !== "function") {
    return true;
  }
  try {
    const current = await navigator.clipboard.readText();
    return current === text;
  } catch {
    // 无读权限时无法验证，视为可能成功，由调用方继续兜底
    return true;
  }
}

export function downloadPlainTextFile(text: string, filename: string): void {
  const safeName = filename.trim() || "copy.txt";
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = safeName.endsWith(".txt") ? safeName : `${safeName}.txt`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
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

  // 1) 用户手势下的 copy 事件注入（不依赖选区，Dialog 里最稳）
  if (tryCopyViaClipboardEvent(value)) {
    return { method: "execCommand" };
  }

  // 2) 可见输入框选中复制
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

  // 3) Clipboard API（尽量校验读回）
  if (await tryClipboardApiWrite(value)) {
    return { method: "clipboard" };
  }

  // 4) 临时 textarea
  if (tryExecCommandCopy(value)) {
    return { method: "execCommand" };
  }

  // 5) 最后兜底下载，避免再误报“已复制”
  downloadPlainTextFile(value, downloadFilename);
  return { method: "download", filename: downloadFilename };
}

export function describeCopyResult(result: CopyTextResult): string {
  if (result.method === "download") {
    return `当前环境无法写入剪贴板，已改为下载文本文件：${result.filename}`;
  }
  return "已复制到剪贴板。";
}
