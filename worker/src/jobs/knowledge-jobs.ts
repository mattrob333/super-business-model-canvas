import type { SupabaseClient } from "@supabase/supabase-js";
import { PDFParse } from "pdf-parse";
import * as mammoth from "mammoth";
import type { AgentRunner } from "../agent/runner.js";
import { ClaudeAgentRunner, OpenRouterChatRunner } from "../agent/runner.js";
import { asRecord, asStringArray } from "../db/json.js";
import { FeedRunner } from "../feeds/feed-runner.js";
import type { EvidenceCandidate, FeedRuntimeConfig } from "../feeds/types.js";
import type { AgentJob } from "../queue/types.js";
import { SECTION_AGENT_KEYS, SECTION_LABELS, isSectionKey, type SectionKey } from "../domain/sections.js";
import { chooseModelRoute } from "./canvas-section-analysis.js";
import { verifyClaimAgainstExcerpt, type VerificationStatus } from "./company-research.js";

interface ModelRoute {
  account_id?: string | null;
  route_key?: string | null;
  task_class?: string | null;
  provider: string;
  model_name: string;
  params?: Record<string, unknown> | null;
  cost_per_1k_in: number | null;
  cost_per_1k_out: number | null;
}

interface FounderDocument {
  id: string;
  account_id: string;
  title: string;
  file_name: string | null;
  storage_bucket: string;
  storage_path: string | null;
  content_type: string | null;
  extracted_text: string | null;
}

interface AgentProfile {
  id: string;
  agent_key: string;
  display_name: string | null;
}

interface AgentDocument {
  id: string;
  version: number;
  body_md: string;
  evidence_ids: string[];
}

interface ParsedSectionItem {
  text: string;
  confidence: number;
  evidenceExcerpt: string;
  grounded: boolean;
}

interface ParsedDossier {
  agentKey: string;
  docKey: string;
  title: string;
  bodyMd: string;
  evidenceIds: string[];
  materialChange: boolean;
}

interface ParsedOwnerQuestion {
  agentKey: string;
  question: string;
  whyNeeded: string;
  docKey: string;
}

interface ParsedOnboardingExtract {
  sections: Partial<Record<SectionKey, ParsedSectionItem[]>>;
  dossiers: ParsedDossier[];
  ownerQuestions: ParsedOwnerQuestion[];
}

interface ParsedDocUpdate {
  title: string;
  bodyMd: string;
  evidenceIds: string[];
  materialChange: boolean;
}

export interface KnowledgeJobDependencies extends FeedRuntimeConfig {
  client: SupabaseClient;
  runner?: AgentRunner;
  feedRunner?: Pick<FeedRunner, "refresh">;
  openRouterApiKey?: string;
  fetch?: typeof fetch;
}

export class KnowledgeJobHandler {
  private readonly runner: AgentRunner;
  private readonly feedRunner: Pick<FeedRunner, "refresh">;

  constructor(private readonly deps: KnowledgeJobDependencies) {
    this.runner = deps.runner ?? new ClaudeAgentRunner();
    this.feedRunner = deps.feedRunner ?? new FeedRunner(deps.client, deps);
  }

  async handleOnboardingExtract(job: AgentJob): Promise<void> {
    const payload = asRecord(job.payload);
    const documentId = readString(payload.founder_document_id ?? payload.founderDocumentId);
    if (!documentId) throw new Error("onboarding_extract requires founder_document_id");
    await this.markRunRunning(job, "onboarding_extract", { founder_document_id: documentId });

    const founderDocument = await this.loadFounderDocument(job.account_id, documentId);
    await this.updateFounderDocument(job.account_id, documentId, { status: "parsing", error: null });
    try {
      const sourceText = await this.readFounderDocumentText(founderDocument, payload);
      const routes = await this.loadModelRoutes(job.account_id, ["onboarding_extract", "research_verify"]);
      const route = requiredRoute(routes, job.account_id, "onboarding_extract", "onboarding_extract");
      const verifyRoute = requiredRoute(routes, job.account_id, "research_verify", "research_verify");
      const parsed = safeParseOnboardingExtract((await this.runnerForRoute(route).run({
        model: route.model_name,
        modelParams: route.params ?? undefined,
        maxTurns: 16,
        maxBudgetUsd: budgetForRoute(route),
        prompt: onboardingPrompt(founderDocument, sourceText),
        systemPrompt: "Extract owner-provided Business Model Canvas facts from founder documents. Do not invent missing facts.",
        mcpServers: {},
        allowedTools: [],
      })).resultText);

      const evidenceByExcerpt = await this.writeDocumentEvidence(job, founderDocument, parsed);
      await this.writeOwnerCanvasVersions(job, founderDocument, parsed, evidenceByExcerpt, verifyRoute);
      const profiles = await this.loadAgentProfiles(job.account_id);
      await this.writeDossiers(job, profiles, parsed.dossiers, founderDocument.id);
      await this.writeOwnerQuestions(job, profiles, parsed.ownerQuestions);
      await this.updateFounderDocument(job.account_id, documentId, {
        status: "distributed",
        extracted_text: sourceText,
        section_claims: parsed,
        evidence_ids: [...new Set(evidenceByExcerpt.values())],
        error: null,
      });
      await this.markRunCompleted(job, "onboarding_extract completed", {
        founder_document_id: documentId,
        sections: Object.keys(parsed.sections).length,
        dossiers: parsed.dossiers.length,
        owner_questions: parsed.ownerQuestions.length,
      });
    } catch (error) {
      // RF-5A-5: a failed ingestion must not strand the document in 'parsing'.
      const message = error instanceof Error ? error.message : String(error);
      await this.updateFounderDocument(job.account_id, documentId, { status: "failed", error: message })
        .catch((statusError) => console.error("Failed to mark founder document failed:", statusError));
      throw error;
    }
  }

