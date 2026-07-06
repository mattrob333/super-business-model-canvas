import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { BadgeCheck, FileText } from "lucide-react";
import type { Json } from "@/integrations/supabase/types";

export interface ArtifactRecord {
  id?: string;
  skill_key: string;
  title: string;
  body_md: string;
  payload: Json;
  evidence_ids: string[];
  created_at: string;
}

export interface ArtifactBrand {
  logoUrl?: string | null;
  brandColor?: string | null;
}

interface PricingPayload {
  matrix: Array<{ competitor: string; model: string; price_points: string[]; packaging_axes: string[]; notes: string }>;
  your_position?: string;
  scenarios?: Array<{ name: string; description: string }>;
  spot_check?: SpotCheck;
}

interface AvatarPayload {
  cards: Array<{
    segment: string;
    who: string;
    pains: Array<{ quote: string; interpretation: string }>;
    buying_triggers: string[];
    disqualifiers: string[];
    messaging_hooks: string[];
  }>;
  spot_check?: SpotCheck;
}

interface SegmentExpansionPayload {
  opportunities: Array<{
    segment: string;
    competitor: string;
    competitor_evidence: string;
    fit_score: number;
    fit_rationale: string;
    recommended_probe: string;
  }>;
  spot_check?: SpotCheck;
}

interface ChannelGapPayload {
  gaps: Array<{
    channel: string;
    competitor: string;
    competitor_evidence: string;
    effort: number;
    impact: number;
    recommendation: string;
  }>;
  spot_check?: SpotCheck;
}

interface ChannelEconomicsPayload {
  channels: Array<{
    channel: string;
    competitor: string;
    public_signal: string;
    cac_posture: string;
    confidence: number;
    notes: string;
  }>;
  spot_check?: SpotCheck;
}

interface SpotCheck {
  checked: number;
  confirmed: number;
}

export function ArtifactDocument({
  artifact,
  brand,
  publicFooter = false,
}: {
  artifact: ArtifactRecord;
  brand?: ArtifactBrand;
  publicFooter?: boolean;
}) {
  const pricing = artifact.skill_key === "yield.pricing_teardown" ? asPricingPayload(artifact.payload) : null;
  const avatar = artifact.skill_key === "compass.avatar_refinement" ? asAvatarPayload(artifact.payload) : null;
  const expansion = artifact.skill_key === "compass.segment_expansion" ? asSegmentExpansionPayload(artifact.payload) : null;
  const channelGap = artifact.skill_key === "relay.channel_gap_scan" ? asChannelGapPayload(artifact.payload) : null;
  const economics = artifact.skill_key === "relay.channel_economics" ? asChannelEconomicsPayload(artifact.payload) : null;
  const checks = pricing?.spot_check ?? avatar?.spot_check ?? expansion?.spot_check ?? channelGap?.spot_check ?? economics?.spot_check;
  const accent = validHexColor(brand?.brandColor) ?? "#f97316";

  return (
    <article className="artifact-paper rounded-lg border border-slate-200 bg-white px-6 py-8 text-slate-800 shadow-sm sm:px-10 sm:py-10">
      <header className="border-b border-slate-200 pb-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              Evidence-cited artifact
            </p>
            <h1 className="mt-1 text-xl font-semibold tracking-tight text-slate-900">{artifact.title}</h1>
          </div>
          {brand?.logoUrl && (
            <img
              src={brand.logoUrl}
              alt=""
              className="max-h-10 max-w-28 shrink-0 object-contain"
              loading="lazy"
            />
          )}
        </div>
        <div className="mt-4 h-1 w-24 rounded-full" style={{ backgroundColor: accent }} />
        <p className="mt-1.5 text-xs text-slate-500">
          {new Date(artifact.created_at).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}
          {" ? "}
          {artifact.evidence_ids.length} evidence source{artifact.evidence_ids.length === 1 ? "" : "s"}
          {checks && checks.checked > 0 && (
            <>
              {" ? "}
              verifier confirmed {checks.confirmed}/{checks.checked} spot-checks
            </>
          )}
        </p>
      </header>

      <div className="mt-6 space-y-8">
        {pricing && <PricingExhibit pricing={pricing} />}
        {avatar && <AvatarExhibit avatar={avatar} />}
        {expansion && <SegmentExpansionExhibit expansion={expansion} />}
        {channelGap && <ChannelGapExhibit channelGap={channelGap} />}
        {economics && <ChannelEconomicsExhibit economics={economics} />}

        <section className="prose prose-slate max-w-none prose-headings:tracking-tight prose-h2:mt-6 prose-h2:text-base prose-p:leading-relaxed">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{artifact.body_md}</ReactMarkdown>
        </section>
      </div>

      <footer className="mt-8 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-slate-200 pt-4 text-xs text-slate-500">
        <span className="inline-flex items-center gap-1">
          <BadgeCheck className="h-3.5 w-3.5 text-slate-400" />
          Verifier spot-checked before publication
        </span>
        <span className="inline-flex items-center gap-1">
          <FileText className="h-3.5 w-3.5 text-slate-400" />
          Built only from cited evidence - unknowns are marked, never invented
        </span>
        {publicFooter && (
          <span className="basis-full pt-2 text-[11px] text-slate-400">
            Made with Super Business Model Canvas
          </span>
        )}
      </footer>
    </article>
  );
}

