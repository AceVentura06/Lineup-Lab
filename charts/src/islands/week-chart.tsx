import { useId } from "react";
import { Bar } from "@/components/charts/bar";
import { BarChart } from "@/components/charts/bar-chart";
import { useChart } from "@/components/charts/chart-context";
import { Grid } from "@/components/charts/grid";
import { PatternLines } from "@/components/charts/patterns";
import { ChartTooltip } from "@/components/charts/tooltip";

/** One week as index.html's weekCard() describes it. */
export interface Week {
  w: number;
  /** "vs SF", "at DEN", or "" on a bye */
  o: string;
  v?: number;
  snap?: number | null;
  kind: "played" | "proj" | "bye" | "out" | "upcoming";
}

export interface WeekChartProps {
  weeks: Week[];
  avg: number | null;
  showSnaps: boolean;
  /** grow the bars in; the page passes false after the first time a player is shown */
  animate?: boolean;
}

type Row = Week & { name: string; pts: number; proj: number } & Record<string, unknown>;

const n1 = (v: number) => (Math.round(v * 10) / 10).toFixed(1);
const GAP_LABEL: Record<string, string> = { bye: "Bye", out: "Out", upcoming: "Next" };

/* ---------- custom layers (Bklit has no prop for these; recipe 15 pattern: read the chart's own scales) ---------- */

/** "Out" / "Bye" / "Next" in empty columns, so a missing bar never reads as zero points. */
function GapLabels() {
  const { data, barScale, bandWidth, barXAccessor, innerHeight } = useChart();
  if (!(barScale && bandWidth && barXAccessor)) return null;
  return (
    <g aria-hidden="true">
      {(data as unknown as Row[]).map((d) => {
        const label = GAP_LABEL[d.kind];
        if (!label) return null;
        const x = (barScale(barXAccessor(d)) ?? 0) + bandWidth / 2;
        return (
          <text
            className="ll-gap"
            fill={d.kind === "upcoming" ? "var(--chart-1)" : "var(--chart-label)"}
            key={d.name}
            textAnchor="middle"
            x={x}
            y={innerHeight - 10}
          >
            {label}
          </text>
        );
      })}
    </g>
  );
}
GapLabels.__isPostOverlay = true;

/** Faint full-height column behind each week, so the chart has structure even in low weeks. */
function ColumnTrack() {
  const { data, barScale, bandWidth, barXAccessor, innerHeight } = useChart();
  if (!(barScale && bandWidth && barXAccessor)) return null;
  return (
    <g aria-hidden="true">
      {(data as unknown as Row[]).map((d) => (
        <rect
          fill="var(--chart-1)"
          height={innerHeight}
          key={d.name}
          opacity={0.07}
          width={bandWidth}
          x={barScale(barXAccessor(d)) ?? 0}
          y={0}
        />
      ))}
    </g>
  );
}

/** Season average as a dashed rule drawn over the bars, in the team's stripe colour. */
function AvgRule({ value }: { value: number }) {
  const { yScale, innerWidth } = useChart();
  const y = yScale(value);
  return (
    <line
      aria-hidden="true"
      stroke="var(--wka, var(--chart-1))"
      strokeDasharray="5 4"
      strokeWidth={2}
      x1={0}
      x2={innerWidth}
      y1={y}
      y2={y}
    />
  );
}
AvgRule.__isPostOverlay = true;

/** Score above each bar, kept outside the bar so short weeks (2.0 pts) stay readable. */
function ValueLabels() {
  const { data, barScale, bandWidth, barXAccessor, yScale, hoveredBarIndex } = useChart();
  if (!(barScale && bandWidth && barXAccessor)) return null;
  return (
    <g aria-hidden="true">
      {(data as unknown as Row[]).map((d, i) => {
        const v = d.pts || d.proj;
        if (!v) return null;
        const x = (barScale(barXAccessor(d)) ?? 0) + bandWidth / 2;
        const faded = hoveredBarIndex != null && hoveredBarIndex !== i;
        return (
          <text
            className="ll-val"
            fill={d.kind === "proj" ? "var(--chart-1)" : "var(--chart-foreground)"}
            key={d.name}
            opacity={faded ? 0.3 : 1}
            style={{ transition: "opacity .15s ease-in-out" }}
            textAnchor="middle"
            x={x}
            y={yScale(v) - 8}
          >
            {n1(v)}
          </text>
        );
      })}
    </g>
  );
}
ValueLabels.__isPostOverlay = true;