  async handleDossierRefresh(job: AgentJob): Promise<void> {
    const payload = asRecord(job.payload);
    const agentProfileId = readString(payload.agent_profile_id ?? payload.agentProfileId);
    const docKey = readString(payload.doc_key ?? payload.docKey);
    if (!agentProfileId || !docKey) throw new Error("dossier_refresh requires agent_profile_id and doc_key");
    await this.markRunRunning(job, "dossier_refresh", { agent_profile_id: agentProfileId, doc_key: docKey });

    const doc = await this.loadAgentDocument(job.account_id, agentProfileId, docKey);
    const evidence = await this.refreshWatchedSources(job.account_id, agentProfileId);
    if (evidence.length === 0) {
      // No new evidence: nothing to ground an update in — never rewrite on vibes.
      await this.markRunCompleted(job, "Dossier refresh skipped: no new evidence from watched sources.", {
        doc_key: docKey, version: doc.version, changed: false,
      });
      return;
    }
    const evidenceIds = await this.writeEvidence(job, evidence);
    const routes = await this.loadModelRoutes(job.account_id, ["dossier_refresh", "research_verify"]);
    const route = requiredRoute(routes, job.account_id, "dossier_refresh", "dossier_refresh");
    const update = safeParseDocUpdate((await this.runnerForRoute(route).run({
      model: route.model_name,
      modelParams: route.params ?? undefined,
      maxTurns: 14,
      maxBudgetUsd: budgetForRoute(route),
      prompt: dossierPrompt(doc.body_md, evidence),
      systemPrompt: "Refresh only changed dossier sections. Keep claims cited and concise.",
      mcpServers: {},
      allowedTools: [],
    })).resultText, doc, evidenceIds);

    // RF-5A-2: spec 08 §1.2 — verifier spot-checks new claims before version++.
    const spotCheck = await this.spotCheckClaims(job, routes, update.bodyMd, doc.body_md, evidence);

    const result = await this.upsertAgentDocument(job, agentProfileId, docKey, update, null, spotCheck);
    if (result.changed && update.materialChange && docKey !== "atlas_summary") {
      // RF-5A-3: material change → refresh the Atlas summary + post an insight.
      await this.postMaterialChangeInsight(job, agentProfileId, docKey, update);
      await this.enqueueSummaryUpdate(job, agentProfileId);
    }
    await this.markRunCompleted(job, "Dossier refresh completed", {
      doc_key: docKey, version: result.version, changed: result.changed, spot_check: spotCheck,
    });
  }

  /**
   * Verifier spot-check (RF-5A-2): sample up to 3 claims that are NEW in the
   * updated body and classify each against the collected evidence. A contradicted
   * claim hard-fails the refresh — the old dossier stays authoritative.
   */
  private async spotCheckClaims(
    job: AgentJob,
    routes: ModelRoute[],
    updatedBody: string,
    previousBody: string,
    evidence: EvidenceCandidate[],
  ): Promise<{ checked: number; confirmed: number; unsupported: number }> {
    const newClaims = extractClaimLines(updatedBody).filter((line) => !previousBody.includes(line)).slice(0, 3);
    if (newClaims.length === 0) return { checked: 0, confirmed: 0, unsupported: 0 };
    const verifyRoute = requiredRoute(routes, job.account_id, "research_verify", "research_verify");
    const excerptBundle = evidence.map((item) => item.excerpt ?? item.title).filter(Boolean).join("\n\n").slice(0, 6000);
    let confirmed = 0;
    let unsupported = 0;
    for (const claim of newClaims) {
      const verdict = await verifyClaimAgainstExcerpt(this.runnerForRoute(verifyRoute), verifyRoute, claim, excerptBundle);
      if (verdict.status === "contradicted") {
        throw new Error(`dossier refresh spot-check found a contradicted claim: ${claim} (${verdict.reason})`);
      }
      if (verdict.status === "confirmed") confirmed += 1;
      else unsupported += 1;
    }
    return { checked: newClaims.length, confirmed, unsupported };
  }

