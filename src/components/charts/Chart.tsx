import { useEffect, useRef } from "react";
import { BarChart, LineChart, ScatterChart } from "echarts/charts";
import {
  DataZoomComponent,
  GridComponent,
  MarkLineComponent,
  TooltipComponent,
} from "echarts/components";
import * as echarts from "echarts/core";
import { CanvasRenderer } from "echarts/renderers";

echarts.use([
  BarChart, LineChart, ScatterChart,
  GridComponent, TooltipComponent, MarkLineComponent, DataZoomComponent,
  CanvasRenderer,
]);

export type ChartOption = echarts.EChartsCoreOption;

const TOKENS = {
  ink: "--color-ink",
  paper: "--color-paper",
  muted: "--color-paper-muted",
  dim: "--color-paper-dim",
  grey: "--color-grey",
  line: "--color-line",
  yellow: "--color-yellow",
  red: "--color-red",
  pink: "--color-pink",
  blue: "--color-blue",
  onpaper: "--color-onpaper",
} as const;

let probe: CanvasRenderingContext2D | null | undefined;
/** The ECharts canvas renderer cannot parse `oklch()`: rasterise the token once and read back an sRGB value. */
function toSrgb(css: string): string {
  if (probe === undefined) probe = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
  if (!probe) return css;
  probe.clearRect(0, 0, 1, 1);
  probe.fillStyle = css;
  probe.fillRect(0, 0, 1, 1);
  const [r, g, b, a] = probe.getImageData(0, 0, 1, 1).data;
  return `rgba(${r},${g},${b},${a / 255})`;
}

const resolved = new Map<string, string>();
function token(name: string): string {
  let v = resolved.get(name);
  if (!v) {
    v = toSrgb(getComputedStyle(document.documentElement).getPropertyValue(name).trim());
    resolved.set(name, v);
  }
  return v;
}

/** Palette read from the CSS tokens in `src/index.css` (resolved lazily, after the stylesheet is applied). */
export const PK = {} as Record<keyof typeof TOKENS, string>;
for (const [key, name] of Object.entries(TOKENS)) Object.defineProperty(PK, key, { get: () => token(name), enumerable: true });

let themeRegistered = false;
/** "Giscard punk" ECharts theme, built from the tokens on first use. */
function registerPunkTheme() {
  if (themeRegistered) return;
  themeRegistered = true;
  echarts.registerTheme("punk", {
    backgroundColor: "transparent",
    color: [PK.yellow, PK.paper, PK.dim, PK.pink, PK.blue],
    textStyle: { fontFamily: "Courier Prime, monospace", color: PK.muted, fontSize: 13 },
    categoryAxis: {
      axisLine: { lineStyle: { color: PK.grey, width: 2 } },
      axisTick: { show: false },
      axisLabel: { color: PK.muted, fontSize: 12 },
      splitLine: { show: false },
    },
    valueAxis: {
      axisLine: { show: true, lineStyle: { color: PK.grey, width: 2 } },
      axisLabel: { color: PK.muted, fontSize: 12 },
      splitLine: { lineStyle: { color: PK.line, type: "dotted" } },
    },
    bar: { itemStyle: { borderRadius: 0 } },
    line: { symbol: "rect", symbolSize: 5, lineStyle: { width: 2 } },
    scatter: { symbol: "rect", symbolSize: 5 },
    tooltip: {
      backgroundColor: PK.paper,
      borderColor: PK.ink,
      borderWidth: 2,
      textStyle: { color: PK.onpaper, fontFamily: "Courier Prime, monospace" },
      extraCssText: "border-radius:0;box-shadow:4px 4px 0 var(--color-ink);",
    },
  });
}

/** `onPick`: click anywhere in the chart area → index of the category (X axis) under the cursor. */
export function Chart({ option, height = 280, onPick }: { option: ChartOption; height?: number; onPick?: (index: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const chart = useRef<echarts.ECharts | null>(null);
  const pick = useRef(onPick);
  pick.current = onPick;

  useEffect(() => {
    if (!ref.current) return;
    registerPunkTheme();
    const c = echarts.init(ref.current, "punk", { renderer: "canvas" });
    chart.current = c;
    const ro = new ResizeObserver(() => c.resize());
    ro.observe(ref.current);

    const indexAt = (e: { offsetX: number; offsetY: number }) => {
      const pt = [e.offsetX, e.offsetY];
      if (!c.containPixel("grid", pt)) return null;
      const x = (c.convertFromPixel({ seriesIndex: 0 }, pt) as number[] | undefined)?.[0];
      return x != null && Number.isFinite(x) ? Math.round(x) : null;
    };
    const zr = c.getZr();
    zr.on("click", (e) => {
      const i = pick.current ? indexAt(e) : null;
      if (i != null) pick.current?.(i);
    });
    zr.on("mousemove", (e) => {
      if (pick.current && indexAt(e) != null) zr.setCursorStyle("pointer");
    });

    return () => {
      ro.disconnect();
      c.dispose();
      chart.current = null;
    };
  }, []);

  useEffect(() => {
    try {
      chart.current?.setOption({ animationDuration: 400, ...option }, { notMerge: true });
    } catch (e) {
      // A failing chart must not take the whole page down.
      console.error("Chart error:", e, option);
    }
  }, [option]);

  return <div ref={ref} style={{ height, width: "100%" }} />;
}
