import type {
  AdvocacyEngineScanPayload,
  ChurnSignalAuditPayload,
  EcosystemWatchPayload,
  OperationalBenchmarkPayload,
  VelocityWatchPayload,
} from "@/components/skills/goal-payloads-competition";

/**
 * Bespoke document exhibits for the competition-goal artifacts — each payload
 * renders as the consulting deliverable it is (theme table, playbook cards,
 * partnership-move table, gap-analysis table, shipping-read cards) instead of
 * generic markdown. Parsers are defensive: a payload that fails its contract
 * renders nothing and the markdown body still carries the content.
 */


// ---------------------------------------------------------------------------
// anchor.churn_signal_audit — complaint theme table, own vs competitor
// ---------------------------------------------------------------------------

export function ChurnSignalAuditExhibit({ audit }: { audit: ChurnSignalAuditPayload }) {
  return (
    <ExhibitTable
      title="Churn signal audit — complaint themes"
      headers={["Theme", "Observed about", "Evidence", "Retention play"]}
      rows={audit.themes.map((theme) => [
        <strong key="theme" className="text-slate-900">{theme.theme}</strong>,
        <span key="about">
          <span
            className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
              theme.observed_about === "own" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700"
            }`}
          >
            {theme.observed_about === "own" ? "Own" : "Competitor"}
          </span>
          <span className="mt-1 block text-xs text-slate-500">{theme.company}</span>
        </span>,
        <span key="evidence" className="italic text-slate-500">"{theme.evidence_quote}"</span>,
        theme.retention_play,
      ])}
    />
  );
}

// ---------------------------------------------------------------------------
// anchor.advocacy_engine_scan — playbook cards: their mechanism, your move
// ---------------------------------------------------------------------------

export function AdvocacyEngineScanExhibit({ scan }: { scan: AdvocacyEngineScanPayload }) {
  return (
    <section>
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
        Advocacy engine scan — their mechanism, your move
      </h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {scan.mechanisms.map((mechanism, index) => (
          <div key={`${mechanism.competitor}:${index}`} className="rounded-lg border border-slate-200 p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-slate-900">{mechanism.competitor}</p>
              <span
                className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-medium ${
                  mechanism.source === "live_search" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700"
                }`}
              >
                {mechanism.source === "live_search" ? "live-evidenced" : "canvas-grounded"}
              </span>
            </div>
            <p className="mt-1 text-sm leading-relaxed text-slate-700">{mechanism.mechanism}</p>
            <p className="mt-1 text-xs italic text-slate-500">"{mechanism.evidence_quote}"</p>
            <p className="mt-2 border-t border-slate-200/70 pt-2 text-sm text-slate-700">
              <span className="font-semibold">Your equivalent move:</span> {mechanism.equivalent_move}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// envoy.ecosystem_watch — observed partnership moves table
// ---------------------------------------------------------------------------

export function EcosystemWatchExhibit({ watch }: { watch: EcosystemWatchPayload }) {
  return (
    <ExhibitTable
      title="Ecosystem watch — observed partnership moves"
      headers={["Competitor", "Observed move", "Evidence", "Counter-partner"]}
      rows={watch.moves.map((move) => [
        <strong key="competitor" className="text-slate-900">{move.competitor}</strong>,
        <span key="move">
          <span className="font-semibold">with {move.partner}:</span> {move.move_summary}
        </span>,
        <span key="evidence" className="italic text-slate-500">"{move.evidence_quote}"</span>,
        <span key="counter">
          <strong className="text-slate-900">{move.counter_partner}</strong>
          {move.counter_rationale && (
            <span className="mt-0.5 block text-xs text-slate-500">{move.counter_rationale}</span>
          )}
        </span>,
      ])}
    />
  );
}

// ---------------------------------------------------------------------------
// tempo.operational_benchmark — per-activity gap analysis
// ---------------------------------------------------------------------------

const SIGNAL_TYPE_LABELS: Record<string, string> = {
  hiring: "hiring",
  shipping: "shipping",
  both: "hiring + shipping",
};

export function OperationalBenchmarkExhibit({ benchmark }: { benchmark: OperationalBenchmarkPayload }) {
  return (
    <ExhibitTable
      title="Operational benchmark — activity gap analysis"
      headers={["Our activity", "Signal", "Competitor evidence", "Gap read"]}
      rows={benchmark.rows.map((row) => [
        <strong key="activity" className="text-slate-900">{row.activity}</strong>,
        <span
          key="signal"
          className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${
            row.signal === "visible_investment" ? "bg-slate-900 text-white" : "bg-slate-100 italic text-slate-500"
          }`}
        >
          {row.signal === "visible_investment" ? "Visible investment" : "No public signal"}
        </span>,
        row.signal === "visible_investment" ? (
          <span key="evidence">
            <strong className="text-slate-900">{row.competitor}</strong>
            {row.signal_type && (
              <span className="ml-1.5 inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                {SIGNAL_TYPE_LABELS[row.signal_type] ?? row.signal_type}
              </span>
            )}
            {row.evidence_quote && (
              <span className="mt-1 block text-xs italic text-slate-500">"{row.evidence_quote}"</span>
            )}
          </span>
        ) : (
          <span key="evidence" className="italic text-slate-400">nothing surfaced by the evidence</span>
        ),
        row.gap_read,
      ])}
    />
  );
}

// ---------------------------------------------------------------------------
// tempo.velocity_watch — shipping-read cards + overall velocity insight
// ---------------------------------------------------------------------------

export function VelocityWatchExhibit({ velocity }: { velocity: VelocityWatchPayload }) {
  const tooThin = velocity.insight_basis === "evidence_too_thin";
  return (
    <>
      <section className="rounded-lg border-l-4 border-l-slate-900 bg-slate-50 px-5 py-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Velocity insight</h2>
          <span
            className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-medium ${
              tooThin ? "bg-slate-100 italic text-slate-500" : "bg-slate-900 text-white"
            }`}
          >
            {tooThin ? "evidence too thin" : "evidence-backed delta"}
          </span>
        </div>
        <p className={`mt-2 leading-relaxed ${tooThin ? "text-sm italic text-slate-500" : "text-base text-slate-800"}`}>
          {velocity.velocity_insight}
        </p>
      </section>
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Shipping reads — competitor by competitor</h2>
        <div className="mt-3 space-y-3">
          {velocity.reads.map((read) => (
            <div key={read.competitor} className="rounded-lg border border-slate-200 p-4">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-slate-900">{read.competitor}</h3>
                <span
                  className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-medium ${
                    read.read === "shipping_observed" ? "bg-slate-900 text-white" : "bg-slate-100 italic text-slate-500"
                  }`}
                >
                  {read.read === "shipping_observed" ? "shipping observed" : "evidence thin"}
                </span>
              </div>
              {read.observations.length > 0 ? (
                <ul className="mt-2 space-y-1.5 text-sm text-slate-700">
                  {read.observations.map((observation, index) => (
                    <li key={index}>
                      {observation.what_shipped}
                      <span className="mt-0.5 block text-xs italic text-slate-500">"{observation.evidence_quote}"</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm italic text-slate-400">no recent shipping surfaced by the evidence</p>
              )}
              <p className="mt-2 border-t border-slate-200/70 pt-2 text-sm text-slate-700">
                <span className="font-semibold">Pace:</span> {read.pace_read}
              </p>
            </div>
          ))}
        </div>
      </section>
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