  private async postMaterialChangeInsight(job: AgentJob, agentProfileId: string, docKey: string, update: ParsedDocUpdate): Promise<void> {
    const { error } = await this.deps.client.from("insights").insert({
      account_id: job.account_id,
      agent_profile_id: agentProfileId,
      severity: "notable",
      title: `Material change in dossier: ${docKey}`,
      body: update.title,
      tags: ["dossier", "material_change"],
      evidence_ids: update.evidenceIds,
      agent_run_id: job.agent_run_id,
    });
    if (error) console.error(`Failed to post material-change insight for ${docKey}: ${error.message}`);
  }

  /** Durable chained summary refresh (same pattern as the gap-engine chain). */
  private async enqueueSummaryUpdate(job: AgentJob, agentProfileId: string): Promise<void> {
    try {
      const nowIso = new Date().toISOString();
      const { data: run, error: runError } = await this.deps.client
        .from("agent_runs")
        .insert({
          account_id: job.account_id,
          agent_profile_id: agentProfileId,
          run_type: "summary_update",
          trigger_type: "cascade",
          status: "pending",
          input: { agent_profile_id: agentProfileId, chained_from_run_id: job.agent_run_id },
          started_at: nowIso,
        })
        .select("id")
        .single();
      if (runError) throw new Error(runError.message);
      const { error: jobError } = await this.deps.client.from("agent_jobs").insert({
        account_id: job.account_id,
        kind: "summary_update",
        payload: { agent_profile_id: agentProfileId },
        status: "queued",
        agent_run_id: run.id,
        run_after: nowIso,
      });
      if (jobError) throw new Error(jobError.message);
    } catch (error) {
      console.error("summary_update chain enqueue failed:", error);
    }
  }

  async handleSummaryUpdate(job: AgentJob): Promise<void> {
    const payload = asRecord(job.payload);
    const agentProfileId = readString(payload.agent_profile_id ?? payload.agentProfileId);
    if (!agentProfileId) throw new Error("summary_update requires agent_profile_id");
    await this.markRunRunning(job, "summary_update", { agent_profile_id: agentProfileId });

    const sourceDocs = await this.loadAgentDocuments(job.account_id, agentProfileId);
    const routes = await this.loadModelRoutes(job.account_id, ["summary_update", "summary_update_escalated"]);
    const fallbackEvidence = sourceDocs.flatMap((doc) => doc.evidence_ids);

    // RF-5A-1: unparseable output is a HARD failure, never an empty overwrite.
    // Spec 08 §8: budget tier first, escalate to mid on validation failure.
    const budgetRoute = requiredRoute(routes, job.account_id, "summary_update", "summary_update");
    let update = await this.runSummaryRoute(budgetRoute, sourceDocs, fallbackEvidence);
    if (!update) {
      const escalatedRoute = requiredRoute(routes, job.account_id, "summary_update_escalated", "summary_update_escalated");
      update = await this.runSummaryRoute(escalatedRoute, sourceDocs, fallbackEvidence);
    }
    if (!update) {
      throw new Error("summary_update produced unparseable output on both budget and escalated routes; refusing to overwrite atlas_summary");
    }

    const result = await this.upsertAgentDocument(job, agentProfileId, "atlas_summary", update, null);
    await this.markRunCompleted(job, "Summary update completed", { doc_key: "atlas_summary", version: result.version, changed: result.changed });
  }

  private async runSummaryRoute(
    route: ModelRoute,
    sourceDocs: Array<AgentDocument & { doc_key: string; title: string }>,
    fallbackEvidenceIds: string[],
  ): Promise<ParsedDocUpdate | null> {
    const result = await this.runnerForRoute(route).run({
      model: route.model_name,
      modelParams: route.params ?? undefined,
      maxTurns: 8,
      maxBudgetUsd: budgetForRoute(route),
      prompt: summaryPrompt(sourceDocs),
      systemPrompt: "Write the Atlas summary contract exactly. Max 500 tokens. Every bullet must be grounded in provided dossier text.",
      mcpServers: {},
      allowedTools: [],
    });
    return safeParseDocUpdateStrict(result.resultText, fallbackEvidenceIds);
  }

  private async loadFounderDocument(accountId: string, documentId: string): Promise<FounderDocument> {
    const { data, error } = await this.deps.client
      .from("founder_documents")
      .select("id, account_id, title, file_name, storage_bucket, storage_path, content_type, extracted_text")
      .eq("account_id", accountId)
      .eq("id", documentId)
      .maybeSingle();
    if (error) throw new Error(`Failed to load founder document: ${error.message}`);
    if (!data) throw new Error("founder document not found for account");
    return data as FounderDocument;
  }