/** Two-line week axis: "Wk 5" and the opponent underneath. */
function WeekAxis() {
  const { data, barScale, bandWidth, barXAccessor, innerHeight } = useChart();
  if (!(barScale && bandWidth && barXAccessor)) return null;
  return (
    <g aria-hidden="true">
      {(data as unknown as Row[]).map((d) => {
        const x = (barScale(barXAccessor(d)) ?? 0) + bandWidth / 2;
        const now = d.kind === "proj" || d.kind === "upcoming";
        return (
          <g className={now ? "ll-axis now" : "ll-axis"} key={d.name}>
            <text className="ll-wk" textAnchor="middle" x={x} y={innerHeight + 20}>
              {d.name}
            </text>
            <text className="ll-opp" textAnchor="middle" x={x} y={innerHeight + 38}>
              {d.o || "Bye"}
            </text>
          </g>
        );
      })}
    </g>
  );
}
WeekAxis.__isPostOverlay = true;

/* ---------- the chart ---------- */

export function WeekChart({ weeks, avg, showSnaps, animate = true }: WeekChartProps) {
  const hatch = `wk-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const data: Row[] = weeks.map((x) => ({
    ...x,
    name: `Wk ${x.w}`,
    pts: x.kind === "played" ? (x.v ?? 0) : 0,
    proj: x.kind === "proj" ? (x.v ?? 0) : 0,
  }));

  return (
    <div className="ll-wk-scroll">
      <div className="ll-wk-inner" style={{ minWidth: `calc(${weeks.length} * var(--ll-col, 64px))` }}>
        <BarChart
          aspectRatio="auto"
          barGap={0.18}
          className="ll-wk-chart"
          data={data}
          margin={{ top: 26, right: 0, bottom: 46, left: 0 }}
          stacked
          xDataKey="name"
        >
          <PatternLines
            height={8}
            id={hatch}
            orientation={["diagonal"]}
            stroke="var(--chart-1)"
            strokeWidth={2}
            width={8}
          />
          <Grid fadeHorizontal hideHorizontalEdgeLines horizontal numTicksRows={3} strokeDasharray="0" />
          <ColumnTrack />
          <Bar animate={animate} dataKey="pts" fill="var(--chart-1)" lineCap="butt" />
          <Bar animate={animate} dataKey="proj" fill={`url(#${hatch})`} lineCap="butt" stroke="var(--chart-1)" />
          {avg != null && <AvgRule value={avg} />}
          <ValueLabels />
          <GapLabels />
          <WeekAxis />
          <ChartTooltip
            content={({ point }) => <WeekTip avg={avg} row={point as Row} showSnaps={showSnaps} />}
            showCrosshair={false}
            showDatePill={false}
            showDots={false}
          />
        </BarChart>
      </div>
    </div>
  );
}

function WeekTip({ row, avg, showSnaps }: { row: Row; avg: number | null; showSnaps: boolean }) {
  const v = row.pts || row.proj;
  const title = `Week ${row.w}${row.o ? ` ${row.o}` : ""}`;
  if (!v) {
    return (
      <div className="ll-tip">
        <div className="ll-tip-h">{title}</div>
        <div className="ll-tip-r">
          <div>
            <span>{GAP_LABEL[row.kind] === "Bye" ? "Bye week" : GAP_LABEL[row.kind] === "Next" ? "No projection yet" : "Did not play"}</span>
          </div>
        </div>
      </div>
    );
  }
  const proj = row.kind === "proj";
  const diff = avg != null ? v - avg : null;
  return (
    <div className="ll-tip">
      <div className="ll-tip-h">{title}</div>
      <div className="ll-tip-r">
        <div>
          <span>
            <i className={proj ? "hatch" : ""} />
            {proj ? "Projected" : "Points"}
          </span>
          <b>{n1(v)}</b>
        </div>
        {!proj && showSnaps && row.snap != null && (
          <div>
            <span>Snap share</span>
            <b>{row.snap}%</b>
          </div>
        )}
        {diff != null && (
          <div>
            <span>vs season avg</span>
            <b className={diff >= 0.05 ? "up" : diff <= -0.05 ? "dn" : ""}>
              {diff >= 0 ? "+" : "−"}
              {n1(Math.abs(diff))}
            </b>
          </div>
        )}
      </div>
    </div>
  );
}

