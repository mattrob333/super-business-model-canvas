import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TooltipProps } from "recharts";

/**
 * Exhibit chart primitives for the artifact paper (spec 13). Components only —
 * payload parsing stays in the payload modules. Everything renders on the
 * always-light white sheet (spec 11 R3), so there is one palette, validated
 * with the dataviz skill's validator against #ffffff (2026-07-08):
 * categorical #2a78d6/#1baf7a/#eda100/#4a3aa7/#e34948 — ALL PASS (worst
 * adjacent CVD ΔE 47.2); verdict trio #008300/#eda100/#4a3aa7 — ALL PASS
 * (ΔE 24.2). Yellow and aqua sit below 3:1 on white, so every mark in those
 * hues ships beside a visible label or keyed table (the relief rule).
 * Honesty invariant: an unknown renders as an empty track or an explicit
 * label — never as a zero-length bar pretending to be a measurement.
 */

export type ExhibitTone =
  | "blue"
  | "aqua"
  | "yellow"
  | "violet"
  | "red"
  | "green"
  | "good"
  | "warning"
  | "serious"
  | "critical"
  | "neutral";

const TONE_HEX: Record<ExhibitTone, string> = {
  blue: "#2a78d6",
  aqua: "#1baf7a",
  yellow: "#eda100",
  violet: "#4a3aa7",
  red: "#e34948",
  green: "#008300",
  good: "#0ca30c",
  warning: "#fab219",
  serious: "#ec835a",
  critical: "#d03b3b",
  neutral: "#cbd5e1",
};

const CHIP_CLASS: Record<ExhibitTone, string> = {
  blue: "bg-blue-50 text-blue-700",
  aqua: "bg-teal-50 text-teal-700",
  yellow: "bg-amber-50 text-amber-700",
  violet: "bg-violet-100 text-violet-800",
  red: "bg-red-50 text-red-700",
  green: "bg-emerald-50 text-emerald-800",
  good: "bg-emerald-50 text-emerald-700",
  warning: "bg-amber-50 text-amber-700",
  serious: "bg-orange-50 text-orange-700",
  critical: "bg-red-50 text-red-700",
  neutral: "bg-slate-100 text-slate-500",
};

const INK_SECONDARY = "#52514e";
const AXIS_BASELINE = "#c3c2b7";
const GRID_HAIRLINE = "#e1e0d9";
const QUADRANT_WASH = "#f8fafc";

interface TipDatum {
  tipTitle?: string;
  tipLines?: string[];
}

/** Minimal hover layer shared by the plotted forms — every value it shows is
 * also direct-labeled or in a keyed table, so nothing lives only in hover. */
