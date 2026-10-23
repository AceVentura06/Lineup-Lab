import { curveMonotoneX } from "@visx/curve";
import { Area, AreaChart } from "@/components/charts/area-chart";
import { Grid } from "@/components/charts/grid";
import { ChartTooltip } from "@/components/charts/tooltip";
import { AvgRule, at, ColumnTrack, Diff, GapLabels, Tip, ValueLabels, WeekAxis } from "./parts";

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

type Row = UsageWeek & { date: Date; share: number } & Record<string, unknown>;

export function UsageChart({ weeks, avg, title, animate = true }: UsageChartProps) {
  // only weeks with a share are plotted, so the line joins straight across byes and missed games
  const rows: Row[] = weeks.filter((x) => x.v != null).map((x) => ({ ...x, date: at(x.w), share: x.v as number }));
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
          {/* a 0% week is a real point: dot and column; a bye or missed game gets neither */}
          <ColumnTrack weeks={rows.map((x) => x.w)} />
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
          {/* a game played with no share to show (a QB with 0 total points) gets no label: he wasn't out */}
          <GapLabels gaps={weeks.filter((x) => x.v == null && x.kind !== "played").map((x) => ({ w: x.w, label: x.kind === "bye" ? "Bye" : "Out" }))} />
          {avg != null && <AvgRule value={avg} />}
          <ValueLabels gap={12} items={[...new Set([hi, last])].map((x) => ({ w: x.w, v: x.share, text: `${Math.round(x.share)}%` }))} />
          <WeekAxis weeks={weeks} />
          <ChartTooltip
            content={({ point }) => {
              const row = point as Row;
              return (
                <Tip title={`Week ${row.w}${row.o ? ` ${row.o}` : ""}`}>
                  <div>
                    <span>
                      <i />
                      {title}
                    </span>
                    <b>{row.share.toFixed(1)}%</b>
                  </div>
                  {avg != null && (
                    <div>
                      <span>vs season</span>
                      <Diff unit=" pts" v={row.share - avg} />
                    </div>
                  )}
                </Tip>
              );
            }}
            showDatePill={false}
          />
        </AreaChart>
      </div>
    </div>
  );
}
