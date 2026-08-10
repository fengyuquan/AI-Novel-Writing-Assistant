import { useEffect, useState } from "react";

export type StyleBenchmarkCompareDeskMode = "portrait-stack" | "short-landscape" | "desktop";

/** 矮横屏：方向横置且可视高度很低（手机横屏常见宽>720）。 */
export const SHORT_LANDSCAPE_MAX_HEIGHT_PX = 560;
/** 窄宽竖屏堆叠上限；勿只靠 720，需结合方向。 */
export const PORTRAIT_STACK_MAX_WIDTH_PX = 767;
/** 对照栏范文上限（另加用户正文）。 */
export const MOBILE_COMPARE_MAX_BENCHMARK_COLUMNS = 3;

function readDeskMode(): StyleBenchmarkCompareDeskMode {
  if (typeof window === "undefined") {
    return "desktop";
  }
  const width = window.innerWidth;
  const height = window.innerHeight;
  const isLandscape = width > height;
  const isShortLandscape = isLandscape && height <= SHORT_LANDSCAPE_MAX_HEIGHT_PX;
  if (isShortLandscape) {
    return "short-landscape";
  }
  const isNarrow = width <= PORTRAIT_STACK_MAX_WIDTH_PX;
  const isPortraitPhoneLike = !isLandscape && width <= 1024;
  if (isNarrow || isPortraitPhoneLike) {
    return "portrait-stack";
  }
  return "desktop";
}

export function useStyleBenchmarkCompareDeskMode(): StyleBenchmarkCompareDeskMode {
  const [mode, setMode] = useState<StyleBenchmarkCompareDeskMode>(() => readDeskMode());

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }
    const update = () => setMode(readDeskMode());
    update();
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    };
  }, []);

  return mode;
}

export function isCompactCompareDesk(mode: StyleBenchmarkCompareDeskMode): boolean {
  return mode === "portrait-stack" || mode === "short-landscape";
}
