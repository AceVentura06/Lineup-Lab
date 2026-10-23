import { curveMonotoneX } from "@visx/curve";
import { LinePath } from "@visx/shape";
import { useState } from "react";
import { Area } from "@/components/charts/area";
import { useChart } from "@/components/charts/chart-context";
import { Grid } from "@/components/charts/grid";
import { Line } from "@/components/charts/line";
import { LineChart } from "@/components/charts/line-chart";
import { ChartTooltip } from "@/components/charts/tooltip";
import { at, Tip, WeekAxis } from "./parts";

/** One graded source, as index.html's accChart() describes it. */
export interface AccSource {
  key: string;
  name: string;
  color: string;
  /** average miss per player for each week in `weeks`; null where the source wasn't graded */
  miss: (number | null)[];
}

export interface AccuracyChartProps {
  weeks: number[];
  sources: AccSource[];
}

/*
 * Bklit always starts the y-axis at 0, and every source misses by 5–6 points, so drawn
 * as-is they'd sit in one flat band. Values are plotted minus `floor` (just under the
 * lowest miss) and the axis labels add it back, which gives the zoom the old chart had.
 */
type Row = { date: Date; w: number } & Record<string, unknown>;

const dim = (c: string, on: boolean) => (on ? c : `color-mix(in srgb, ${c} 22%, transparent)`);

/** Real miss values on the left. */
function YLabels({ floor, ticks, step }: { floor: number; ticks: number[]; step: number }) {
  const { yScale } = useChart();
  return (
    <g aria-hidden="true">
      {ticks.map((t) => (
        <text className="ll-ytick" key={t} textAnchor="start" x={2} y={yScale(t - floor) - 5}>
          {t.toFixed(step < 1 ? 1 : 0)}
        </text>
      ))}
    </g>
  );
}
YLabels.__isPostOverlay = true;

/**
 * A source that wasn't graded every week. Bklit's Line can't skip missing points (it draws
 * them at the top), so these are drawn here with the chart's own scales, in the same style.
 */
function PartialLine({ src, weeks, floor, stroke, width, dots }: { src: AccSource; weeks: number[]; floor: number; stroke: string; width: number; dots: boolean }) {
  const { xScale, yScale } = useChart();
  const pts = weeks.map((w, i) => ({ w, v: src.miss[i] })).filter((p): p is { w: number; v: number } => p.v != null);
  const x = (p: { w: number }) => xScale(at(p.w));
  const y = (p: { v: number }) => yScale(p.v - floor);
  return (
    <g aria-hidden="true">
      {pts.length > 1 && <LinePath curve={curveMonotoneX} data={pts} fill="none" stroke={stroke} strokeLinecap="round" strokeWidth={width} x={x} y={y} />}
      {(dots || pts.length === 1) &&
        pts.map((p) => <circle cx={x(p)} cy={y(p)} fill="var(--chart-background)" key={p.w} r={4} stroke={stroke} strokeWidth={2.5} />)}
    </g>
  );
}

