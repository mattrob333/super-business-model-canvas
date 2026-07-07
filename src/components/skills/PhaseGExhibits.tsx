import type {
  BuildVsBuyPayload,
  LifecyclePayload,
  MoatPayload,
  PositioningPayload,
  SpotCheck,
  SupplyChainPayload,
  UnitEconomicsPayload,
} from "@/components/skills/artifact-payloads";

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



export function MoatAuditExhibit({ moat }: { moat: MoatPayload }) {
  return (
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



export function UnitEconomicsExhibit({ economics }: { economics: UnitEconomicsPayload }) {
  return (
    <section>
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Unit economics frame</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {economics.variables.map((row) => (
          <div key={row.variable} className="rounded-lg border border-slate-200 p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                {UNIT_ECON_LABELS[row.variable] ?? row.variable}
              </p>
              <span
                className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${
                  row.status === "known"
                    ? "bg-emerald-50 text-emerald-700"
                    : row.status === "estimated_from_canvas"
                      ? "bg-amber-50 text-amber-700"
                      : "bg-slate-100 text-slate-500"
                }`}
              >
                {row.status === "known" ? "known" : row.status === "estimated_from_canvas" ? "estimated" : "unknown"}
              </span>
            </div>
            <p className={`mt-2 text-lg font-semibold ${row.value_or_range ? "text-slate-900" : "italic text-slate-400"}`}>
              {row.value_or_range ?? "not yet grounded"}
            </p>
            {row.canvas_quote && (
              <p className="mt-1 text-xs italic text-slate-500">"{row.canvas_quote}"</p>
            )}
            <p className="mt-1.5 text-xs leading-relaxed text-slate-600">{row.basis}</p>
            {row.owner_input_needed && (
              <p className="mt-1.5 rounded bg-amber-50 px-2 py-1 text-xs text-amber-800">
                Needs you: {row.owner_input_needed}
              </p>
            )}
          </div>
        ))}
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

const VERDICT_STYLE: Record<string, { label: string; className: string }> = {
  keep_in_house: { label: "Keep in-house", className: "bg-emerald-50 text-emerald-700" },
  consider_buying: { label: "Consider buying", className: "bg-amber-50 text-amber-700" },
  strong_buy_candidate: { label: "Strong buy candidate", className: "bg-slate-900 text-white" },
};



export function BuildVsBuyExhibit({ buildVsBuy }: { buildVsBuy: BuildVsBuyPayload }) {
  return (
    <ExhibitTable
      title="Build vs buy verdicts"
      headers={["Activity", "Verdict", "Market alternatives", "Rationale and switch"]}
      rows={buildVsBuy.rows.map((row) => {
        const verdict = VERDICT_STYLE[row.verdict] ?? { label: row.verdict, className: "bg-slate-100 text-slate-700" };
        return [
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





