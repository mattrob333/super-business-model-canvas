import type {
  BuildVsBuyPayload,
  LifecyclePayload,
  MoatPayload,
  PositioningPayload,
  SpotCheck,
  SupplyChainPayload,
  UnitEconomicsPayload,
} from "@/components/skills/artifact-payloads";
import {
  DistributionStrip,
  IndexMedallion,
  KpiStatRow,
  MeterBar,
  QuadrantMatrix,
  RadarProfile,
} from "@/components/skills/exhibit-charts";
import type { ExhibitTone, KpiTile, QuadrantMatrixPoint } from "@/components/skills/exhibit-charts";

/**
 * Bespoke document exhibits for the Phase G artifacts — each payload renders
 * as the consulting deliverable it is (matrix, statement block, variable
 * cards, stage grid, verdict table) instead of generic markdown. Parsers are
 * defensive: a payload that fails its contract renders nothing and the
 * markdown body still carries the content.
 */


// ---------------------------------------------------------------------------
// vault.moat_audit — durability matrix
// ---------------------------------------------------------------------------

const MOAT_LABELS: Record<string, string> = {
  network_effects: "Network effects",
  switching_costs: "Switching costs",
  proprietary_data_or_tech: "Proprietary data / tech",
  brand: "Brand",
  scale_or_cost: "Scale / cost",
  distribution_lock: "Distribution lock",
  none: "No moat",
};



/** Radar axes: the six real moat classes, always all shown — an axis at 0 is
 * the finding (an undefended flank), not missing data. */
const MOAT_CLASS_AXES: Array<{ key: string; label: string }> = [
  { key: "network_effects", label: "Network" },
  { key: "switching_costs", label: "Switching" },
  { key: "proprietary_data_or_tech", label: "Data / tech" },
  { key: "brand", label: "Brand" },
  { key: "scale_or_cost", label: "Scale / cost" },
  { key: "distribution_lock", label: "Distribution" },
];

function clampScore(value: number): number {
  return Math.min(5, Math.max(1, Math.round(value)));
}