export function AccuracyChart({ weeks, sources }: AccuracyChartProps) {
  const [focus, setFocus] = useState<string | null>(null);
  const all = sources.flatMap((s) => s.miss).filter((v): v is number => v != null);
  if (weeks.length < 2 || !all.length) return null;
  const lo = Math.min(...all);
  const hi = Math.max(...all);
  const floor = Math.floor(lo) - 0.5;
  // gridlines every half point (whole points when the range is wide), inside Bklit's 0..max*1.1 domain
  const step = hi - floor > 3 ? 1 : 0.5;
  const ticks: number[] = [];
  for (let t = Math.ceil(floor / step) * step; t - floor <= (hi - floor) * 1.1; t += step) if (t > floor) ticks.push(t);

  const full = sources.filter((s) => s.miss.every((v) => v != null));
  const partial = sources.filter((s) => !s.miss.every((v) => v != null));
  const rows: Row[] = weeks.map((w, i) => {
    const r: Row = { date: at(w), w };
    for (const s of sources) if (s.miss[i] != null) r[s.key] = (s.miss[i] as number) - floor;
    return r;
  });
  const on = (k: string) => focus == null || focus === k;
  // Ace Lineup Lab is the spotlight: bold, filled, with markers; the rest are thin context lines
  const width = (k: string) => (k === "lab" ? 3.5 : 1.75);
  const lab = full.find((s) => s.key === "lab");

  return (
    <div className="ll-acc">
      <LineChart
        animationDuration={1100}
        aspectRatio="auto"
        className="ll-acc-chart"
        data={rows}
        margin={{ top: 16, right: 0, bottom: 34, left: 0 }}
        xDataKey="date"
        // half a week of room on each side, so edge weeks and the axis labels don't touch the frame
        xDomain={[at(weeks[0] - 0.5), at(weeks[weeks.length - 1] + 0.5)]}
      >
        <Grid fadeHorizontal hideHorizontalEdgeLines horizontal rowTickValues={ticks.map((t) => t - floor)} strokeDasharray="0" />
        {lab && on("lab") && (
          <Area curve={curveMonotoneX} dataKey="lab" fill={lab.color} fillOpacity={0.22} showHighlight={false} showLine={false} />
        )}
        {full.map((s) => (
          <Line
            curve={curveMonotoneX}
            dashArray={s.key === "mod" ? "5,4" : undefined}
            dashFromIndex={s.key === "mod" ? 0 : undefined}
            dataKey={s.key}
            key={s.key}
            markers={{ fill: "var(--chart-background)", radius: 4.5, ringGap: 0, stroke: dim(s.color, on(s.key)), strokeWidth: 2.5 }}
            showHighlight={false}
            showMarkers={s.key === "lab"}
            stroke={dim(s.color, on(s.key))}
            strokeWidth={width(s.key)}
          />
        ))}
        {partial.map((s) => (
          <PartialLine dots={s.key === "lab"} floor={floor} key={s.key} src={s} stroke={dim(s.color, on(s.key))} weeks={weeks} width={width(s.key)} />
        ))}
        <YLabels floor={floor} step={step} ticks={ticks} />
        <WeekAxis weeks={weeks.map((w) => ({ w }))} />
        <ChartTooltip
          content={({ point }) => <AccTip floor={floor} row={point as Row} sources={sources} />}
          showDatePill={false}
          showDots={false}
        />
      </LineChart>
      {/* legend doubles as a filter: hover or tap a source to pick out its line */}
      <div className="ll-acc-legend">
        {sources.map((s) => (
          <button
            aria-pressed={focus === s.key}
            className="ll-acc-key"
            key={s.key}
            onClick={() => setFocus(focus === s.key ? null : s.key)}
            onPointerEnter={(e) => e.pointerType === "mouse" && setFocus(s.key)}
            onPointerLeave={(e) => e.pointerType === "mouse" && setFocus(null)}
            style={{ opacity: on(s.key) ? 1 : 0.45 }}
            type="button"
          >
            <i className={s.key === "mod" ? "dash" : ""} style={{ background: s.color, color: s.color }} />
            {s.name}
          </button>
        ))}
      </div>
    </div>
  );
}

function AccTip({ row, sources, floor }: { row: Row; sources: AccSource[]; floor: number }) {
  const list = sources
    .filter((s) => typeof row[s.key] === "number")
    .map((s) => ({ s, v: (row[s.key] as number) + floor }))
    .sort((a, b) => a.v - b.v);
  return (
    <Tip title={`Week ${row.w} · avg miss`}>
      {list.map(({ s, v }) => (
        <div key={s.key}>
          <span>
            <i style={{ background: s.color }} />
            {s.name}
          </span>
          <b>{v.toFixed(2)}</b>
        </div>
      ))}
    </Tip>
  );
}
