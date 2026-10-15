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

/** Couleurs sRGB des tokens (le canvas ECharts ne lit pas les variables CSS). */
export const PK = {
  ink: "#070707",
  paper: "#f1eee7",
  muted: "#b0aea7",
  dim: "#88867f",
  grey: "#555555",
  line: "#292929",
  yellow: "#f2d935",
  red: "#e62c2c",
  pink: "#fc65b6",
  blue: "#1e4eac",
};

// Thème « Giscard punk » (design_handoff_pointeuse/tokens/echarts-theme.json).
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
    textStyle: { color: "#111111", fontFamily: "Courier Prime, monospace" },
    extraCssText: "border-radius:0;box-shadow:4px 4px 0 #000;",
  },
});

/** `onPick` : clic n'importe où dans la zone du graphique → index de la catégorie (axe X) sous le curseur. */
export function Chart({ option, height = 280, onPick }: { option: ChartOption; height?: number; onPick?: (index: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const chart = useRef<echarts.ECharts | null>(null);
  const pick = useRef(onPick);
  pick.current = onPick;

  useEffect(() => {
    if (!ref.current) return;
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
      // Un graphique en erreur ne doit pas faire planter toute la page.
      console.error("Graphique :", e, option);
    }
  }, [option]);

  return <div ref={ref} style={{ height, width: "100%" }} />;
}