  private async readFounderDocumentText(document: FounderDocument, payload: Record<string, unknown>): Promise<string> {
    const payloadText = readString(payload.text);
    if (payloadText) return payloadText;
    if (document.extracted_text) return document.extracted_text;
    if (!document.storage_path) throw new Error("founder document has no extracted_text or storage_path");
    const { data, error } = await this.deps.client.storage.from(document.storage_bucket).download(document.storage_path);
    if (error) throw new Error(`Failed to download founder document: ${error.message}`);
    if (isTextDocument(document)) return data.text();
    const bytes = Buffer.from(await data.arrayBuffer());
    if (isPdfDocument(document)) return extractPdfText(bytes);
    if (isDocxDocument(document)) return extractDocxText(bytes);
    throw new Error(`founder document content type ${document.content_type ?? "unknown"} is not supported for text extraction`);
  }

  private async loadModelRoutes(accountId: string, taskClasses: string[]): Promise<ModelRoute[]> {
    const { data, error } = await this.deps.client
      .from("model_routes")
      .select("account_id, route_key, task_class, provider, model_name, params, cost_per_1k_in, cost_per_1k_out")
      .or(`account_id.eq.${accountId},account_id.is.null`)
      .in("task_class", taskClasses)
      .order("account_id", { ascending: false, nullsFirst: false });
    if (error) throw new Error(`Failed to load knowledge model routes: ${error.message}`);
    return (data ?? []) as ModelRoute[];
  }

  private runnerForRoute(route: ModelRoute): AgentRunner {
    if (this.deps.runner) return this.deps.runner;
    if (route.provider === "anthropic") return this.runner;
    if (route.provider === "openrouter") return new OpenRouterChatRunner(this.deps.openRouterApiKey, this.deps.fetch);
    throw new Error(`Unsupported model route provider for knowledge job: ${route.provider}`);
  }

  private async writeDocumentEvidence(job: AgentJob, document: FounderDocument, parsed: ParsedOnboardingExtract): Promise<Map<string, string>> {
    const excerpts = new Set<string>();
    for (const items of Object.values(parsed.sections)) {
      for (const item of items ?? []) excerpts.add(item.evidenceExcerpt || item.text);
    }
    const evidenceByExcerpt = new Map<string, string>();
    for (const excerpt of excerpts) {
      const existingId = await this.findExistingEvidence(job.account_id, document.storage_path, excerpt);
      if (existingId) {
        evidenceByExcerpt.set(excerpt, existingId);
        continue;
      }
      const { data, error } = await this.deps.client.from("evidence_items").insert({
        account_id: job.account_id,
        source_type: "document",
        source_name: document.file_name ?? document.title,
        source_url: document.storage_path,
        title: document.title,
        excerpt,
        metadata: { founder_document_id: document.id, provenance: "owner_provided" },
        created_by_agent_run_id: job.agent_run_id,
      }).select("id").single();
      if (error) throw new Error(`Failed to write document evidence: ${error.message}`);
      evidenceByExcerpt.set(excerpt, data.id);
    }
    return evidenceByExcerpt;
  }

  private async writeOwnerCanvasVersions(
    job: AgentJob,
    document: FounderDocument,
    parsed: ParsedOnboardingExtract,
    evidenceByExcerpt: Map<string, string>,
    verifyRoute: ModelRoute,
  ): Promise<void> {
    const contextId = readString(asRecord(job.payload).business_context_version_id ?? asRecord(job.payload).businessContextVersionId)
      ?? await this.latestBusinessContextId(job.account_id);
    for (const [sectionKey, items] of Object.entries(parsed.sections)) {
      if (!isSectionKey(sectionKey) || !items || items.length === 0) continue;
      // RF-5A-2: every owner claim passes the adversarial verifier against its
      // own document excerpt before the version is stamped verified-fresh.
      const evidenceItems: Array<Record<string, unknown>> = [];
      for (const item of items) {
        const excerpt = item.evidenceExcerpt || item.text;
        const verdict: { status: VerificationStatus; reason: string } =
          await verifyClaimAgainstExcerpt(this.runnerForRoute(verifyRoute), verifyRoute, item.text, excerpt);
        const supported = verdict.status === "confirmed";
        evidenceItems.push({
          text: item.text,
          confidence: supported ? Math.min(item.confidence, 0.95) : Math.min(item.confidence, 0.5),
          evidence_ids: [evidenceByExcerpt.get(excerpt)].filter((id): id is string => Boolean(id)),
          provenance: "owner_provided",
          grounded: supported && item.grounded,
          verification_status: verdict.status,
          flags: supported ? [] : [verdict.status],
        });
      }
      const { score, inputs } = computeGroundedness(evidenceItems as Array<{ grounded?: boolean; evidence_ids?: string[] }>);
      const { error } = await this.deps.client.from("canvas_section_versions").insert({
        account_id: job.account_id,
        business_context_version_id: contextId,
        competitor_id: null,
        section_key: sectionKey,
        section_title: SECTION_LABELS[sectionKey],
        items: evidenceItems,
        notes: `Owner-provided from ${document.title}. Review before treating as researched fact.`,
        confidence: average(evidenceItems.map((item) => item.confidence as number)),
        freshness_status: "fresh",
        last_verified_at: new Date().toISOString(),
        groundedness_score: score,
        groundedness_inputs: inputs,
        created_by_agent_profile_id: await this.agentProfileForSection(job.account_id, sectionKey),
      });
      if (error) throw new Error(`Failed to write owner canvas section: ${error.message}`);
    }
  }