export function MoatAuditExhibit({ moat }: { moat: MoatPayload }) {
  const scored = moat.rows.filter((row) => row.moat_class !== "none");
  const axes = MOAT_CLASS_AXES.map(({ key, label }) => {
    const classRows = scored.filter((row) => row.moat_class === key);
    const strongest = classRows.length > 0 ? Math.max(...classRows.map((row) => clampScore(row.durability))) : 0;
    return {
      axis: label,
      value: strongest,
      detail:
        classRows.length > 0
          ? `${classRows.length} resource${classRows.length === 1 ? "" : "s"} in this class`
          : "no resource claimed in this class",
    };
  });
  const undefended = axes.filter((axis) => axis.value === 0).map((axis) => axis.axis);
  const ranked = [...moat.rows].sort((a, b) => clampScore(b.durability) - clampScore(a.durability));
  return (
    <>
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Moat profile</h2>
        <p className="mt-1 text-xs text-slate-400">
          Durability by moat class — each axis shows the strongest scored resource in that class (1–5).
        </p>
        <div className="mt-3 grid gap-5 sm:grid-cols-[minmax(0,5fr)_minmax(0,4fr)]">
          <RadarProfile
            axes={axes}
            max={5}
            caption={
              undefended.length > 0
                ? `Undefended flanks — no resource claimed: ${undefended.join(", ")}.`
                : "Every moat class carries at least one claimed resource."
            }
          />
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Durability by resource</p>
            <ul className="mt-2 space-y-2.5">
              {ranked.map((row) => (
                <li key={row.resource}>
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="truncate text-sm font-medium text-slate-800">{row.resource}</p>
                    <p className="shrink-0 text-[10px] uppercase tracking-wide text-slate-400">
                      {MOAT_LABELS[row.moat_class] ?? row.moat_class}
                    </p>
                  </div>
                  <MeterBar
                    value={row.moat_class === "none" ? null : clampScore(row.durability)}
                    max={5}
                    tone="blue"
                    unknownText="no moat — not scored"
                  />
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>
      <ExhibitTable
        title="Moat durability matrix"
        headers={["Resource", "Moat class", "Durability", "Basis"]}
        rows={moat.rows.map((row) => [
          <strong key="resource" className="text-slate-900">{row.resource}</strong>,
          <span
            key="class"
            className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
              row.moat_class === "none" ? "bg-slate-100 italic text-slate-500" : "bg-slate-900 text-white"
            }`}
          >
            {MOAT_LABELS[row.moat_class] ?? row.moat_class}
          </span>,
          <DurabilityMeter key="durability" value={row.durability} />,
          row.basis || "—",
        ])}
      />
    </>
  );
}

function DurabilityMeter({ value }: { value: number }) {
  const score = Math.min(5, Math.max(1, Math.round(value)));
  return (
    <span className="inline-flex items-center gap-1" title={`${score}/5 durability`}>
      {Array.from({ length: 5 }, (_, index) => (
        <span
          key={index}
          className={`h-2 w-2 rounded-full ${index < score ? "bg-slate-800" : "bg-slate-200"}`}
        />
      ))}
      <span className="ml-1 text-xs font-semibold text-slate-700">{score}/5</span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// forge.positioning_brief — statement block + grounded pillars
// ---------------------------------------------------------------------------



export function PositioningBriefExhibit({ positioning }: { positioning: PositioningPayload }) {
  const { statement } = positioning;
  return (
    <>
      <section className="rounded-lg border-l-4 border-l-slate-900 bg-slate-50 px-5 py-4">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Positioning statement</h2>
        <p className="mt-2 text-base leading-relaxed text-slate-800">
          For <strong>{statement.for_segment}</strong> who <strong>{statement.who_need}</strong>,
          we are the <strong>{statement.category}</strong> that <strong>{statement.key_differentiator}</strong>.
          Unlike <strong>{statement.unlike_alternative}</strong>, {statement.because_proof}.
        </p>
      </section>
      {positioning.pillars.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Message pillars</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {positioning.pillars.map((pillar) => (
              <div key={pillar.pillar} className="rounded-lg border border-slate-200 p-4">
                <p className="text-sm font-semibold text-slate-900">{pillar.pillar}</p>
                {pillar.segment_language && (
                  <p className="mt-1 text-sm italic leading-relaxed text-slate-600">"{pillar.segment_language}"</p>
                )}
                <p className="mt-2 text-xs text-slate-500">
                  Grounded in your canvas: <span className="italic">"{pillar.grounded_in}"</span>
                </p>
              </div>
            ))}
          </div>
        </section>
      )}
      {positioning.tone_notes && (
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Voice and tone</h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-700">{positioning.tone_notes}</p>
        </section>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// ledger.unit_economics_frame — six-variable cards
// ---------------------------------------------------------------------------

const UNIT_ECON_LABELS: Record<string, string> = {
  cac: "CAC",
  acv_or_arpa: "ACV / ARPA",
  gross_margin: "Gross margin",
  retention_or_churn: "Retention / churn",
  payback_months: "Payback (months)",
  ltv: "LTV",
};



/** Gauge levels encode grounding status only (unknown 0 / estimated 1 / known
 * 2 of 2) — the gauge never pretends to measure the variable's magnitude. */
const UNIT_ECON_STATUS: Record<
  UnitEconomicsPayload["variables"][number]["status"],
  { chip: string; tone: ExhibitTone; level: number }
> = {
  known: { chip: "known", tone: "good", level: 2 },
  estimated_from_canvas: { chip: "estimated", tone: "warning", level: 1 },
  unknown: { chip: "unknown", tone: "neutral", level: 0 },
};

export function UnitEconomicsExhibit({ economics }: { economics: UnitEconomicsPayload }) {
  const counts = { known: 0, estimated_from_canvas: 0, unknown: 0 };
  for (const row of economics.variables) counts[row.status] += 1;
  const grounded = counts.known + counts.estimated_from_canvas;
  const tiles: KpiTile[] = economics.variables.map((row) => {
    const meta = UNIT_ECON_STATUS[row.status];
    return {
      label: UNIT_ECON_LABELS[row.variable] ?? row.variable,
      value: row.value_or_range,
      emptyText: "not yet grounded",
      chip: { label: meta.chip, tone: meta.tone },
      gauge: { level: meta.level, of: 2, tone: meta.tone, title: `Grounding: ${meta.chip}` },
      quote: row.canvas_quote,
      note: row.basis,
      alert: row.owner_input_needed ? `Needs you: ${row.owner_input_needed}` : null,
    };
  });
  return (
    <section>
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Unit economics frame</h2>
      <p className="mt-1 text-xs text-slate-400">
        Gauges show how grounded each variable is (known / estimated from canvas / unknown) — values are never invented.
      </p>
      <div className="mt-3">
        <DistributionStrip
          segments={[
            { label: "Known", count: counts.known, tone: "good" },
            { label: "Estimated from canvas", count: counts.estimated_from_canvas, tone: "warning" },
            { label: "Unknown", count: counts.unknown, tone: "neutral" },
          ]}
          caption={`${grounded} of ${economics.variables.length} variables grounded in the canvas.`}
        />
      </div>
      <div className="mt-4">
        <KpiStatRow tiles={tiles} />
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// envoy.supply_chain_map — position + candidates table
// ---------------------------------------------------------------------------



export function SupplyChainExhibit({ supplyChain }: { supplyChain: SupplyChainPayload }) {
  return (
    <>
      {(supplyChain.upstream.length > 0 || supplyChain.downstream.length > 0) && (
        <section className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-slate-200 p-4">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Upstream — who supplies the industry</h2>
            <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-slate-700">
              {(supplyChain.upstream.length > 0 ? supplyChain.upstream : ["unknown — not surfaced by the evidence"]).map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
          <div className="rounded-lg border border-slate-200 p-4">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Downstream — how it reaches customers</h2>
            <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-slate-700">
              {(supplyChain.downstream.length > 0 ? supplyChain.downstream : ["unknown — not surfaced by the evidence"]).map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </section>
      )}
      <ExhibitTable
        title="Partnership candidates"
        headers={["Candidate", "Role", "Fit", "Why (with evidence)"]}
        rows={supplyChain.candidates.map((row) => [
          <strong key="name" className="text-slate-900">{row.name}</strong>,
          <span key="role" className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium capitalize text-slate-700">{row.role}</span>,
          <ScorePill key="fit" value={row.fit_score} />,
          <span key="why">
            {row.rationale}
            {row.evidence_quote && <span className="mt-1 block text-xs italic text-slate-500">"{row.evidence_quote}"</span>}
          </span>,
        ])}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// anchor.lifecycle_map — stage-by-stage grid
// ---------------------------------------------------------------------------



export function LifecycleMapExhibit({ lifecycle }: { lifecycle: LifecyclePayload }) {
  return (
    <section>
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Lifecycle map — you vs the field</h2>
      <div className="mt-3 space-y-3">
        {lifecycle.stages.map((stage) => (
          <div
            key={stage.stage}
            className={`rounded-lg border p-4 ${stage.gap ? "border-amber-300 bg-amber-50/50" : "border-slate-200"}`}
          >
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold capitalize text-slate-900">{stage.stage.replace(/_/g, " ")}</h3>
              {stage.gap && (
                <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800">
                  Gap
                </span>
              )}
            </div>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Your motion</p>
                <p className={`mt-1 text-sm leading-relaxed ${stage.your_motion === "none recorded" ? "italic text-slate-400" : "text-slate-700"}`}>
                  {stage.your_motion}
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Competitor motions</p>
                {stage.competitor_motions.length > 0 ? (
                  <ul className="mt-1 space-y-1 text-sm text-slate-700">
                    {stage.competitor_motions.map((motion) => (
                      <li key={`${motion.competitor}:${motion.motion}`}>
                        <strong>{motion.competitor}:</strong> {motion.motion}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1 text-sm italic text-slate-400">none verified</p>
                )}
              </div>
            </div>
            {stage.recommendation && (
              <p className="mt-2 border-t border-slate-200/70 pt-2 text-sm text-slate-700">
                <span className="font-semibold">Move:</span> {stage.recommendation}
              </p>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// tempo.build_vs_buy — verdict table
// ---------------------------------------------------------------------------

/** Chip families track the validated verdict trio (#008300 / #eda100 /
 * #4a3aa7) so table chips and matrix dots read as the same entity — the hard
 * identity link between dot and row is the shared number, never color alone. */
const VERDICT_STYLE: Record<string, { label: string; className: string; tone: ExhibitTone; y: number }> = {
  keep_in_house: { label: "Keep in-house", className: "bg-emerald-50 text-emerald-800", tone: "green", y: 0.84 },
  consider_buying: { label: "Consider buying", className: "bg-amber-50 text-amber-700", tone: "yellow", y: 0.5 },
  strong_buy_candidate: { label: "Strong buy candidate", className: "bg-violet-100 text-violet-800", tone: "violet", y: 0.16 },
};

/** x = market availability, derived from the count of evidence-backed
 * market alternatives: none surfaced sits left of the midline, 1+ scales
 * rightward. y = the worker's own verdict (strategic disposition) — the
 * derivation is stated on the exhibit, not implied. */
function buildVsBuyPoints(rows: BuildVsBuyPayload["rows"]): QuadrantMatrixPoint[] {
  const collisions = new Map<string, number>();
  return rows.flatMap((row, index) => {
    const verdict = VERDICT_STYLE[row.verdict];
    if (!verdict) return [];
    const alternatives = row.market_alternatives.length;
    const baseX = alternatives === 0 ? 0.16 : Math.min(0.55 + (alternatives - 1) * 0.11, 0.9);
    const key = `${baseX}:${verdict.y}`;
    const seen = collisions.get(key) ?? 0;
    collisions.set(key, seen + 1);
    const shift = seen === 0 ? 0 : (seen % 2 === 1 ? 1 : -1) * Math.ceil(seen / 2) * 0.07;
    const side: [number, number] = alternatives === 0 ? [0.05, 0.45] : [0.55, 0.95];
    const x = Math.min(side[1], Math.max(side[0], baseX + shift));
    return [{
      index: index + 1,
      label: row.activity,
      x,
      y: verdict.y,
      tone: verdict.tone,
      detail: `${verdict.label} — ${alternatives === 0 ? "no market alternative surfaced" : `${alternatives} market alternative${alternatives === 1 ? "" : "s"} surfaced`}`,
    }];
  });
}

export function BuildVsBuyExhibit({ buildVsBuy }: { buildVsBuy: BuildVsBuyPayload }) {
  const points = buildVsBuyPoints(buildVsBuy.rows);
  const unplotted = buildVsBuy.rows.length - points.length;
  const verdictCount = (verdict: string) => buildVsBuy.rows.filter((row) => row.verdict === verdict).length;
  return (
    <>
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Build-vs-buy positioning</h2>
        <p className="mt-1 text-xs text-slate-400">
          Vertical placement is the audit's verdict (strategic disposition); horizontal is market availability —
          how many evidence-backed alternatives were surfaced. Numbers key to the verdict table below.
        </p>
        <div className="mt-3">
          <QuadrantMatrix
            points={points}
            yHigh="Keep in-house (strategic)"
            yLow="Buy candidate"
            xLow="No market alternative surfaced"
            xHigh="Market sells this"
            labels={{
              tl: "Differentiator — keep building",
              tr: "Defensible — market exists",
              bl: "Buy-lean — vendor unnamed",
              br: "Outsource candidates",
            }}
            caption={
              unplotted > 0
                ? `${unplotted} activit${unplotted === 1 ? "y" : "ies"} with an unrecognized verdict appear in the table only.`
                : undefined
            }
          />
        </div>
        <div className="mt-4">
          <DistributionStrip
            segments={[
              { label: "Keep in-house", count: verdictCount("keep_in_house"), tone: "green" },
              { label: "Consider buying", count: verdictCount("consider_buying"), tone: "yellow" },
              { label: "Strong buy candidate", count: verdictCount("strong_buy_candidate"), tone: "violet" },
            ]}
            caption="Verdict mix across audited activities."
          />
        </div>
      </section>
      <ExhibitTable
        title="Build vs buy verdicts"
        headers={["#", "Activity", "Verdict", "Market alternatives", "Rationale and switch"]}
        rows={buildVsBuy.rows.map((row, index) => {
          const verdict = VERDICT_STYLE[row.verdict] ?? { label: row.verdict, className: "bg-slate-100 text-slate-700", tone: "neutral" as ExhibitTone, y: 0 };
          return [
            <IndexMedallion key="index" index={index + 1} tone={verdict.tone} />,
            <strong key="activity" className="text-slate-900">{row.activity}</strong>,
          <span key="verdict" className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${verdict.className}`}>
            {verdict.label}
          </span>,
          row.market_alternatives.length > 0 ? (
            <ul key="alts" className="space-y-1">
              {row.market_alternatives.map((alt) => (
                <li key={alt.name}>
                  <strong>{alt.name}</strong>
                  {alt.evidence_quote && <span className="mt-0.5 block text-xs italic text-slate-500">"{alt.evidence_quote}"</span>}
                </li>
              ))}
            </ul>
          ) : (
            <span key="alts" className="italic text-slate-400">none surfaced</span>
          ),
          <span key="why">
            {row.rationale}
            {row.switching_sketch && (
              <span className="mt-1 block text-xs text-slate-500">
                <span className="font-semibold">Switch:</span> {row.switching_sketch}
              </span>
            )}
          </span>,
        ];
        })}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Shared primitives (mirror ArtifactDocument's local ones — kept here so the
// exhibits file stands alone)
// ---------------------------------------------------------------------------

function ExhibitTable({ title, headers, rows }: { title: string; headers: string[]; rows: Array<Array<React.ReactNode>> }) {
  return (
    <section>
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{title}</h2>
      <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <thead>
            <tr className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              {headers.map((header) => (
                <th key={header} className="px-3 py-2.5 font-semibold">{header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={rowIndex} className="border-t border-slate-100 align-top">
                {row.map((cell, cellIndex) => (
                  <td key={cellIndex} className="px-3 py-2.5 text-slate-700">{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ScorePill({ value }: { value: number }) {
  return (
    <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
      {value}/5
    </span>
  );
}





