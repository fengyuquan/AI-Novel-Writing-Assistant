const ACCEPTED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/jpg", "image/webp"]);

function normalizeImageMime(type: string | undefined): string | null {
  const mime = (type || "").split(";")[0]?.trim().toLowerCase() || "";
  if (!ACCEPTED_IMAGE_TYPES.has(mime)) return null;
  return mime === "image/jpg" ? "image/jpeg" : mime;
}

function fileFromBlob(blob: Blob, mime: string, basename: string): File {
  const ext = mime === "image/jpeg" ? "jpg" : mime === "image/webp" ? "webp" : "png";
  return new File([blob], `${basename}.${ext}`, { type: mime });
}

/** 从粘贴事件中取出第一张可用图片。 */
export function extractImageFileFromClipboardEvent(event: ClipboardEvent): File | null {
  const items = event.clipboardData?.items;
  if (!items) return null;
  for (const item of items) {
    if (item.kind !== "file") continue;
    const mime = normalizeImageMime(item.type);
    if (!mime) continue;
    const file = item.getAsFile();
    if (!file) continue;
    return fileFromBlob(file, mime, "pasted-image");
  }
  return null;
}

/** 主动读取系统剪贴板中的图片（需浏览器权限）。 */
export async function readClipboardImageFile(): Promise<File | null> {
  if (typeof navigator === "undefined" || !navigator.clipboard?.read) {
    return null;
  }
  const items = await navigator.clipboard.read();
  for (const item of items) {
    const type = item.types.find((candidate) => Boolean(normalizeImageMime(candidate)));
    if (!type) continue;
    const mime = normalizeImageMime(type);
    if (!mime) continue;
    const blob = await item.getType(type);
    return fileFromBlob(blob, mime, "pasted-image");
  }
  return null;
}
