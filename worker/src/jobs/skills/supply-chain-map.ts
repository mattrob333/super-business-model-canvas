import { asRecord } from "../../db/json.js";
import type { CanvasItemSource, SkillRun } from "./toolkit.js";

/**
 * envoy.supply_chain_map — a supply-chain map for the Key Partners room:
 * where the analyzed company sits between upstream suppliers and downstream
 * distribution, plus concrete partnership candidates with a 1–5 fit score.
 * The map is grounded in live industry evidence (Grok search over the
 * company's supply chain), never in the model's own market knowledge — every
 * candidate must quote one of the retrieved excerpts verbatim
 * (parser-enforced) and the top candidates are verifier-spot-checked against
 * the excerpt that contains their quote. Our current Key Partners items ride
 * along as optional context so the map extends the canvas instead of
 * re-listing it.
 */

export type SupplyChainRole = "upstream" | "downstream" | "complement";

const SUPPLY_CHAIN_ROLES = new Set<string>(["upstream", "downstream", "complement"]);

export interface SupplyChainCandidate {
  name: string;
  role: SupplyChainRole;
  fit_score: number;
  rationale: string;
  /** Verbatim substring of one of the retrieved excerpts — parser-enforced. */
  evidence_quote: string;
}

export interface SupplyChainMapArtifact {
  bodyMd: string;
  upstream: string[];
  downstream: string[];
  candidates: SupplyChainCandidate[];
}

export const runSupplyChainMap: SkillRun = async (toolkit, job, scope) => {
  // The whole map hangs off the analyzed company's industry — without a
  // company there is no supply chain to search.
  if (!scope.companyName) throw new Error("supply_chain_map requires an analyzed company first");
  const companyName = scope.companyName;

  // Optional context: existing Key Partners items keep the map from
  // recommending partners the canvas already has.
  const ownPartners = await toolkit.loadOwnSectionItems(job.account_id, "key_partners", scope);

  const feed = await toolkit.refreshFeed({
    accountId: job.account_id,
    feedKey: "grok_live_search",
    cacheKey: `supply_chain_map:${job.account_id}`,
    companyName,
    query: `${companyName} industry supply chain upstream suppliers downstream distribution channel partners ecosystem`,
  });
  const sources = feed.health === "ok"
    ? feed.evidence.filter((entry) => Boolean(entry.excerpt?.trim())).slice(0, 6)
    : [];
  if (sources.length === 0) {
    throw new Error("supply_chain_map could not retrieve industry evidence — check the Grok search feed");
  }

  // Every excerpt that feeds the prompt lands on the evidence ledger first —
  // the artifact's evidence_ids must point at what the model actually saw.
  const evidenceIds: string[] = [];
  for (const source of sources) {
    evidenceIds.push(await toolkit.writeEvidence(job, {
      title: `${companyName} supply-chain source`,
      sourceUrl: source.sourceUrl ?? "grok_live_search",
      excerpt: source.excerpt ?? "",
    }));
  }
  const excerpts = sources.map((source) => source.excerpt ?? "");

  const routes = await toolkit.loadModelRoutes(job.account_id, ["skill_run", "research_verify"]);
  const route = toolkit.requiredRoute(routes, job.account_id, "skill_run", "skill_run");
  const verifyRoute = toolkit.requiredRoute(routes, job.account_id, "research_verify", "research_verify");
  const modelResult = await toolkit.runModel(
    `supply_chain_map artifact (${route.provider}/${route.model_name})`,
    route,
    {
      maxTurns: 12,
      maxBudgetUsd: toolkit.budgetForRoute(route),
      prompt: supplyChainMapPrompt(companyName, excerpts, ownPartners),
      systemPrompt:
        "You map supply chains strictly from the provided industry excerpts. Every candidate's evidence_quote must appear verbatim in one of the excerpts — never cite from memory. Return JSON only.",
      mcpServers: {},
      allowedTools: [],
    },
  );
  const artifact = parseSupplyChainMapArtifact(modelResult.resultText, excerpts);
  if (!artifact) throw new Error("supply_chain_map produced unparseable output; refusing to write an artifact");

  // Verifier spot-check: each top candidate against the excerpt that
  // contains its quote (the parser guarantees one exists).
  const checks = artifact.candidates.slice(0, 4).map((candidate) => ({
    claim: `${candidate.name} is a potential ${candidate.role} partner: ${candidate.rationale}`,
    excerpt: excerpts.find((excerpt) => excerpt.includes(candidate.evidence_quote)) ?? "",
  }));
  const checked = await toolkit.verifyArtifactClaims(job, verifyRoute, checks, "supply_chain_map");

  await toolkit.writeSkillArtifact(job, scope, {
    skillKey: "envoy.supply_chain_map",
    agentKey: "agent_key_partnerships",
    title: `Supply-chain map — ${artifact.candidates.length} partnership candidate${artifact.candidates.length === 1 ? "" : "s"}`,
    bodyMd: artifact.bodyMd,
    payload: {
      upstream: artifact.upstream,
      downstream: artifact.downstream,
      candidates: artifact.candidates,
      spot_check: checked,
    },
    evidenceIds: toolkit.unique(evidenceIds),
    inputs: { sections: ["key_partners"], company: companyName, evidence_excerpts: excerpts.length },
  });
  await toolkit.markRunCompleted(job, "Supply-chain map completed", {
    skill_key: "envoy.supply_chain_map",
    candidates: artifact.candidates.length,
    spot_check_confirmed: checked.confirmed,
  });
};

