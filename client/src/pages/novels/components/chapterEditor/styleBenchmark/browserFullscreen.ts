/** 尽量收起手机浏览器顶栏/底栏；能力因浏览器而异（iOS Safari 常不支持任意元素全屏）。 */

type FullscreenDocument = Document & {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
};

type FullscreenElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
};

export function getFullscreenElement(): Element | null {
  const doc = document as FullscreenDocument;
  return document.fullscreenElement ?? doc.webkitFullscreenElement ?? null;
}

export function isBrowserFullscreenActive(): boolean {
  return Boolean(getFullscreenElement());
}

export async function enterBrowserFullscreen(target?: HTMLElement | null): Promise<boolean> {
  if (typeof document === "undefined") {
    return false;
  }
  if (isBrowserFullscreenActive()) {
    return true;
  }
  const element = (target ?? document.documentElement) as FullscreenElement;
  try {
    if (typeof element.requestFullscreen === "function") {
      await element.requestFullscreen({ navigationUI: "hide" });
      return true;
    }
    if (typeof element.webkitRequestFullscreen === "function") {
      await element.webkitRequestFullscreen();
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

export async function exitBrowserFullscreen(): Promise<void> {
  if (typeof document === "undefined" || !isBrowserFullscreenActive()) {
    return;
  }
  const doc = document as FullscreenDocument;
  try {
    if (typeof document.exitFullscreen === "function") {
      await document.exitFullscreen();
      return;
    }
    if (typeof doc.webkitExitFullscreen === "function") {
      await doc.webkitExitFullscreen();
    }
  } catch {
    // ignore
  }
}
