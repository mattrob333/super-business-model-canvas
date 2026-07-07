import type {
  CostBenchmarkPayload,
  EfficiencyScanPayload,
  SinglePointScanPayload,
  TalentRadarPayload,
} from "@/components/skills/goal-payloads-resilience";

/**
 * Bespoke document exhibits for the resilience/cost artifacts — each payload
 * renders as the consulting deliverable it is (risk register, hiring radar
 * cards, archetype benchmark table, vendor shortlist) instead of generic
 * markdown. Parsers live in goal-payloads-resilience.ts and are defensive: a
 * payload that fails its contract renders nothing and the markdown body
 * still carries the content.
 */


// ---------------------------------------------------------------------------
// vault.single_point_scan — risk register
// ---------------------------------------------------------------------------

const RISK_CLASS_LABELS: Record<string, string> = {
  key_person: "Key person",
  single_supplier: "Single supplier",
  platform_dependency: "Platform dependency",
  concentration: "Concentration",
};



export function SinglePointScanExhibit({ scan }: { scan: SinglePointScanPayload }) {
  return (
    <ExhibitTable
      title="Single-point-of-failure register"
      headers={["Resource", "Risk class", "Severity", "Exposure", "Mitigation first step"]}
      rows={scan.risks.map((risk) => ({
        className: Math.round(risk.severity) >= 4 ? "bg-amber-50/60" : undefined,
        cells: [
          <strong key="item" className="text-slate-900">{risk.item}</strong>,
          <span key="class" className="inline-flex whitespace-nowrap rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
            {RISK_CLASS_LABELS[risk.risk_class] ?? risk.risk_class}
          </span>,
          <SeverityMeter key="severity" value={risk.severity} />,
          risk.exposure || <span key="exposure" className="italic text-slate-400">not stated</span>,
          risk.mitigation_first_step || <span key="mitigation" className="italic text-slate-400">not stated</span>,
        ],
      }))}
    />
  );
}