  private async latestBusinessContextId(accountId: string): Promise<string> {
    const { data, error } = await this.deps.client
      .from("business_context_versions")
      .select("id")
      .eq("account_id", accountId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(`Failed to load business context: ${error.message}`);
    if (!data?.id) throw new Error("onboarding_extract requires a business context version");
    return data.id;
  }

  private async agentProfileForSection(accountId: string, sectionKey: SectionKey): Promise<string | null> {
    const { data, error } = await this.deps.client
      .from("agent_profiles")
      .select("id")
      .eq("agent_key", SECTION_AGENT_KEYS[sectionKey])
      .or(`account_id.eq.${accountId},account_id.is.null`)
      .order("account_id", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(`Failed to load section agent profile: ${error.message}`);
    return data?.id ?? null;
  }

  private async loadAgentProfiles(accountId: string): Promise<AgentProfile[]> {
    const { data, error } = await this.deps.client
      .from("agent_profiles")
      .select("id, agent_key, display_name")
      .or(`account_id.eq.${accountId},account_id.is.null`)
      .order("account_id", { ascending: false, nullsFirst: false });
    if (error) throw new Error(`Failed to load agent profiles: ${error.message}`);
    const byKey = new Map<string, AgentProfile>();
    for (const profile of (data ?? []) as AgentProfile[]) {
      if (!byKey.has(profile.agent_key)) byKey.set(profile.agent_key, profile);
    }
    return [...byKey.values()];
  }

  private async writeDossiers(job: AgentJob, profiles: AgentProfile[], dossiers: ParsedDossier[], founderDocumentId: string): Promise<void> {
    for (const dossier of dossiers) {
      const profile = profiles.find((candidate) => candidate.agent_key === dossier.agentKey);
      if (!profile) continue;
      await this.upsertAgentDocument(job, profile.id, dossier.docKey, {
        title: dossier.title,
        bodyMd: dossier.bodyMd,
        evidenceIds: dossier.evidenceIds,
        materialChange: dossier.materialChange,
      }, founderDocumentId);
    }
  }

  private async writeOwnerQuestions(job: AgentJob, profiles: AgentProfile[], questions: ParsedOwnerQuestion[]): Promise<void> {
    for (const question of questions) {
      const profile = profiles.find((candidate) => candidate.agent_key === question.agentKey);
      if (!profile) continue;
      const { count, error: countError } = await this.deps.client
        .from("owner_questions")
        .select("id", { count: "exact", head: true })
        .eq("account_id", job.account_id)
        .eq("agent_profile_id", profile.id)
        .eq("status", "open");
      if (countError) throw new Error(`Failed to count owner questions: ${countError.message}`);
      if ((count ?? 0) >= 3) continue;
      const { error } = await this.deps.client.from("owner_questions").insert({
        account_id: job.account_id,
        agent_profile_id: profile.id,
        question: question.question,
        why_needed: question.whyNeeded,
        doc_key: question.docKey,
        status: "open",
        created_by_agent_run_id: job.agent_run_id,
      });
      if (error) throw new Error(`Failed to write owner question: ${error.message}`);
    }
  }

  private async loadAgentDocument(accountId: string, agentProfileId: string, docKey: string): Promise<AgentDocument> {
    const { data, error } = await this.deps.client
      .from("agent_documents")
      .select("id, version, body_md, evidence_ids")
      .eq("account_id", accountId)
      .eq("agent_profile_id", agentProfileId)
      .eq("doc_key", docKey)
      .maybeSingle();
    if (error) throw new Error(`Failed to load agent document: ${error.message}`);
    if (!data) throw new Error("dossier_refresh requires an existing agent document");
    return data as AgentDocument;
  }

  private async loadAgentDocuments(accountId: string, agentProfileId: string): Promise<Array<AgentDocument & { doc_key: string; title: string }>> {
    const { data, error } = await this.deps.client
      .from("agent_documents")
      .select("id, doc_key, title, version, body_md, evidence_ids")
      .eq("account_id", accountId)
      .eq("agent_profile_id", agentProfileId)
      .neq("doc_key", "atlas_summary")
      .order("updated_at", { ascending: false })
      .limit(12);
    if (error) throw new Error(`Failed to load agent documents: ${error.message}`);
    return (data ?? []) as Array<AgentDocument & { doc_key: string; title: string }>;
  }

  private async refreshWatchedSources(accountId: string, agentProfileId: string): Promise<EvidenceCandidate[]> {
    const { data, error } = await this.deps.client
      .from("watched_sources")
      .select("id, kind, target, label")
      .eq("account_id", accountId)
      .eq("agent_profile_id", agentProfileId)
      .eq("enabled", true)
      .eq("kind", "url")
      .limit(8);
    if (error) throw new Error(`Failed to load watched sources: ${error.message}`);
    const evidence: EvidenceCandidate[] = [];
    for (const source of (data ?? []) as Array<{ id: string; target: string; label: string }>) {
      const result = await this.feedRunner.refresh({
        accountId,
        feedKey: "firecrawl_scrape",
        cacheKey: `dossier:${agentProfileId}:${source.id}:${source.target}`,
        companyName: source.label,
        companyUrl: source.target,
      });
      evidence.push(...result.evidence);
    }
    return evidence;
  }

  /** Evidence dedup on (account, source_url, excerpt) — the Phase-3 discipline. */
  private async findExistingEvidence(accountId: string, sourceUrl: string | null, excerpt: string): Promise<string | null> {
    let query = this.deps.client
      .from("evidence_items")
      .select("id")
      .eq("account_id", accountId)
      .eq("excerpt", excerpt);
    query = sourceUrl === null ? query.is("source_url", null) : query.eq("source_url", sourceUrl);
    const { data, error } = await query.limit(1).maybeSingle();
    if (error) return null;
    return (data as { id: string } | null)?.id ?? null;
  }

  private async writeEvidence(job: AgentJob, evidence: EvidenceCandidate[]): Promise<string[]> {
    const ids: string[] = [];
    for (const item of evidence) {
      const existingId = await this.findExistingEvidence(job.account_id, item.sourceUrl ?? null, item.excerpt ?? item.title);
      if (existingId) {
        ids.push(existingId);
        continue;
      }
      const { data, error } = await this.deps.client.from("evidence_items").insert({
        account_id: job.account_id,
        title: item.title,
        excerpt: item.excerpt ?? null,
        source_url: item.sourceUrl ?? null,
        source_name: item.sourceName ?? null,
        source_type: item.sourceType,
        source_date: item.sourceDate ?? null,
        metadata: item.metadata ?? {},
        created_by_agent_run_id: job.agent_run_id,
      }).select("id").single();
      if (error) throw new Error(`Failed to write evidence: ${error.message}`);
      ids.push(data.id);
    }
    return ids;
  }

  private async upsertAgentDocument(
    job: AgentJob,
    agentProfileId: string,
    docKey: string,
    update: ParsedDocUpdate,
    founderDocumentId: string | null,
    spotCheck?: { checked: number; confirmed: number; unsupported: number },
  ): Promise<{ version: number; changed: boolean }> {
    const { data: existing, error: existingError } = await this.deps.client
      .from("agent_documents")
      .select("id, version, body_md")
      .eq("account_id", job.account_id)
      .eq("agent_profile_id", agentProfileId)
      .eq("doc_key", docKey)
      .maybeSingle();
    if (existingError) throw new Error(`Failed to load existing dossier: ${existingError.message}`);
    if (existing && existing.body_md === update.bodyMd) {
      return { version: existing.version, changed: false };
    }
    const nextVersion = existing ? Number(existing.version) + 1 : 1;
    const values = {
      account_id: job.account_id,
      agent_profile_id: agentProfileId,
      doc_key: docKey,
      title: update.title,
      body_md: update.bodyMd,
      version: nextVersion,
      freshness_status: "fresh",
      last_refreshed_at: new Date().toISOString(),
      evidence_ids: update.evidenceIds,
      material_change: update.materialChange,
      // RF-5A-4: the current row's provenance must match its revision trail.
      claim_sources: {
        default: founderDocumentId ? "owner_provided" : "researched",
        ...(spotCheck ? { spot_check: spotCheck } : {}),
      },
      founder_document_id: founderDocumentId,
      agent_run_id: job.agent_run_id,
    };
    const { data: written, error: writeError } = await this.deps.client
      .from("agent_documents")
      .upsert(values, { onConflict: "account_id,agent_profile_id,doc_key" })
      .select("id")
      .single();
    if (writeError) throw new Error(`Failed to upsert dossier: ${writeError.message}`);
    const { error: revisionError } = await this.deps.client.from("agent_document_revisions").insert({
      agent_document_id: written.id,
      version: nextVersion,
      title: update.title,
      body_md: update.bodyMd,
      evidence_ids: update.evidenceIds,
      material_change: update.materialChange,
      claim_sources: { default: founderDocumentId ? "owner_provided" : "researched" },
      founder_document_id: founderDocumentId,
      agent_run_id: job.agent_run_id,
    });
    if (revisionError) throw new Error(`Failed to write dossier revision: ${revisionError.message}`);
    return { version: nextVersion, changed: true };
  }

  private async updateFounderDocument(accountId: string, documentId: string, values: Record<string, unknown>): Promise<void> {
    const { error } = await this.deps.client.from("founder_documents").update(values).eq("account_id", accountId).eq("id", documentId);
    if (error) throw new Error(`Failed to update founder document: ${error.message}`);
  }

  private async markRunRunning(job: AgentJob, runType: string, input: Record<string, unknown>): Promise<void> {
    if (!job.agent_run_id) return;
    const { error } = await this.deps.client.from("agent_runs").update({
      status: "running",
      run_type: runType,
      input,
      started_at: new Date().toISOString(),
    }).eq("id", job.agent_run_id).eq("account_id", job.account_id);
    if (error) throw new Error(`Failed to mark knowledge run running: ${error.message}`);
  }

  private async markRunCompleted(job: AgentJob, summary: string, output: Record<string, unknown>): Promise<void> {
    if (!job.agent_run_id) return;
    const { error } = await this.deps.client.from("agent_runs").update({
      status: "completed",
      summary,
      output,
      completed_at: new Date().toISOString(),
      error: null,
    }).eq("id", job.agent_run_id).eq("account_id", job.account_id);
    if (error) throw new Error(`Failed to mark knowledge run completed: ${error.message}`);
  }
}

export function computeGroundedness(items: Array<{ grounded?: boolean; evidence_ids?: string[]; provenance?: string }>): {
  score: number;
  inputs: Record<string, unknown>;
} {
  const total = items.length;
  const grounded = items.filter((item) => item.grounded === true && (item.evidence_ids?.length ?? 0) > 0).length;
  const score = total === 0 ? 0 : Math.round((grounded / total) * 10000) / 10000;
  return { score, inputs: { formula: "groundedness_v1", grounded, total } };
}

async function extractPdfText(bytes: Buffer): Promise<string> {
  const parser = new PDFParse({ data: bytes });
  try {
    const result = await parser.getText();
    return result.text;
  } finally {
    await parser.destroy();
  }
}

async function extractDocxText(bytes: Buffer): Promise<string> {
  const result = await mammoth.extractRawText({ buffer: bytes });
  return result.value;
}

function isTextDocument(document: FounderDocument): boolean {
  const type = document.content_type?.toLowerCase() ?? "";
  const name = document.file_name?.toLowerCase() ?? document.storage_path?.toLowerCase() ?? "";
  return type.startsWith("text/") || name.endsWith(".txt") || name.endsWith(".md");
}

function isPdfDocument(document: FounderDocument): boolean {
  const type = document.content_type?.toLowerCase() ?? "";
  const name = document.file_name?.toLowerCase() ?? document.storage_path?.toLowerCase() ?? "";
  return type === "application/pdf" || name.endsWith(".pdf");
}

function isDocxDocument(document: FounderDocument): boolean {
  const type = document.content_type?.toLowerCase() ?? "";
  const name = document.file_name?.toLowerCase() ?? document.storage_path?.toLowerCase() ?? "";
  return type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || name.endsWith(".docx");
}

function requiredRoute(routes: ModelRoute[], accountId: string, routeKey: string, taskClass: string): ModelRoute {
  const route = chooseModelRoute(routes.filter((candidate) => candidate.task_class === taskClass), accountId, routeKey, taskClass);
  if (!route) throw new Error(`No model route configured for ${taskClass}/${routeKey}`);
  return route;
}

function safeParseOnboardingExtract(text: string): ParsedOnboardingExtract {
  const parsed = parseJsonObject(text);
  const sections: Partial<Record<SectionKey, ParsedSectionItem[]>> = {};
  for (const entry of Array.isArray(parsed?.sections) ? parsed.sections : []) {
    const record = asRecord(entry);
    if (!isSectionKey(record.section_key)) continue;
    const items = Array.isArray(record.items) ? record.items : [];
    sections[record.section_key] = items.flatMap((item) => {
      const itemRecord = asRecord(item);
      const itemText = readString(itemRecord.text);
      if (!itemText) return [];
      return [{
        text: itemText,
        confidence: clampConfidence(itemRecord.confidence),
        evidenceExcerpt: readString(itemRecord.evidence_excerpt) ?? itemText,
        grounded: itemRecord.grounded === true,
      }];
    });
  }
  return {
    sections,
    dossiers: parseDossiers(parsed?.dossiers),
    ownerQuestions: parseOwnerQuestions(parsed?.owner_questions),
  };
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** RF-5A-8: model-emitted evidence ids are only trusted when they are real UUIDs. */
function validEvidenceIds(value: unknown, fallback: string[]): string[] {
  const candidate = asStringArray(value).filter((id) => UUID_PATTERN.test(id));
  return candidate.length > 0 ? candidate : fallback;
}

function safeParseDocUpdate(text: string, existing: AgentDocument, fallbackEvidenceIds: string[]): ParsedDocUpdate {
  const parsed = parseJsonObject(text);
  return {
    title: readString(parsed?.title) ?? "Atlas Summary",
    bodyMd: readString(parsed?.body_md ?? parsed?.bodyMd) ?? existing.body_md,
    evidenceIds: validEvidenceIds(parsed?.evidence_ids, fallbackEvidenceIds),
    materialChange: parsed?.material_change === true,
  };
}

/**
 * RF-5A-1: strict variant for atlas_summary — no fallback body. Returns null
 * (caller escalates or hard-fails) instead of ever producing an empty doc.
 */
function safeParseDocUpdateStrict(text: string, fallbackEvidenceIds: string[]): ParsedDocUpdate | null {
  const parsed = parseJsonObject(text);
  const bodyMd = readString(parsed?.body_md ?? parsed?.bodyMd);
  if (!parsed || !bodyMd) return null;
  return {
    title: readString(parsed.title) ?? "Atlas Summary",
    bodyMd,
    evidenceIds: validEvidenceIds(parsed.evidence_ids, fallbackEvidenceIds),
    materialChange: parsed.material_change === true,
  };
}

/** Bullet/numbered lines are the dossier's claims for spot-checking. */
export function extractClaimLines(bodyMd: string): string[] {
  return bodyMd
    .split("\n")
    .map((line) => line.replace(/^\s*(?:[-*+]|\d+[.)])\s+/, "").trim())
    .filter((line, index, lines) => line.length > 20 && lines.indexOf(line) === index && /^[-*+\d]/.test(bodyMd.split("\n")[index]?.trim() ?? ""));
}

function parseDossiers(value: unknown): ParsedDossier[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const record = asRecord(entry);
    const agentKey = readString(record.agent_key);
    const docKey = readString(record.doc_key);
    const title = readString(record.title);
    const bodyMd = readString(record.body_md ?? record.bodyMd);
    if (!agentKey || !docKey || !title || !bodyMd) return [];
    if (docKey === "atlas_summary") return []; // contract doc: only summary_update writes it
    return [{
      agentKey,
      docKey,
      title,
      bodyMd,
      evidenceIds: validEvidenceIds(record.evidence_ids, []),
      materialChange: record.material_change === true,
    }];
  });
}