function ExhibitTooltip({ active, payload }: TooltipProps<number, string>) {
  if (!active || !payload || payload.length === 0) return null;
  const datum = payload[0].payload as TipDatum;
  if (!datum.tipTitle) return null;
  return (
    <div className="max-w-[260px] rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs shadow-sm">
      <p className="font-semibold text-slate-900">{datum.tipTitle}</p>
      {(datum.tipLines ?? []).map((line) => (
        <p key={line} className="mt-0.5 leading-relaxed text-slate-600">{line}</p>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// P2 — MeterBar: horizontal score comparison (the workhorse for *_score 1–5)
// ---------------------------------------------------------------------------

export function MeterBar({
  value,
  max = 5,
  tone = "blue",
  unknownText = "unknown — not scored",
}: {
  /** null renders the honest empty state, never a zero-length bar. */
  value: number | null;
  max?: number;
  tone?: ExhibitTone;
  unknownText?: string;
}) {
  if (value === null) {
    return (
      <span className="flex items-center gap-2">
        <span className="h-2 min-w-[64px] flex-1 rounded-[4px] border border-dashed border-slate-300 bg-transparent" />
        <span className="shrink-0 text-xs italic text-slate-400">{unknownText}</span>
      </span>
    );
  }
  const clamped = Math.min(max, Math.max(0, value));
  return (
    <span className="flex items-center gap-2" title={`${clamped}/${max}`}>
      <span className="h-2 min-w-[64px] flex-1 overflow-hidden rounded-[4px] bg-slate-200/70">
        <span
          className="block h-full rounded-r-[4px]"
          style={{ width: `${(clamped / max) * 100}%`, backgroundColor: TONE_HEX[tone] }}
        />
      </span>
      <span className="shrink-0 text-xs font-semibold tabular-nums text-slate-700">
        {clamped}/{max}
      </span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// P1 — KPI stat row (+ ArcGauge): the "not a chart" answer for headline values
// ---------------------------------------------------------------------------

/** Small semicircle gauge encoding a discrete state ladder (e.g. unknown /
 * estimated / known) — never a fabricated magnitude. Level 0 draws no arc. */
export function ArcGauge({
  level,
  of,
  tone,
  title,
}: {
  level: number;
  of: number;
  tone: ExhibitTone;
  title: string;
}) {
  const fraction = of > 0 ? Math.min(1, Math.max(0, level / of)) : 0;
  const arcLength = Math.PI * 26;
  return (
    <svg width={64} height={38} viewBox="0 0 64 38" role="img" aria-label={title} className="shrink-0">
      <title>{title}</title>
      <path
        d="M 6 32 A 26 26 0 0 1 58 32"
        fill="none"
        stroke="#e2e8f0"
        strokeWidth={7}
        strokeLinecap="round"
      />
      {fraction > 0 && (
        <path
          d="M 6 32 A 26 26 0 0 1 58 32"
          fill="none"
          stroke={TONE_HEX[tone]}
          strokeWidth={7}
          strokeLinecap="round"
          strokeDasharray={`${fraction * arcLength} ${arcLength}`}
        />
      )}
    </svg>
  );
}

export interface KpiTile {
  label: string;
  /** null renders emptyText in the honest italic empty style. */
  value: string | null;
  emptyText?: string;
  chip?: { label: string; tone: ExhibitTone };
  gauge?: { level: number; of: number; tone: ExhibitTone; title: string };
  quote?: string | null;
  note?: string;
  alert?: string | null;
}

export function KpiStatRow({ tiles }: { tiles: KpiTile[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {tiles.map((tile) => (
        <div
          key={tile.label}
          className="rounded-lg border border-slate-200 p-4"
          style={{ breakInside: "avoid" }}
        >
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{tile.label}</p>
            {tile.chip && (
              <span
                className={`inline-flex shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${CHIP_CLASS[tile.chip.tone]}`}
              >
                {tile.chip.label}
              </span>
            )}
          </div>
          <div className="mt-2 flex items-end justify-between gap-3">
            <p
              className={`min-w-0 text-lg font-semibold leading-tight ${
                tile.value ? "text-slate-900" : "italic text-slate-400"
              }`}
            >
              {tile.value ?? tile.emptyText ?? "unknown"}
            </p>
            {tile.gauge && <ArcGauge {...tile.gauge} />}
          </div>
          {tile.quote && <p className="mt-1 text-xs italic text-slate-500">"{tile.quote}"</p>}
          {tile.note && <p className="mt-1.5 text-xs leading-relaxed text-slate-600">{tile.note}</p>}
          {tile.alert && (
            <p className="mt-1.5 rounded bg-amber-50 px-2 py-1 text-xs text-amber-800">{tile.alert}</p>
          )}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// P5 — DistributionStrip: proportion strip with 2px gaps + count legend
// ---------------------------------------------------------------------------

export interface DistributionSegment {
  label: string;
  count: number;
  tone: ExhibitTone;
}

export function DistributionStrip({
  segments,
  caption,
}: {
  segments: DistributionSegment[];
  caption?: string;
}) {
  const total = segments.reduce((sum, segment) => sum + segment.count, 0);
  return (
    <div style={{ breakInside: "avoid" }}>
      {total > 0 ? (
        <div className="flex h-2.5 w-full gap-[2px]">
          {segments
            .filter((segment) => segment.count > 0)
            .map((segment) => (
              <div
                key={segment.label}
                className="rounded-[3px]"
                style={{ flexGrow: segment.count, backgroundColor: TONE_HEX[segment.tone] }}
                title={`${segment.label}: ${segment.count}`}
              />
            ))}
        </div>
      ) : (
        <p className="text-xs italic text-slate-400">nothing to plot</p>
      )}
      <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
        {segments.map((segment) => (
          <span key={segment.label} className="inline-flex items-center gap-1.5">
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: TONE_HEX[segment.tone] }}
            />
            {segment.label} · <span className="font-semibold tabular-nums">{segment.count}</span>
          </span>
        ))}
      </div>
      {caption && <p className="mt-1 text-xs leading-relaxed text-slate-400">{caption}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// P3 — RadarProfile: single-series spider over fixed axes
// ---------------------------------------------------------------------------

export interface RadarAxisDatum {
  axis: string;
  value: number;
  detail?: string;
}

interface RadarDotRenderProps {
  cx?: number;
  cy?: number;
  index?: number;
}

function renderRadarDot(props: RadarDotRenderProps) {
  const { cx = 0, cy = 0, index = 0 } = props;
  return (
    <circle
      key={`radar-dot-${index}`}
      cx={cx}
      cy={cy}
      r={3.5}
      fill={TONE_HEX.blue}
      stroke="#ffffff"
      strokeWidth={2}
    />
  );
}

export function RadarProfile({
  axes,
  max = 5,
  height = 260,
  caption,
}: {
  axes: RadarAxisDatum[];
  max?: number;
  height?: number;
  caption?: string;
}) {
  const data = axes.map((entry) => ({
    ...entry,
    tipTitle: entry.axis,
    tipLines: [`${entry.value}/${max}`, ...(entry.detail ? [entry.detail] : [])],
  }));
  return (
    <figure className="m-0" style={{ breakInside: "avoid" }}>
      <ResponsiveContainer width="100%" height={height} initialDimension={{ width: 640, height }}>
        <RadarChart data={data} cx="50%" cy="50%" outerRadius="72%" margin={{ top: 10, right: 28, bottom: 6, left: 28 }}>
          <PolarGrid stroke={GRID_HAIRLINE} />
          <PolarAngleAxis dataKey="axis" tick={{ fontSize: 11, fill: INK_SECONDARY }} />
          <PolarRadiusAxis domain={[0, max]} tickCount={max + 1} tick={false} axisLine={false} />
          <Radar
            dataKey="value"
            stroke={TONE_HEX.blue}
            strokeWidth={2}
            fill={TONE_HEX.blue}
            fillOpacity={0.12}
            dot={renderRadarDot}
            isAnimationActive={false}
          />
          <Tooltip content={<ExhibitTooltip />} cursor={false} />
        </RadarChart>
      </ResponsiveContainer>
      {caption && (
        <figcaption className="mt-1 text-xs leading-relaxed text-slate-400">{caption}</figcaption>
      )}
    </figure>
  );
}

// ---------------------------------------------------------------------------
// P4 — QuadrantMatrix: numbered 2x2 positioning matrix keyed to a table
// ---------------------------------------------------------------------------

export interface QuadrantMatrixPoint {
  /** The medallion number shown in the dot — key it to a table row. */
  index: number;
  label: string;
  /** 0..1 plot coordinates (derivation documented by the calling exhibit). */
  x: number;
  y: number;
  tone: ExhibitTone;
  detail?: string;
}

interface QuadrantShapeProps {
  cx?: number;
  cy?: number;
  payload?: { dotColor?: string; index?: number };
}

function renderQuadrantDot(props: QuadrantShapeProps) {
  const { cx = 0, cy = 0, payload } = props;
  if (!payload || !payload.dotColor) return <g />;
  return (
    <g>
      <circle cx={cx} cy={cy} r={10} fill={payload.dotColor} stroke="#ffffff" strokeWidth={2} />
      <text x={cx} y={cy + 3.5} textAnchor="middle" fontSize={10} fontWeight={600} fill="#ffffff">
        {payload.index}
      </text>
    </g>
  );
}

function quadrantLabel(value: string, position: "insideTopLeft" | "insideTopRight" | "insideBottomLeft" | "insideBottomRight") {
  return { value, position, fill: "#94a3b8", fontSize: 10, fontWeight: 600 };
}

export function QuadrantMatrix({
  points,
  xLow,
  xHigh,
  yLow,
  yHigh,
  labels,
  height = 290,
  caption,
}: {
  points: QuadrantMatrixPoint[];
  /** Axis direction captions — rendered as HTML for print reliability. */
  xLow: string;
  xHigh: string;
  yLow: string;
  yHigh: string;
  labels: { tl: string; tr: string; bl: string; br: string };
  height?: number;
  caption?: string;
}) {
  const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
  const data = points.map((point) => ({
    x: clamp01(point.x),
    y: clamp01(point.y),
    index: point.index,
    dotColor: TONE_HEX[point.tone],
    tipTitle: `${point.index}. ${point.label}`,
    tipLines: point.detail ? [point.detail] : [],
  }));
  return (
    <figure className="m-0" style={{ breakInside: "avoid" }}>
      <div className="flex gap-2">
        <div className="flex w-24 shrink-0 flex-col justify-between py-4 text-right text-[10px] leading-tight text-slate-500">
          <span>{yHigh}</span>
          <span>{yLow}</span>
        </div>
        <div className="min-w-0 flex-1">
          <ResponsiveContainer width="100%" height={height} initialDimension={{ width: 560, height }}>
            <ScatterChart margin={{ top: 6, right: 8, bottom: 6, left: 8 }}>
              <XAxis type="number" dataKey="x" domain={[0, 1]} hide />
              <YAxis type="number" dataKey="y" domain={[0, 1]} hide />
              <ReferenceArea x1={0} x2={1} y1={0} y2={1} fill="none" stroke={GRID_HAIRLINE} />
              <ReferenceArea x1={0} x2={0.5} y1={0.5} y2={1} fill={QUADRANT_WASH} fillOpacity={1} stroke="none" label={quadrantLabel(labels.tl, "insideTopLeft")} />
              <ReferenceArea x1={0.5} x2={1} y1={0.5} y2={1} fill="#ffffff" fillOpacity={0} stroke="none" label={quadrantLabel(labels.tr, "insideTopRight")} />
              <ReferenceArea x1={0} x2={0.5} y1={0} y2={0.5} fill="#ffffff" fillOpacity={0} stroke="none" label={quadrantLabel(labels.bl, "insideBottomLeft")} />
              <ReferenceArea x1={0.5} x2={1} y1={0} y2={0.5} fill={QUADRANT_WASH} fillOpacity={1} stroke="none" label={quadrantLabel(labels.br, "insideBottomRight")} />
              <ReferenceLine x={0.5} stroke={AXIS_BASELINE} strokeDasharray="4 4" />
              <ReferenceLine y={0.5} stroke={AXIS_BASELINE} strokeDasharray="4 4" />
              <Scatter data={data} shape={renderQuadrantDot} isAnimationActive={false} />
              <Tooltip content={<ExhibitTooltip />} cursor={false} />
            </ScatterChart>
          </ResponsiveContainer>
          <div className="flex justify-between px-1 text-[10px] text-slate-500">
            <span>← {xLow}</span>
            <span>{xHigh} →</span>
          </div>
        </div>
      </div>
      {caption && (
        <figcaption className="mt-1 text-xs leading-relaxed text-slate-400">{caption}</figcaption>
      )}
    </figure>
  );
}

// ---------------------------------------------------------------------------
// IndexMedallion: the numbered key linking table rows to matrix dots — the
// identity channel is the number, so the link is never color-alone.
// ---------------------------------------------------------------------------

export function IndexMedallion({ index, tone }: { index: number; tone: ExhibitTone }) {
  return (
    <span
      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white"
      style={{ backgroundColor: tone === "neutral" ? "#64748b" : TONE_HEX[tone] }}
    >
      {index}
    </span>
  );
}
