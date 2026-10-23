import { useId } from "react";
import { Bar } from "@/components/charts/bar";
import { BarChart } from "@/components/charts/bar-chart";
import { Grid } from "@/components/charts/grid";
import { PatternLines } from "@/components/charts/patterns";
import { ChartTooltip } from "@/components/charts/tooltip";
import { AvgRule, ColumnTrack, Diff, GapLabels, Tip, ValueLabels, WeekAxis } from "./parts";

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
const GAP: Record<string, [label: string, tip: string]> = { bye: ["Bye", "Bye week"], out: ["Out", "Did not play"], upcoming: ["Next", "No projection yet"] };
// test the week type, not the value: a real 0.0 game is still a bar with a label
const scored = (x: Week) => x.kind === "played" || x.kind === "proj";

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
        <BarChart aspectRatio="auto" barGap={0.18} className="ll-wk-chart" data={data} margin={{ top: 26, right: 0, bottom: 46, left: 0 }} stacked xDataKey="name">
          <PatternLines height={8} id={hatch} orientation={["diagonal"]} stroke="var(--chart-1)" strokeWidth={2} width={8} />
          <Grid fadeHorizontal hideHorizontalEdgeLines horizontal numTicksRows={3} strokeDasharray="0" />
          <ColumnTrack weeks={weeks.map((x) => x.w)} />
          <Bar animate={animate} dataKey="pts" fill="var(--chart-1)" lineCap="butt" />
          <Bar animate={animate} dataKey="proj" fill={`url(#${hatch})`} lineCap="butt" stroke="var(--chart-1)" />
          {avg != null && <AvgRule value={avg} />}
          <ValueLabels gap={8} items={data.filter(scored).map((d) => ({ w: d.w, v: d.pts || d.proj, text: n1(d.pts || d.proj), accent: d.kind === "proj" }))} />
          <GapLabels gaps={weeks.filter((x) => GAP[x.kind]).map((x) => ({ w: x.w, label: GAP[x.kind][0], now: x.kind === "upcoming" }))} />
          <WeekAxis weeks={weeks.map((x) => ({ w: x.w, o: x.o, now: x.kind === "proj" || x.kind === "upcoming" }))} />
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
  const title = `Week ${row.w}${row.o ? ` ${row.o}` : ""}`;
  if (!scored(row)) {
    return (
      <Tip title={title}>
        <div>
          <span>{GAP[row.kind][1]}</span>
        </div>
      </Tip>
    );
  }
  const proj = row.kind === "proj";
  const v = proj ? row.proj : row.pts;
  return (
    <Tip title={title}>
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
      {avg != null && (
        <div>
          <span>vs season avg</span>
          <Diff v={v - avg} />
        </div>
      )}
    </Tip>
  );
}