function parseOwnerQuestions(value: unknown): ParsedOwnerQuestion[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const record = asRecord(entry);
    const agentKey = readString(record.agent_key);
    const question = readString(record.question);
    const whyNeeded = readString(record.why_needed ?? record.whyNeeded);
    const docKey = readString(record.doc_key);
    if (!agentKey || !question || !whyNeeded || !docKey) return [];
    return [{ agentKey, question, whyNeeded, docKey }];
  });
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

const MAX_SOURCE_CHARS = 60_000;

function onboardingPrompt(document: FounderDocument, sourceText: string): string {
  const truncated = sourceText.length > MAX_SOURCE_CHARS
    ? `${sourceText.slice(0, MAX_SOURCE_CHARS)}\n\n[truncated at ${MAX_SOURCE_CHARS} characters]`
    : sourceText;
  return `Parse this founder document into owner-provided BMC facts. Return JSON only with sections, dossiers, and owner_questions. Document: ${document.title}\n\n${truncated}`;
}

function dossierPrompt(existingBody: string, evidence: EvidenceCandidate[]): string {
  return `Refresh this dossier from new evidence. Return JSON only: {"title":"...","body_md":"...","evidence_ids":[],"material_change":false}.\n\nCurrent dossier:\n${existingBody}\n\nEvidence:\n${evidencePrompt(evidence)}`;
}

function summaryPrompt(docs: Array<AgentDocument & { doc_key: string; title: string }>): string {
  return `Write the atlas_summary document from these dossiers. Return JSON only: {"title":"Atlas Summary","body_md":"...","evidence_ids":[],"material_change":true}.\n\n${docs.map((doc) => `# ${doc.title}\n${doc.body_md}`).join("\n\n")}`;
}

function evidencePrompt(evidence: EvidenceCandidate[]): string {
  return evidence.map((item, index) => `[${index}] ${item.title}\n${item.excerpt ?? ""}`).join("\n\n");
}

function budgetForRoute(route: Pick<ModelRoute, "cost_per_1k_in" | "cost_per_1k_out">): number {
  const input = route.cost_per_1k_in ?? 0.002;
  const output = route.cost_per_1k_out ?? 0.01;
  // $0.25 floor matches company-research: Claude Agent SDK session overhead
  // exceeds tiny route-derived caps (live golden-set finding, PR #18).
  return Math.max(0.25, input * 8 + output * 4);
}

function clampConfidence(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0.5;
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 100) / 100;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