function validHexColor(value: string | null | undefined): string | null {
  if (!value) return null;
  return /^#[0-9a-fA-F]{6}$/.test(value) ? value : null;
}

function PricingExhibit({ pricing }: { pricing: PricingPayload }) {
  return (
    <>
      <RankedTable
        title="Competitor pricing matrix"
        headers={["Competitor", "Model", "Price points", "Packaging", "Notes"]}
        rows={pricing.matrix.map((row) => [
          <strong key="competitor" className="text-slate-900">{row.competitor}</strong>,
          <span key="model" className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium capitalize text-slate-700">{row.model}</span>,
          row.price_points.length > 0 ? row.price_points.join(", ") : <span key="unknown" className="italic text-slate-400">unknown — not published</span>,
          row.packaging_axes.length > 0 ? row.packaging_axes.join(", ") : "—",
          row.notes || "—",
        ])}
      />
      {pricing.your_position && (
        <section className="rounded-lg border-l-4 border-l-slate-900 bg-slate-50 px-4 py-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Your position</h2>
          <p className="mt-1 text-sm leading-relaxed text-slate-800">{pricing.your_position}</p>
        </section>
      )}
      {pricing.scenarios && pricing.scenarios.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Pricing scenarios</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {pricing.scenarios.map((scenario) => (
              <div key={scenario.name} className="rounded-lg border border-slate-200 p-4">
                <p className="text-sm font-semibold text-slate-900">{scenario.name}</p>
                <p className="mt-1 text-sm leading-relaxed text-slate-600">{scenario.description}</p>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}

function AvatarExhibit({ avatar }: { avatar: AvatarPayload }) {
  return (
    <section>
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">ICP cards</h2>
      <div className="mt-3 grid gap-4">
        {avatar.cards.map((card) => (
          <div key={card.segment} className="rounded-lg border border-slate-200 p-4">
            <h3 className="text-base font-semibold text-slate-900">{card.segment}</h3>
            <p className="mt-1 text-sm leading-relaxed text-slate-700">{card.who}</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Pains in their words</p>
                <div className="mt-2 space-y-2">
                  {card.pains.map((pain) => (
                    <blockquote key={pain.quote} className="border-l-2 border-slate-300 pl-3 text-sm">
                      <p className="italic text-slate-700">"{pain.quote}"</p>
                      <p className="mt-1 text-xs text-slate-500">{pain.interpretation}</p>
                    </blockquote>
                  ))}
                </div>
              </div>
              <div className="space-y-3 text-sm">
                <LabeledList title="Buying triggers" items={card.buying_triggers} />
                <LabeledList title="Disqualifiers" items={card.disqualifiers} />
                <LabeledList title="Messaging hooks" items={card.messaging_hooks} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function SegmentExpansionExhibit({ expansion }: { expansion: SegmentExpansionPayload }) {
  return (
    <RankedTable
      title="Segment expansion shortlist"
      headers={["Segment", "Competitor signal", "Fit", "Probe"]}
      rows={expansion.opportunities.map((row) => [
        <strong key="segment" className="text-slate-900">{row.segment}</strong>,
        <span key="signal">{row.competitor}: {row.competitor_evidence}<br /><span className="text-slate-500">{row.fit_rationale}</span></span>,
        <ScorePill key="fit" value={row.fit_score} />,
        row.recommended_probe,
      ])}
    />
  );
}

function ChannelGapExhibit({ channelGap }: { channelGap: ChannelGapPayload }) {
  return (
    <RankedTable
      title="Channel strategy board"
      headers={["Channel", "Competitor signal", "Effort", "Impact", "Move"]}
      rows={channelGap.gaps.map((row) => [
        <strong key="channel" className="text-slate-900">{row.channel}</strong>,
        `${row.competitor}: ${row.competitor_evidence}`,
        <ScorePill key="effort" value={row.effort} />,
        <ScorePill key="impact" value={row.impact} />,
        row.recommendation,
      ])}
    />
  );
}

function ChannelEconomicsExhibit({ economics }: { economics: ChannelEconomicsPayload }) {
  return (
    <RankedTable
      title="Channel economics table"
      headers={["Channel", "Public signal", "CAC posture", "Confidence", "Notes"]}
      rows={economics.channels.map((row) => [
        <strong key="channel" className="text-slate-900">{row.channel}</strong>,
        `${row.competitor}: ${row.public_signal}`,
        <span key="posture" className={row.cac_posture === "unknown — not published" ? "italic text-slate-400" : ""}>{row.cac_posture}</span>,
        `${Math.round(row.confidence * 100)}%`,
        row.notes,
      ])}
    />
  );
}

function RankedTable({ title, headers, rows }: { title: string; headers: string[]; rows: Array<Array<React.ReactNode>> }) {
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

function LabeledList({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</p>
      <ul className="mt-1 list-disc space-y-1 pl-4 text-slate-700">
        {(items.length > 0 ? items : ["unknown — not published"]).map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function ScorePill({ value }: { value: number }) {
  return (
    <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
      {value}/5
    </span>
  );
}

function asPricingPayload(payload: Json): PricingPayload | null {
  const record = asPayloadRecord(payload);
  if (!record || !Array.isArray(record.matrix)) return null;
  const matrix = record.matrix.flatMap((entry) => {
    const row = asUnknownRecord(entry);
    if (!row || typeof row.competitor !== "string") return [];
    return [{
      competitor: row.competitor,
      model: typeof row.model === "string" ? row.model : "unknown",
      price_points: strings(row.price_points),
      packaging_axes: strings(row.packaging_axes),
      notes: typeof row.notes === "string" ? row.notes : "",
    }];
  });
  return matrix.length > 0
    ? {
        matrix,
        your_position: typeof record.your_position === "string" ? record.your_position : undefined,
        scenarios: Array.isArray(record.scenarios)
          ? record.scenarios.flatMap((entry) => {
              const scenario = asUnknownRecord(entry);
              return scenario && typeof scenario.name === "string" && typeof scenario.description === "string"
                ? [{ name: scenario.name, description: scenario.description }]
                : [];
            })
          : undefined,
        spot_check: spotCheck(record),
      }
    : null;
}

function asAvatarPayload(payload: Json): AvatarPayload | null {
  const record = asPayloadRecord(payload);
  if (!record || !Array.isArray(record.cards)) return null;
  const cards = record.cards.flatMap((entry) => {
    const card = asUnknownRecord(entry);
    if (!card || typeof card.segment !== "string" || typeof card.who !== "string") return [];
    const pains = Array.isArray(card.pains)
      ? card.pains.flatMap((pain) => {
          const row = asUnknownRecord(pain);
          return row && typeof row.quote === "string" && typeof row.interpretation === "string"
            ? [{ quote: row.quote, interpretation: row.interpretation }]
            : [];
        })
      : [];
    return [{ segment: card.segment, who: card.who, pains, buying_triggers: strings(card.buying_triggers), disqualifiers: strings(card.disqualifiers), messaging_hooks: strings(card.messaging_hooks) }];
  });
  return cards.length > 0 ? { cards, spot_check: spotCheck(record) } : null;
}

function asSegmentExpansionPayload(payload: Json): SegmentExpansionPayload | null {
  const record = asPayloadRecord(payload);
  if (!record || !Array.isArray(record.opportunities)) return null;
  const opportunities = record.opportunities.flatMap((entry) => {
    const row = asUnknownRecord(entry);
    if (!row || typeof row.segment !== "string" || typeof row.competitor !== "string") return [];
    return [{
      segment: row.segment,
      competitor: row.competitor,
      competitor_evidence: typeof row.competitor_evidence === "string" ? row.competitor_evidence : "",
      fit_score: Number(row.fit_score ?? 0),
      fit_rationale: typeof row.fit_rationale === "string" ? row.fit_rationale : "",
      recommended_probe: typeof row.recommended_probe === "string" ? row.recommended_probe : "",
    }];
  });
  return opportunities.length > 0 ? { opportunities, spot_check: spotCheck(record) } : null;
}

function asChannelGapPayload(payload: Json): ChannelGapPayload | null {
  const record = asPayloadRecord(payload);
  if (!record || !Array.isArray(record.gaps)) return null;
  const gaps = record.gaps.flatMap((entry) => {
    const row = asUnknownRecord(entry);
    if (!row || typeof row.channel !== "string" || typeof row.competitor !== "string") return [];
    return [{
      channel: row.channel,
      competitor: row.competitor,
      competitor_evidence: typeof row.competitor_evidence === "string" ? row.competitor_evidence : "",
      effort: Number(row.effort ?? 0),
      impact: Number(row.impact ?? 0),
      recommendation: typeof row.recommendation === "string" ? row.recommendation : "",
    }];
  });
  return gaps.length > 0 ? { gaps, spot_check: spotCheck(record) } : null;
}

function asChannelEconomicsPayload(payload: Json): ChannelEconomicsPayload | null {
  const record = asPayloadRecord(payload);
  if (!record || !Array.isArray(record.channels)) return null;
  const channels = record.channels.flatMap((entry) => {
    const row = asUnknownRecord(entry);
    if (!row || typeof row.channel !== "string" || typeof row.competitor !== "string") return [];
    return [{
      channel: row.channel,
      competitor: row.competitor,
      public_signal: typeof row.public_signal === "string" ? row.public_signal : "",
      cac_posture: typeof row.cac_posture === "string" ? row.cac_posture : "unknown — not published",
      confidence: Number(row.confidence ?? 0),
      notes: typeof row.notes === "string" ? row.notes : "",
    }];
  });
  return channels.length > 0 ? { channels, spot_check: spotCheck(record) } : null;
}

function asPayloadRecord(payload: Json): Record<string, unknown> | null {
  return payload && typeof payload === "object" && !Array.isArray(payload) ? payload as Record<string, unknown> : null;
}

function asUnknownRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function spotCheck(record: Record<string, unknown>): SpotCheck | undefined {
  const value = record.spot_check;
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const spot = value as Record<string, unknown>;
  return { checked: Number(spot.checked ?? 0), confirmed: Number(spot.confirmed ?? 0) };
}
