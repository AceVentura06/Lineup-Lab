import { useEffect, useState } from "react";
import { PieCenter } from "@/components/charts/pie-center";
import { PieChart } from "@/components/charts/pie-chart";
import { PieSlice } from "@/components/charts/pie-slice";

/** One slice as index.html's sharePies() describes it; k is "" for "Everyone else". */
export interface BallSeg {
  k: string;
  name: string;
  pos: string;
  n: number;
  /** CSS colour, the same per player in both donuts */
  c: string;
}

export interface BallPie {
  label: string;
  /** "targets" / "carries" */
  unit: string;
  perGame: number;
  seg: BallSeg[];
}

export interface BallChartProps {
  pies: BallPie[];
}

const OTHER = "_other";
const HOVER = 6;
// donut box is 150px, or 120px on narrow phones (.pie-w in index.html); the hole keeps the ring the same weight
const SMALL = "(max-width: 420px)";
function useBox() {
  const [small, setSmall] = useState(() => matchMedia(SMALL).matches);
  useEffect(() => {
    const m = matchMedia(SMALL);
    const on = () => setSmall(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return small ? 120 : 150;
}
const keyOf = (s: BallSeg, pie: number) => s.k || `${OTHER}${pie}`;

/**
 * "Who gets the ball": a Bklit donut per stat. Hovering (or tapping) a slice or a legend
 * row picks out that player in both donuts, so a back's carry and target shares line up.
 */
export function BallChart({ pies }: BallChartProps) {
  const [hot, setHot] = useState<string | null>(null);
  const inner = (useBox() / 2 - HOVER) * 0.72;
  return (
    <div className="ll-pies">
      {pies.map((pie, pi) => {
        const total = pie.seg.reduce((a, s) => a + s.n, 0);
        if (!total) return null;
        const pct = (s: BallSeg) => Math.round((100 * s.n) / total);
        const idx = pie.seg.findIndex((s) => keyOf(s, pi) === hot);
        return (
          <figure className="pie" key={pie.label}>
            <figcaption>{pie.label}</figcaption>
            <div aria-label={`${pie.label}: ${pie.seg.map((s) => `${s.name} ${pct(s)}%`).join(", ")}`} className="pie-w" role="img">
              <PieChart
                data={pie.seg.map((s) => ({ color: s.c, label: s.name, value: s.n }))}
                hoveredIndex={idx >= 0 ? idx : null}
                hoverOffset={HOVER}
                innerRadius={inner}
                onHoverChange={(i) => setHot(i == null ? null : keyOf(pie.seg[i], pi))}
                padAngle={0.02}
              >
                {pie.seg.map((s, i) => (
                  <PieSlice hoverEffect="translate" index={i} key={keyOf(s, pi)} showGlow={false} />
                ))}
                <PieCenter>
                  {({ isHovered, data }) =>
                    isHovered ? (
                      <div className="pie-c">
                        <b>{Math.round((100 * data.value) / total)}%</b>
                        <span>{data.label}</span>
                      </div>
                    ) : (
                      <div className="pie-c">
                        <b>{pie.perGame.toFixed(1)}</b>
                        <span>{pie.unit}/game</span>
                      </div>
                    )
                  }
                </PieCenter>
              </PieChart>
            </div>
            <ul className="pie-leg">
              {pie.seg.map((s) => {
                const k = keyOf(s, pi);
                return (
                  <li
                    key={k}
                    onPointerEnter={(e) => e.pointerType === "mouse" && setHot(k)}
                    onPointerLeave={(e) => e.pointerType === "mouse" && setHot(null)}
                    style={{ opacity: hot == null || hot === k ? 1 : 0.4 }}
                  >
                    <i style={{ background: s.c }} />
                    {/* .plink opens the player page through index.html's own click handler */}
                    {s.k ? (
                      <button className="plink" data-k={s.k} type="button">
                        {s.name}
                      </button>
                    ) : (
                      <span className="muted">{s.name}</span>
                    )}
                    <span className="muted pie-pos">{s.pos}</span>
                    <b className="num">{pct(s)}%</b>
                  </li>
                );
              })}
            </ul>
          </figure>
        );
      })}
    </div>
  );
}