export function supplyChainMapPrompt(
  companyName: string,
  excerpts: string[],
  ownPartners: CanvasItemSource[],
): string {
  return `Map the supply chain around ${companyName} from the industry excerpts below:
- "upstream": the supplier/input layers the company depends on.
- "downstream": the distribution/channel layers between the company and its customers.
- "candidates": concrete partnership candidates named in the excerpts — role is exactly one of upstream, downstream, complement — with fit_score 1 to 5 (5 = obvious strategic fit).
- Every candidate's "evidence_quote" must be a phrase copied VERBATIM from one of the excerpts. Skip anything the excerpts do not name.
Return JSON only:
{"upstream":["supplier layer"],"downstream":["distribution layer"],"candidates":[{"name":"...","role":"upstream|downstream|complement","fit_score":4,"rationale":"one-sentence reasoning","evidence_quote":"verbatim phrase from an excerpt"}],"body_md":"## Supply-chain map\\n..."}

Our current Key Partners (context only — propose partners beyond these):
${formatOwnItems(ownPartners)}

Industry excerpts:
${excerpts.map((excerpt, index) => `[${index}] ${excerpt.slice(0, 2500)}`).join("\n\n")}`;
}

export function parseSupplyChainMapArtifact(text: string, excerpts: string[]): SupplyChainMapArtifact | null {
  const parsed = parseJsonObject(text);
  if (!parsed) return null;
  const candidates: SupplyChainCandidate[] = Array.isArray(parsed.candidates)
    ? parsed.candidates.flatMap((entry) => {
        const row = asRecord(entry);
        const name = readString(row.name);
        const role = readString(row.role);
        const rationale = readString(row.rationale);
        const evidenceQuote = readString(row.evidence_quote);
        if (!name || !rationale || !evidenceQuote) return [];
        if (!role || !SUPPLY_CHAIN_ROLES.has(role)) return [];
        // The quote must live in one of the excerpts the model was shown —
        // a candidate cited from the model's memory is dropped, not shipped.
        if (!excerpts.some((excerpt) => excerpt.includes(evidenceQuote))) return [];
        return [{
          name,
          role: role as SupplyChainRole,
          fit_score: boundedScore(row.fit_score),
          rationale,
          evidence_quote: evidenceQuote,
        }];
      })
    : [];
  const bodyMd = readString(parsed.body_md);
  return candidates.length > 0 && bodyMd
    ? { bodyMd, upstream: toStringArray(parsed.upstream), downstream: toStringArray(parsed.downstream), candidates }
    : null;
}

function formatOwnItems(items: CanvasItemSource[]): string {
  return items.length > 0 ? items.map((item) => `- ${item.text}`).join("\n") : "- (none recorded)";
}

function parseJsonObject(text: string): Record<string, unknown> | null {
  const unfenced = text.replace(/```(?:json)?/gi, "```").replace(/```/g, "").trim();
  const start = unfenced.indexOf("{");
  const end = unfenced.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return asRecord(JSON.parse(unfenced.slice(start, end + 1)));
  } catch {
    return null;
  }
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function boundedScore(value: unknown): number {
  const score = Number(value);
  if (!Number.isFinite(score)) return 1;
  return Math.min(5, Math.max(1, Math.round(score)));
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
