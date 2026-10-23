import type { ReactNode } from "react";
import { useChart } from "@/components/charts/chart-context";

/* Layers shared by the islands. Bklit has no props for these, so they read the chart's own scales. */

// Bklit's line and area charts run on dates, so week w sits at day w of a fixed epoch.
export const at = (w: number) => new Date(Date.UTC(2000, 0, 1) + w * 86_400_000);

/** x centre of week w and the width of its column, in a bar chart (xDataKey "Wk n") or a dated chart */
export function useWeekX() {
  const { barScale, bandWidth, xScale } = useChart();
  if (barScale && bandWidth) return { x: (w: number) => (barScale(`Wk ${w}`) ?? 0) + bandWidth / 2, width: bandWidth };
  // a dated chart's slot is a whole week; 0.82 matches the bar chart's band (barGap 0.18)
  return { x: (w: number) => xScale(at(w)), width: (xScale(at(1)) - xScale(at(0))) * 0.82 };
}

/** Faint full-height column behind each listed week. */
export function ColumnTrack({ weeks }: { weeks: number[] }) {
  const { innerHeight } = useChart();
  const { x, width } = useWeekX();
  return (
    <g aria-hidden="true">
      {weeks.map((w) => (
        <rect fill="var(--chart-1)" height={innerHeight} key={w} opacity={0.07} width={width} x={x(w) - width / 2} y={0} />
      ))}
    </g>
  );
}

/** "Out" / "Bye" / "Next" in empty columns, so a missing week never reads as zero. */
export function GapLabels({ gaps }: { gaps: { w: number; label: string; now?: boolean }[] }) {
  const { innerHeight } = useChart();
  const { x } = useWeekX();
  return (
    <g aria-hidden="true">
      {gaps.map((g) => (
        <text className="ll-gap" fill={g.now ? "var(--chart-1)" : "var(--chart-label)"} key={g.w} textAnchor="middle" x={x(g.w)} y={innerHeight - 10}>
          {g.label}
        </text>
      ))}
    </g>
  );
}
GapLabels.__isPostOverlay = true;

/** Value above a week's bar or point; faded while another bar is hovered. */
export function ValueLabels({ items, gap }: { items: { w: number; v: number; text: string; accent?: boolean }[]; gap: number }) {
  const { yScale, data, hoveredBarIndex } = useChart();
  const { x } = useWeekX();
  const hot = hoveredBarIndex != null ? (data[hoveredBarIndex] as { w?: number })?.w : null;
  return (
    <g aria-hidden="true">
      {items.map((d) => (
        <text
          className="ll-val"
          fill={d.accent ? "var(--chart-1)" : "var(--chart-foreground)"}
          key={d.w}
          opacity={hot != null && hot !== d.w ? 0.3 : 1}
          style={{ transition: "opacity .15s ease-in-out" }}
          textAnchor="middle"
          x={x(d.w)}
          y={yScale(d.v) - gap}
        >
          {d.text}
        </text>
      ))}
    </g>
  );
}
ValueLabels.__isPostOverlay = true;

/** "Wk 5" with the opponent underneath when given; this week and next in the accent colour. */
export function WeekAxis({ weeks }: { weeks: { w: number; o?: string; now?: boolean }[] }) {
  const { innerHeight } = useChart();
  const { x } = useWeekX();
  return (
    <g aria-hidden="true">
      {weeks.map((d) => (
        <g className={d.now ? "ll-axis now" : "ll-axis"} key={d.w}>
          <text className="ll-wk" textAnchor="middle" x={x(d.w)} y={innerHeight + 20}>
            Wk {d.w}
          </text>
          {d.o != null && (
            <text className="ll-opp" textAnchor="middle" x={x(d.w)} y={innerHeight + 38}>
              {d.o || "Bye"}
            </text>
          )}
        </g>
      ))}
    </g>
  );
}
WeekAxis.__isPostOverlay = true;

/** Season average as a dashed rule over the series, in the team's stripe colour. */
export function AvgRule({ value }: { value: number }) {
  const { yScale, innerWidth } = useChart();
  const y = yScale(value);
  return <line aria-hidden="true" stroke="var(--wka, var(--chart-1))" strokeDasharray="5 4" strokeWidth={2} x1={0} x2={innerWidth} y1={y} y2={y} />;
}
AvgRule.__isPostOverlay = true;

/** Tooltip box: a title and rows of <div><span>label</span><b>value</b></div>. */
export function Tip({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="ll-tip">
      <div className="ll-tip-h">{title}</div>
      <div className="ll-tip-r">{children}</div>
    </div>
  );
}

/** Signed difference to one decimal, green above and red below. */
export function Diff({ v, unit = "" }: { v: number; unit?: string }) {
  const d = Math.round(v * 10) / 10;
  return (
    <b className={d > 0 ? "up" : d < 0 ? "dn" : ""}>
      {d >= 0 ? "+" : "−"}
      {Math.abs(d).toFixed(1)}
      {unit}
    </b>
  );
}
