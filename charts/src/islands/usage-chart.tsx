import { curveMonotoneX } from "@visx/curve";
import { Area, AreaChart } from "@/components/charts/area-chart";
import { useChart } from "@/components/charts/chart-context";
import { Grid } from "@/components/charts/grid";
import { ChartTooltip } from "@/components/charts/tooltip";

/** One week as index.html's usageCard() describes it; v is a share in percent. */
export interface UsageWeek {
  w: number;
  /** "vs SF", "at DEN", or "" on a bye */
  o: string;
  v: number | null;
  kind: "played" | "bye" | "out";
}

export interface UsageChartProps {
  weeks: UsageWeek[];
  /** season share in percent */
  avg: number | null;
  /** "Share of team carries", "Target share", … */
  title: string;
  animate?: boolean;
}

// Bklit's area chart runs on dates, so week w sits at day w of a fixed epoch. Only weeks with a
// share are plotted, so the line joins straight across byes and missed games.
const DAY = 86_400_000;
const BASE = Date.UTC(2000, 0, 1);
const at = (w: number) => new Date(BASE + w * DAY);

type Row = UsageWeek & { date: Date; share: number } & Record<string, unknown>;

const pct = (v: number) => `${Math.round(v)}%`;

/* ---------- custom layers (read the chart's own scales) ---------- */

/** x centre and width of week w's column */
function useColumns() {
  const { xScale } = useChart();
  const width = xScale(at(1)) - xScale(at(0));
  return { x: (w: number) => xScale(at(w)), width };
}

/** Faint full-height column behind each week with a share (0% included), as on Points by week. */
function ColumnTrack({ weeks }: { weeks: UsageWeek[] }) {
  const { innerHeight } = useChart();
  const { x, width } = useColumns();
  const bw = width * 0.82;
  return (
    <g aria-hidden="true">
      {weeks.filter((d) => d.v != null).map((d) => (
        <rect fill="var(--chart-1)" height={innerHeight} key={d.w} opacity={0.07} width={bw} x={x(d.w) - bw / 2} y={0} />
      ))}
    </g>
  );
}

/** "Bye" / "Out" under weeks with no share. The line runs straight through them: no dot, no column. */
function GapLabels({ weeks }: { weeks: UsageWeek[] }) {
  const { innerHeight } = useChart();
  const { x } = useColumns();
  return (
    <g aria-hidden="true">
      {weeks
        // a game played with no share to show (a QB with 0 total points) gets no label: he wasn't out
        .filter((d) => d.v == null && d.kind !== "played")
        .map((d) => (
          <text className="ll-gap" fill="var(--chart-label)" key={d.w} textAnchor="middle" x={x(d.w)} y={innerHeight - 10}>
            {d.kind === "bye" ? "Bye" : "Out"}
          </text>
        ))}
    </g>
  );
}
GapLabels.__isPostOverlay = true;

function AvgRule({ value }: { value: number }) {
  const { yScale, innerWidth } = useChart();
  const y = yScale(value);
  return (
    <line aria-hidden="true" stroke="var(--wka, var(--chart-1))" strokeDasharray="5 4" strokeWidth={2} x1={0} x2={innerWidth} y1={y} y2={y} />
  );
}
AvgRule.__isPostOverlay = true;

/** Share above the high and latest weeks. */
function PointLabels({ rows, only }: { rows: Row[]; only: Set<number> }) {
  const { yScale } = useChart();
  const { x } = useColumns();
  return (
    <g aria-hidden="true">
      {rows
        .filter((d) => only.has(d.w))
        .map((d) => (
          <text className="ll-val" fill="var(--chart-foreground)" key={d.w} textAnchor="middle" x={x(d.w)} y={yScale(d.share) - 12}>
            {pct(d.share)}
          </text>
        ))}
    </g>
  );
}
PointLabels.__isPostOverlay = true;

function WeekAxis({ weeks }: { weeks: UsageWeek[] }) {
  const { innerHeight } = useChart();
  const { x } = useColumns();
  return (
    <g aria-hidden="true">
      {weeks.map((d) => (
        <g className="ll-axis" key={d.w}>
          <text className="ll-wk" textAnchor="middle" x={x(d.w)} y={innerHeight + 20}>
            Wk {d.w}
          </text>
          <text className="ll-opp" textAnchor="middle" x={x(d.w)} y={innerHeight + 38}>
            {d.o || "Bye"}
          </text>
        </g>
      ))}
    </g>
  );
}
WeekAxis.__isPostOverlay = true;

/* ---------- the chart ---------- */

export function UsageChart({ weeks, avg, title, animate = true }: UsageChartProps) {
  const rows: Row[] = weeks
    .filter((x) => x.v != null)
    .map((x) => ({ ...x, date: at(x.w), share: x.v as number }));
  if (rows.length < 2) return null;
  const hi = rows.reduce((a, b) => (b.share > a.share ? b : a));
  const last = rows[rows.length - 1];
  const n = weeks.length;

  return (
    <div className="ll-wk-scroll">
      <div className="ll-wk-inner" style={{ minWidth: `calc(${n} * var(--ll-col, 64px))` }}>
        <AreaChart
          animationDuration={animate ? 1100 : 0}
          aspectRatio="auto"
          className="ll-us-chart"
          data={rows}
          margin={{ top: 30, right: 0, bottom: 46, left: 0 }}
          xDataKey="date"
          xDomain={[at(weeks[0].w - 0.5), at(weeks[n - 1].w + 0.5)]}
        >
          <Grid fadeHorizontal hideHorizontalEdgeLines horizontal numTicksRows={2} strokeDasharray="0" />
          <ColumnTrack weeks={weeks} />
          <Area
            animate={animate}
            curve={curveMonotoneX}
            dataKey="share"
            fill="var(--chart-1)"
            fillOpacity={0.3}
            markers={{ fill: "var(--chart-background)", radius: 4, ringGap: 0, stroke: "var(--chart-1)", strokeWidth: 2.5 }}
            showHighlight={false}
            showMarkers
            stroke="var(--chart-1)"
            strokeWidth={2.5}
          />
          <GapLabels weeks={weeks} />
          {avg != null && <AvgRule value={avg} />}
          <PointLabels only={new Set([hi.w, last.w])} rows={rows} />
          <WeekAxis weeks={weeks} />
          <ChartTooltip
            content={({ point }) => <UsageTip avg={avg} row={point as Row} title={title} />}
            showDatePill={false}
          />
        </AreaChart>
      </div>
    </div>
  );
}

function UsageTip({ row, avg, title }: { row: Row; avg: number | null; title: string }) {
  const diff = avg != null ? Math.round((row.share - avg) * 10) / 10 : null;
  return (
    <div className="ll-tip">
      <div className="ll-tip-h">{`Week ${row.w}${row.o ? ` ${row.o}` : ""}`}</div>
      <div className="ll-tip-r">
        <div>
          <span>
            <i />
            {title}
          </span>
          <b>{row.share.toFixed(1)}%</b>
        </div>
        {diff != null && (
          <div>
            <span>vs season</span>
            <b className={diff > 0 ? "up" : diff < 0 ? "dn" : ""}>
              {diff >= 0 ? "+" : "−"}
              {Math.abs(diff).toFixed(1)} pts
            </b>
          </div>
        )}
      </div>
    </div>
  );
}
