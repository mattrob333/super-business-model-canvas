import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { BadgeCheck, FileText } from "lucide-react";
import type { Json } from "@/integrations/supabase/types";

/**
 * Skill artifacts are the payoff of the product — they must read as finished
 * documents, not raw markdown (spec 11). This renders an artifact as an
 * always-light paper sheet: a typed layout per skill where we know the
 * payload shape (pricing teardown gets its matrix table + scenario cards),
 * and clean rendered markdown for everything else. Provenance footer on all.
 */

export interface ArtifactRecord {
  skill_key: string;
  title: string;
  body_md: string;
  payload: Json;
  evidence_ids: string[];
  created_at: string;
}

interface PricingMatrixRow {
  competitor: string;
  model: string;
  price_points: string[];
  packaging_axes: string[];
  notes: string;
}

interface PricingPayload {
  matrix: PricingMatrixRow[];
  your_position?: string;
  scenarios?: Array<{ name: string; description: string }>;
  spot_check?: { checked: number; confirmed: number };
}

function asPricingPayload(payload: Json): PricingPayload | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const record = payload as Record<string, unknown>;
  if (!Array.isArray(record.matrix)) return null;
  const matrix = record.matrix.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const row = entry as Record<string, unknown>;
    if (typeof row.competitor !== "string") return [];
    return [{
      competitor: row.competitor,
      model: typeof row.model === "string" ? row.model : "unknown",
      price_points: Array.isArray(row.price_points) ? row.price_points.filter((p): p is string => typeof p === "string") : [],
      packaging_axes: Array.isArray(row.packaging_axes) ? row.packaging_axes.filter((p): p is string => typeof p === "string") : [],
      notes: typeof row.notes === "string" ? row.notes : "",
    }];
  });
  if (matrix.length === 0) return null;
  return {
    matrix,
    your_position: typeof record.your_position === "string" ? record.your_position : undefined,
    scenarios: Array.isArray(record.scenarios)
      ? record.scenarios.flatMap((entry) => {
          if (!entry || typeof entry !== "object") return [];
          const scenario = entry as Record<string, unknown>;
          return typeof scenario.name === "string" && typeof scenario.description === "string"
            ? [{ name: scenario.name, description: scenario.description }]
            : [];
        })
      : undefined,
    spot_check:
      record.spot_check && typeof record.spot_check === "object" && !Array.isArray(record.spot_check)
        ? {
            checked: Number((record.spot_check as Record<string, unknown>).checked ?? 0),
            confirmed: Number((record.spot_check as Record<string, unknown>).confirmed ?? 0),
          }
        : undefined,
  };
}

export function ArtifactDocument({ artifact }: { artifact: ArtifactRecord }) {
  const pricing = artifact.skill_key === "yield.pricing_teardown" ? asPricingPayload(artifact.payload) : null;

  return (
    <article className="rounded-lg border border-slate-200 bg-white px-6 py-8 text-slate-800 shadow-sm sm:px-10 sm:py-10">
      {/* Document header */}
      <header className="border-b border-slate-200 pb-5">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
          Evidence-cited artifact
        </p>
        <h1 className="mt-1 text-xl font-semibold tracking-tight text-slate-900">{artifact.title}</h1>
        <p className="mt-1.5 text-xs text-slate-500">
          {new Date(artifact.created_at).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}
          {" · "}
          {artifact.evidence_ids.length} evidence source{artifact.evidence_ids.length === 1 ? "" : "s"}
          {pricing?.spot_check && pricing.spot_check.checked > 0 && (
            <>
              {" · "}
              verifier confirmed {pricing.spot_check.confirmed}/{pricing.spot_check.checked} spot-checks
            </>
          )}
        </p>
      </header>

      <div className="mt-6 space-y-8">
        {pricing && (
          <>
            {/* Pricing matrix */}
            <section>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                Competitor pricing matrix
              </h2>
              <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full min-w-[560px] border-collapse text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                      <th className="px-3 py-2.5 font-semibold">Competitor</th>
                      <th className="px-3 py-2.5 font-semibold">Model</th>
                      <th className="px-3 py-2.5 font-semibold">Price points</th>
                      <th className="px-3 py-2.5 font-semibold">Packaging</th>
                      <th className="px-3 py-2.5 font-semibold">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pricing.matrix.map((row) => (
                      <tr key={row.competitor} className="border-t border-slate-100 align-top">
                        <td className="px-3 py-2.5 font-medium text-slate-900">{row.competitor}</td>
                        <td className="px-3 py-2.5">
                          <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium capitalize text-slate-700">
                            {row.model}
                          </span>
                        </td>
                        <td className="px-3 py-2.5">
                          {row.price_points.length > 0 ? row.price_points.join(", ") : (
                            <span className="italic text-slate-400">unknown — not published</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-slate-600">
                          {row.packaging_axes.length > 0 ? row.packaging_axes.join(", ") : "—"}
                        </td>
                        <td className="px-3 py-2.5 text-slate-600">{row.notes || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {pricing.your_position && (
              <section className="rounded-lg border-l-4 border-l-slate-900 bg-slate-50 px-4 py-3">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Your position
                </h2>
                <p className="mt-1 text-sm leading-relaxed text-slate-800">{pricing.your_position}</p>
              </section>
            )}

            {pricing.scenarios && pricing.scenarios.length > 0 && (
              <section>
                <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                  Pricing scenarios
                </h2>
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
        )}

        {/* Recommendation / body — rendered markdown, never raw */}
        <section className="prose prose-slate max-w-none prose-headings:tracking-tight prose-h2:mt-6 prose-h2:text-base prose-p:leading-relaxed">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{artifact.body_md}</ReactMarkdown>
        </section>
      </div>

      {/* Provenance footer */}
      <footer className="mt-8 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-slate-200 pt-4 text-xs text-slate-500">
        <span className="inline-flex items-center gap-1">
          <BadgeCheck className="h-3.5 w-3.5 text-slate-400" />
          Verifier spot-checked before publication
        </span>
        <span className="inline-flex items-center gap-1">
          <FileText className="h-3.5 w-3.5 text-slate-400" />
          Built only from cited evidence — unknowns are marked, never invented
        </span>
      </footer>
    </article>
  );
}
