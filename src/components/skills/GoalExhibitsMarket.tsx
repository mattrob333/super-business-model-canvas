import type {
  MessageMarketFitPayload,
  MonetizationGapsPayload,
  PartnerOutreachPayload,
  WateringHolesPayload,
  WtpSignal,
  WtpSignalsPayload,
} from "@/components/skills/goal-payloads-market";

/**
 * Bespoke document exhibits for the market-facing goal artifacts — each
 * payload renders as the consulting deliverable it is (ranked gap table,
 * per-segment signal cards, watering-hole map, before/after language table,
 * outreach draft cards) instead of generic markdown. Parsers live in
 * goal-payloads-market.ts and are defensive: a payload that fails its
 * contract renders nothing and the markdown body still carries the content.
 */


// ---------------------------------------------------------------------------
// yield.monetization_gaps — ranked missed-model table
// ---------------------------------------------------------------------------

export function MonetizationGapsExhibit({ gaps }: { gaps: MonetizationGapsPayload }) {
  return (
    <ExhibitTable
      title="Monetization gaps — ranked most promising first"
      headers={["#", "Missed model", "Competitors running it", "Why adopt", "First experiment"]}
      rows={gaps.gaps.map((gap, index) => [
        <span key="rank" className="text-xs font-semibold text-slate-500">{index + 1}</span>,
        <strong key="model" className="text-slate-900">{gap.model}</strong>,
        <ul key="competitors" className="space-y-1">
          {gap.competitors.map((citation) => (
            <li key={`${citation.competitor}:${citation.evidence_quote}`}>
              <strong>{citation.competitor}</strong>
              {citation.evidence_quote && (
                <span className="mt-0.5 block text-xs italic text-slate-500">“{citation.evidence_quote}”</span>
              )}
            </li>
          ))}
        </ul>,
        gap.adoption_rationale || "—",
        gap.first_experiment || "—",
      ])}
    />
  );
}

// ---------------------------------------------------------------------------
// yield.wtp_signals — per-segment signal cards
// ---------------------------------------------------------------------------

const WTP_SIGNAL_STYLE: Record<WtpSignal, { label: string; className: string }> = {
  underpriced: { label: "Underpriced", className: "bg-amber-50 text-amber-700" },
  overpriced: { label: "Overpriced", className: "bg-amber-50 text-amber-700" },
  aligned: { label: "Aligned", className: "bg-emerald-50 text-emerald-700" },
  unknown: { label: "Unknown", className: "bg-slate-100 italic text-slate-500" },
};

export function WtpSignalsExhibit({ signals }: { signals: WtpSignalsPayload }) {
  return (
    <section>
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Willingness-to-pay by segment</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {signals.signals.map((row) => {
          const signal = WTP_SIGNAL_STYLE[row.signal];
          return (
            <div key={row.segment} className="rounded-lg border border-slate-200 p-4">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-semibold text-slate-900">{row.segment}</p>
                <span className={`inline-flex shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${signal.className}`}>
                  {signal.label}
                </span>
              </div>
              {row.evidence_quote && (
                <p className="mt-2 text-sm italic leading-relaxed text-slate-500">“{row.evidence_quote}”</p>
              )}
              {row.rationale && (
                <p className="mt-2 text-xs leading-relaxed text-slate-600">{row.rationale}</p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// relay.watering_holes — ranked community map
// ---------------------------------------------------------------------------

export function WateringHolesExhibit({ holes }: { holes: WateringHolesPayload }) {
  return (
    <ExhibitTable
      title="Watering holes — where the segment already congregates"
      headers={["Rank", "Watering hole", "Segment", "Evidence", "Entry strategy"]}
      rows={holes.holes.map((hole) => [
        <span key="rank" className="text-xs font-semibold text-slate-500">{hole.rank}</span>,
        <strong key="name" className="text-slate-900">{hole.name}</strong>,
        <span key="segment" className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
          {hole.segment}
        </span>,
        hole.evidence_quote ? (
          <span key="evidence" className="text-xs italic text-slate-500">“{hole.evidence_quote}”</span>
        ) : (
          <span key="evidence" className="italic text-slate-400">none surfaced</span>
        ),
        hole.entry_strategy || "—",
      ])}
    />
  );
}

// ---------------------------------------------------------------------------
// compass.message_market_fit — before/after language blocks
// ---------------------------------------------------------------------------

export function MessageMarketFitExhibit({ fit }: { fit: MessageMarketFitPayload }) {
  return (
    <section>
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Message-market fit — your line vs their words</h2>
      <div className="mt-3 space-y-3">
        {fit.rows.map((row) => (
          <div key={row.your_line} className="rounded-lg border border-slate-200 p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Your line</p>
                <p className="mt-1 text-sm leading-relaxed text-slate-700">{row.your_line}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Their words</p>
                {row.status === "rewritten" && row.their_words ? (
                  <p className="mt-1 text-sm font-medium leading-relaxed text-slate-900">“{row.their_words}”</p>
                ) : (
                  <p className="mt-1 text-sm italic leading-relaxed text-slate-400">no segment language yet</p>
                )}
              </div>
            </div>
            {row.why_it_lands && (
              <p className="mt-2 border-t border-slate-200/70 pt-2 text-xs leading-relaxed text-slate-600">
                <span className="font-semibold">{row.status === "rewritten" ? "Why it lands:" : "What's missing:"}</span>{" "}
                {row.why_it_lands}
              </p>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// envoy.partner_outreach — draft cards behind an approval banner
// ---------------------------------------------------------------------------

export function PartnerOutreachExhibit({ outreach }: { outreach: PartnerOutreachPayload }) {
  return (
    <>
      <section className="rounded-lg border border-amber-200 bg-amber-50 px-5 py-4">
        <p className="text-sm font-semibold text-amber-900">Drafts awaiting your approval — never sent automatically</p>
        <p className="mt-1 text-xs leading-relaxed text-amber-800">
          Nothing below has been sent and nothing will be sent autonomously. Sending is always your action.
        </p>
      </section>
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Outreach drafts</h2>
        <div className="mt-3 space-y-3">
          {outreach.drafts.map((draft) => (
            <div key={draft.partner_name} className="rounded-lg border border-slate-200 p-4">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-semibold text-slate-900">{draft.partner_name}</p>
                <span className="inline-flex shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                  Draft
                </span>
              </div>
              {draft.rationale && (
                <p className="mt-1 text-xs leading-relaxed text-slate-600">{draft.rationale}</p>
              )}
              {draft.evidence_quote && (
                <p className="mt-1 text-xs italic text-slate-500">Grounded in: “{draft.evidence_quote}”</p>
              )}
              <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                {draft.subject && (
                  <p className="text-sm font-semibold text-slate-900">Subject: {draft.subject}</p>
                )}
                <p className={`whitespace-pre-wrap text-sm leading-relaxed text-slate-700 ${draft.subject ? "mt-2" : ""}`}>
                  {draft.body}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

// ---------------------------------------------------------------------------
// Shared primitives (mirror PhaseGExhibits' local ones — kept here so the
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