function SeverityMeter({ value }: { value: number }) {
  const score = Math.min(5, Math.max(1, Math.round(value)));
  return (
    <span className="inline-flex items-center gap-1" title={`${score}/5 severity`}>
      {Array.from({ length: 5 }, (_, index) => (
        <span
          key={index}
          className={`h-2 w-2 rounded-full ${index < score ? (score >= 4 ? "bg-amber-600" : "bg-slate-800") : "bg-slate-200"}`}
        />
      ))}
      <span className="ml-1 text-xs font-semibold text-slate-700">{score}/5</span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// vault.talent_radar — per-competitor hiring-signal cards
// ---------------------------------------------------------------------------

const TALENT_FUNCTION_LABELS: Record<string, string> = {
  engineering: "Engineering",
  sales: "Sales",
  marketing: "Marketing",
  product: "Product",
  data: "Data",
  ai: "AI",
  operations: "Operations",
  customer_success: "Customer success",
  design: "Design",
  other: "Other",
};



export function TalentRadarExhibit({ radar }: { radar: TalentRadarPayload }) {
  return (
    <section>
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Talent radar — competitor hiring signals</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {radar.reads.map((read) => (
          <div key={read.competitor} className="rounded-lg border border-slate-200 p-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-slate-900">{read.competitor}</h3>
              <span
                className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                  read.read === "hiring_observed" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"
                }`}
              >
                {read.read === "hiring_observed" ? "Hiring observed" : "Evidence thin"}
              </span>
            </div>
            {read.read === "hiring_observed" && read.signals.length > 0 ? (
              <ul className="mt-2 space-y-2">
                {read.signals.map((signal) => (
                  <li key={`${signal.function}:${signal.signal}`}>
                    <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-700">
                      {TALENT_FUNCTION_LABELS[signal.function] ?? signal.function}
                    </span>
                    <p className="mt-1 text-sm leading-relaxed text-slate-700">{signal.signal}</p>
                    {signal.evidence_quote && (
                      <p className="mt-0.5 text-xs italic text-slate-500">"{signal.evidence_quote}"</p>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm italic text-slate-400">
                No hiring evidence surfaced for this competitor — not read as a pattern.
              </p>
            )}
            {read.next_move && (
              <p className="mt-2 border-t border-slate-200/70 pt-2 text-sm text-slate-700">
                <span className="font-semibold">
                  {read.read === "hiring_observed" ? "Inferred next move:" : "Honest read:"}
                </span>{" "}
                {read.next_move}
              </p>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// ledger.cost_benchmark — you vs the archetype norm
// ---------------------------------------------------------------------------

const COST_CATEGORY_LABELS: Record<string, string> = {
  cogs_or_delivery: "COGS / delivery",
  sales_and_marketing: "Sales & marketing",
  research_and_development: "R&D / product",
  general_and_administrative: "G&A",
  infrastructure_and_operations: "Infrastructure & ops",
};



export function CostBenchmarkExhibit({ benchmark }: { benchmark: CostBenchmarkPayload }) {
  return (
    <>
      <section className="rounded-lg border-l-4 border-l-slate-900 bg-slate-50 px-5 py-4">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Benchmark archetype</h2>
        <p className="mt-1 text-base font-semibold text-slate-900">{benchmark.archetype}</p>
        <p className="mt-1 text-xs text-slate-500">
          Norms below are what is typical for this archetype (model knowledge) — never facts about your company.
          Your side of each row quotes your canvas verbatim or is an honest gap.
        </p>
      </section>
      <ExhibitTable
        title="Cost benchmark — your canvas vs the archetype"
        headers={["Category", "Your cost (from your canvas)", "Archetype norm", "Comparison"]}
        rows={benchmark.rows.map((row) => ({
          cells: [
            <strong key="category" className="whitespace-nowrap text-slate-900">
              {COST_CATEGORY_LABELS[row.category] ?? row.category}
            </strong>,
            row.status === "canvas" ? (
              <span key="own">
                {row.own_read ?? <span className="italic text-slate-400">read not recorded</span>}
                {row.canvas_quote && (
                  <span className="mt-1 block text-xs italic text-slate-500">"{row.canvas_quote}"</span>
                )}
              </span>
            ) : (
              <span key="own">
                <span className="italic text-slate-400">not on your canvas</span>
                {row.owner_input_needed && (
                  <span className="mt-1 block rounded bg-amber-50 px-2 py-1 text-xs text-amber-800">
                    Needs you: {row.owner_input_needed}
                  </span>
                )}
              </span>
            ),
            <span key="norm">
              {row.archetype_norm}
              <span className="mt-0.5 block text-[10px] uppercase tracking-wide text-slate-400">
                typical for your archetype (model knowledge)
              </span>
            </span>,
            row.comparison || <span key="comparison" className="italic text-slate-400">—</span>,
          ],
        }))}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// ledger.efficiency_scan — ranked vendor shortlist
// ---------------------------------------------------------------------------



export function EfficiencyScanExhibit({ scan }: { scan: EfficiencyScanPayload }) {
  return (
    <ExhibitTable
      title="Efficiency scan — vendor shortlist, ranked by expected impact"
      headers={["#", "Cost driver (your canvas)", "Vendor", "Impact", "Expected impact (with evidence)"]}
      rows={scan.rows.map((row, index) => ({
        cells: [
          <span key="rank" className="text-xs font-semibold text-slate-500">{index + 1}</span>,
          <span key="driver" className="italic text-slate-600">"{row.cost_driver}"</span>,
          <strong key="vendor" className="text-slate-900">{row.vendor}</strong>,
          <ImpactPill key="impact" value={row.impact_score} />,
          <span key="impact-why">
            {row.expected_impact || <span className="italic text-slate-400">not stated</span>}
            {row.evidence_quote && (
              <span className="mt-1 block text-xs italic text-slate-500">"{row.evidence_quote}"</span>
            )}
          </span>,
        ],
      }))}
    />
  );
}

function ImpactPill({ value }: { value: number }) {
  const score = Math.min(5, Math.max(1, Math.round(value)));
  return (
    <span className="inline-flex whitespace-nowrap rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
      {score}/5
    </span>
  );
}

// ---------------------------------------------------------------------------
// Shared primitives (mirror PhaseGExhibits' local ones — kept here so the
// exhibits file stands alone; rows carry an optional className so the risk
// register can highlight severe rows)
// ---------------------------------------------------------------------------

function ExhibitTable({
  title,
  headers,
  rows,
}: {
  title: string;
  headers: string[];
  rows: Array<{ cells: Array<React.ReactNode>; className?: string }>;
}) {
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
              <tr key={rowIndex} className={`border-t border-slate-100 align-top ${row.className ?? ""}`}>
                {row.cells.map((cell, cellIndex) => (
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
