import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertCircle,
  BadgeCheck,
  BookOpen,
  Building2,
  CheckCircle2,
  CircleHelp,
  Clock3,
  ExternalLink,
  FileText,
  ImageIcon,
  LayoutGrid,
  Loader2,
  MessageSquare,
  RefreshCw,
  ShieldCheck,
  Upload,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { FocusDrawer } from "@/components/overlay/FocusDrawer";
import { GroundingWizardDrawer } from "@/components/knowledge/GroundingWizardDrawer";
import { supabase } from "@/integrations/supabase/client";
import type { Database, Json } from "@/integrations/supabase/types";
import { useAccountId } from "@/hooks/useAccountId";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { getAgentRuntime } from "@/lib/agent-runtime";
import { setActiveAnalysis } from "@/lib/active-analysis";
import { loadCompanyScope } from "@/lib/company-scope";
import { setActiveWorkspaceName } from "@/lib/active-workspace";
import { bridgeAnalysisToCanvasVersions } from "@/lib/canvas-version-bridge";
import { cn } from "@/lib/utils";

type FounderDocument = Database["public"]["Tables"]["founder_documents"]["Row"];
type AgentDocument = Database["public"]["Tables"]["agent_documents"]["Row"];
type OwnerQuestion = Database["public"]["Tables"]["owner_questions"]["Row"];
type EvidenceItem = Database["public"]["Tables"]["evidence_items"]["Row"];
type AgentProfile = Pick<Database["public"]["Tables"]["agent_profiles"]["Row"], "id" | "agent_key" | "display_name" | "account_id">;
type Company = Pick<Database["public"]["Tables"]["companies"]["Row"], "id" | "name" | "website_url" | "logo_url" | "logo_source">;

const STATUS_COPY: Record<FounderDocument["status"], { label: string; tone: string; icon: typeof Clock3 }> = {
  uploaded: { label: "Uploaded", tone: "text-muted-foreground", icon: Clock3 },
  parsing: { label: "Parsing", tone: "text-blue-600 dark:text-blue-300", icon: Loader2 },
  needs_review: { label: "Needs review", tone: "text-amber-600 dark:text-amber-300", icon: AlertCircle },
  distributed: { label: "Distributed", tone: "text-emerald-600 dark:text-emerald-300", icon: CheckCircle2 },
  failed: { label: "Failed", tone: "text-destructive", icon: XCircle },
};

const DOC_KEY_LABELS: Record<string, string> = {
  atlas_summary: "Atlas Summary",
  positioning_narrative: "Positioning Narrative",
  market_map: "Market Map",
  customer_truths: "Customer Truths",
  revenue_logic: "Revenue Logic",
};

export default function Knowledge() {
  const { accountId, loading: accountLoading } = useAccountId();
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [buildingDocId, setBuildingDocId] = useState<string | null>(null);
  const [documents, setDocuments] = useState<FounderDocument[]>([]);
  const [dossiers, setDossiers] = useState<AgentDocument[]>([]);
  const [questions, setQuestions] = useState<OwnerQuestion[]>([]);
  const [evidenceById, setEvidenceById] = useState<Map<string, EvidenceItem>>(new Map());
  const [profiles, setProfiles] = useState<AgentProfile[]>([]);
  const [company, setCompany] = useState<Company | null>(null);
  const [selectedDossier, setSelectedDossier] = useState<AgentDocument | null>(null);
  const [selectedQuestionId, setSelectedQuestionId] = useState<string | null>(null);
  const [answerDraft, setAnswerDraft] = useState("");
  const [manualLogoUrl, setManualLogoUrl] = useState("");
  const [wizardOpen, setWizardOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const openQuestions = questions.filter((question) => question.status === "open");
  const distributedCount = documents.filter((document) => document.status === "distributed").length;
  const failedCount = documents.filter((document) => document.status === "failed").length;
  const [canvasGroundedness, setCanvasGroundedness] = useState<number | null>(null);
  const selectedQuestion = questions.find((question) => question.id === selectedQuestionId) ?? null;

  async function openDocument(doc: FounderDocument) {
    if (!doc.storage_bucket || !doc.storage_path) {
      toast({ title: "No file to open", description: "This document has no stored file.", variant: "destructive" });
      return;
    }
    const { data, error } = await supabase.storage
      .from(doc.storage_bucket)
      .createSignedUrl(doc.storage_path, 3600);
    if (error || !data?.signedUrl) {
      toast({ title: "Could not open file", description: error?.message ?? "Try again.", variant: "destructive" });
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener");
  }

  // The deck-to-canvas bridge: the same analyze-company function the URL flow
  // uses, fed the parsed document text instead. Document-silent items come
  // back labeled "Assumption:" so the canvas is honest about guesses vs facts.
  async function buildCanvasFromDocument(doc: FounderDocument) {
    if (buildingDocId || !accountId) return;
    setBuildingDocId(doc.id);
    try {
      const { data: docRow, error: docError } = await supabase
        .from("founder_documents")
        .select("extracted_text")
        .eq("id", doc.id)
        .eq("account_id", accountId)
        .maybeSingle();
      const text = docRow?.extracted_text?.trim();
      if (docError || !text) {
        throw new Error("No extracted text yet — wait for parsing to finish, then try again.");
      }

      const { data, error } = await supabase.functions.invoke("analyze-company", {
        body: { document_text: text, document_name: doc.title },
      });
      if (error) throw new Error(error.message ?? "Analysis failed — try again.");
      if (!data?.company || !data?.canvas) throw new Error("The analysis came back empty — try again.");

      const companyName: string = data.company?.name || doc.title || "Untitled company";
      let savedId: string | null = null;
      if (user) {
        const { data: inserted, error: saveError } = await supabase
          .from("saved_analyses")
          .insert({ user_id: user.id, company_name: companyName, analysis_data: data })
          .select("id")
          .single();
        if (saveError || !inserted) throw new Error(saveError?.message ?? "Saved analysis insert matched zero rows.");
        savedId = inserted.id;
      }
      await bridgeAnalysisToCanvasVersions({
        accountId,
        userId: user?.id ?? null,
        sourceAnalysisId: savedId,
        analysisData: data as Record<string, unknown>,
        summaryPrefix: `Deck analysis from ${doc.title}`,
      });
      setActiveWorkspaceName(companyName);
      setActiveAnalysis({ id: savedId, data });
      sessionStorage.setItem("loadedAnalysis", JSON.stringify(data));
      toast({
        title: `${companyName} canvas built`,
        description: "Document-grounded items read as facts; market-research inferences are labeled as assumptions.",
      });
      navigate("/canvas");
    } catch (error) {
      toast({
        title: "Canvas build failed",
        description: error instanceof Error ? error.message : "Try again.",
        variant: "destructive",
      });
    } finally {
      setBuildingDocId(null);
    }
  }

  const loadEvidenceForDossiers = useCallback(async (nextDossiers: AgentDocument[]) => {
    const ids = [...new Set(nextDossiers.flatMap((doc) => doc.evidence_ids))];
    if (ids.length === 0) {
      setEvidenceById(new Map());
      return;
    }
    const { data, error } = await supabase
      .from("evidence_items")
      .select("*")
      .in("id", ids);
    if (error) throw error;
    setEvidenceById(new Map((data ?? []).map((item) => [item.id, item])));
  }, []);

  const loadKnowledge = useCallback(async (options?: { background?: boolean }) => {
    if (!accountId) return;
    if (!options?.background) setLoading(true);
    try {
      const [documentsResult, dossiersResult, questionsResult, profilesResult, companiesResult, groundednessResult] = await Promise.all([
        supabase
          .from("founder_documents")
          .select("*")
          .eq("account_id", accountId)
          .order("created_at", { ascending: false }),
        supabase
          .from("agent_documents")
          .select("*")
          .eq("account_id", accountId)
          .order("updated_at", { ascending: false }),
        supabase
          .from("owner_questions")
          .select("*")
          .eq("account_id", accountId)
          .order("created_at", { ascending: false }),
        supabase
          .from("agent_profiles")
          .select("id, agent_key, display_name, account_id")
          .or(`account_id.eq.${accountId},account_id.is.null`)
          .order("account_id", { ascending: false, nullsFirst: false }),
        supabase
          .from("companies")
          .select("id, name, website_url, logo_url, logo_source")
          .eq("account_id", accountId)
          .eq("is_competitor", false)
          .order("updated_at", { ascending: false })
          .limit(1),
        loadCompanyScope(accountId)
          .catch(() => null)
          .then((scope) => {
            // Groundedness meters describe the ACTIVE company's canvas only.
            let query = supabase
              .from("canvas_section_versions")
              .select("section_key, groundedness_score, created_at")
              .eq("account_id", accountId)
              .is("competitor_id", null)
              .not("groundedness_score", "is", null);
            if (scope) query = query.in("business_context_version_id", scope.contextIds);
            return query.order("created_at", { ascending: false }).limit(100);
          }),
      ]);

      if (documentsResult.error) throw documentsResult.error;
      if (dossiersResult.error) throw dossiersResult.error;
      if (questionsResult.error) throw questionsResult.error;
      if (profilesResult.error) throw profilesResult.error;
      if (companiesResult.error) throw companiesResult.error;

      const nextDossiers = dossiersResult.data ?? [];
      const nextDocuments = documentsResult.data ?? [];
      setDocuments(nextDocuments);
      setDossiers(nextDossiers);
      setQuestions(questionsResult.data ?? []);
      setProfiles(profilesResult.data ?? []);
      setCompany(companiesResult.data?.[0] ?? null);
      setManualLogoUrl(companiesResult.data?.[0]?.logo_url ?? "");
      // Real groundedness (spec 08): average of the latest scored version per section.
      const latestBySection = new Map<string, number>();
      for (const row of groundednessResult.error ? [] : groundednessResult.data ?? []) {
        if (typeof row.groundedness_score === "number" && !latestBySection.has(row.section_key)) {
          latestBySection.set(row.section_key, row.groundedness_score);
        }
      }
      setCanvasGroundedness(
        latestBySection.size === 0
          ? null
          : Math.round(([...latestBySection.values()].reduce((sum, value) => sum + value, 0) / latestBySection.size) * 100),
      );
      await loadEvidenceForDossiers(nextDossiers);
    } catch (error) {
      toast({
        title: "Knowledge failed to load",
        description: error instanceof Error ? error.message : "Try refreshing the page.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [accountId, loadEvidenceForDossiers, toast]);

  useEffect(() => {
    if (!accountId) {
      setLoading(!accountLoading);
      return;
    }
    void loadKnowledge();
  }, [accountId, accountLoading, loadKnowledge]);

  // Live status: poll while any document is still moving through the pipeline.
  const hasActiveDocuments = documents.some(
    (document) => document.status === "uploaded" || document.status === "parsing",
  );
  useEffect(() => {
    if (!accountId || !hasActiveDocuments) return;
    const interval = window.setInterval(() => {
      void loadKnowledge({ background: true });
    }, 8000);
    return () => window.clearInterval(interval);
  }, [accountId, hasActiveDocuments, loadKnowledge]);

  async function handleFileUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !accountId || !user || uploading) return;

    setUploading(true);
    let createdDocumentId: string | null = null;
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 120);
      const path = `${accountId}/${Date.now()}-${safeName}`;
      const { error: uploadError } = await supabase.storage
        .from("founder-documents")
        .upload(path, file, { contentType: file.type || "application/octet-stream" });
      if (uploadError) throw uploadError;

      const { data: document, error: insertError } = await supabase
        .from("founder_documents")
        .insert({
          account_id: accountId,
          title: stripExtension(file.name),
          file_name: file.name,
          storage_bucket: "founder-documents",
          storage_path: path,
          content_type: file.type || "application/octet-stream",
          file_size_bytes: file.size,
          status: "uploaded",
          uploaded_by: user.id,
        })
        .select("*")
        .single();
      if (insertError) throw insertError;
      createdDocumentId = document.id;

      const profileId = pickOrchestratorProfile(profiles, accountId)?.id ?? profiles[0]?.id;
      if (!profileId) throw new Error("No agent profile is available for document ingestion.");

      // Pre-launch accounts have no business_context_versions row yet, and the
      // extract job requires one (the RF-4-15 failure class) — ensure it here.
      let contextVersionId: string;
      // The ACTIVE company's context, never a stale prior-company row.
      const scope = await loadCompanyScope(accountId).catch(() => null);
      if (scope?.activeContextId) {
        contextVersionId = scope.activeContextId;
      } else {
        const { data: newContext, error: ctxError } = await supabase
          .from("business_context_versions")
          .insert({
            account_id: accountId,
            version_number: 1,
            summary: `Initial business context from ${file.name}`,
            data: {},
            created_by: user.id,
          })
          .select("id")
          .single();
        if (ctxError || !newContext) {
          throw new Error(`Failed to create business context: ${ctxError?.message ?? "unknown"}`);
        }
        contextVersionId = newContext.id;
      }

      const runtime = getAgentRuntime(accountId);
      const run = await runtime.startRun({
        accountId,
        agentProfileId: profileId,
        runType: "onboarding_extract",
        triggerType: "manual",
        triggeredBy: user.id,
        input: {
          founder_document_id: document.id,
          business_context_version_id: contextVersionId,
        },
      });

      await supabase
        .from("founder_documents")
        .update({ agent_run_id: run.runId, status: "parsing" })
        .eq("id", document.id)
        .eq("account_id", accountId);

      toast({ title: "Document queued", description: `${file.name} is being parsed and distributed.` });
      await loadKnowledge();
    } catch (error) {
      const message = error instanceof Error ? error.message : "The document was not queued.";
      if (createdDocumentId) {
        // Leave a visible failure on the card instead of a stuck 'uploaded' row.
        await supabase
          .from("founder_documents")
          .update({ status: "failed", error: message })
          .eq("id", createdDocumentId)
          .eq("account_id", accountId);
        await loadKnowledge();
      }
      toast({ title: "Upload failed", description: message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  }

  async function answerQuestion() {
    if (!selectedQuestion || !accountId || !answerDraft.trim()) return;
    const { error } = await supabase
      .from("owner_questions")
      .update({
        status: "answered",
        answer: answerDraft.trim(),
        answered_at: new Date().toISOString(),
      })
      .eq("id", selectedQuestion.id)
      .eq("account_id", accountId);
    if (error) {
      toast({ title: "Answer not saved", description: error.message, variant: "destructive" });
      return;
    }
    setAnswerDraft("");
    setSelectedQuestionId(null);
    await loadKnowledge();
  }

  async function dismissQuestion(question: OwnerQuestion) {
    if (!accountId) return;
    const { error } = await supabase
      .from("owner_questions")
      .update({ status: "dismissed", dismissed_at: new Date().toISOString() })
      .eq("id", question.id)
      .eq("account_id", accountId);
    if (error) {
      toast({ title: "Question not dismissed", description: error.message, variant: "destructive" });
      return;
    }
    await loadKnowledge();
  }

  async function saveLogo() {
    if (!accountId || !company || !manualLogoUrl.trim()) return;
    const { error } = await supabase
      .from("companies")
      .update({ logo_url: manualLogoUrl.trim(), logo_source: "manual" })
      .eq("id", company.id)
      .eq("account_id", accountId);
    if (error) {
      toast({ title: "Logo not saved", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Branding updated" });
    await loadKnowledge();
  }

  async function refreshAll() {
    setRefreshing(true);
    await loadKnowledge();
    setRefreshing(false);
  }

  if (accountLoading || loading) {
    return (
      <main className="flex min-h-[60vh] items-center justify-center p-6">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading knowledge workspace
        </div>
      </main>
    );
  }

  return (
    <main className="min-w-0 space-y-6 p-4 sm:p-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">Knowledge</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Ground your canvas in source material</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Upload founder documents, track parsing, answer agent questions, and inspect dossiers with visible provenance.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={refreshAll} disabled={refreshing}>
            <RefreshCw className={cn("mr-2 h-4 w-4", refreshing && "animate-spin")} />
            Refresh
          </Button>
          <Button asChild size="sm" disabled={uploading || !accountId}>
            <Label className="cursor-pointer">
              {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
              Upload document
              <Input className="sr-only" type="file" accept=".pdf,.docx,.txt,.md,text/plain,text/markdown,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={handleFileUpload} />
            </Label>
          </Button>
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[1.2fr_0.8fr_1fr_0.8fr]">
        <Metric label="Documents" value={documents.length.toString()} detail={`${distributedCount} distributed`} icon={FileText} />
        <Metric label="Dossiers" value={dossiers.length.toString()} detail={`${dossiers.filter((doc) => doc.material_change).length} changed`} icon={BookOpen} />
        <Metric label="Groundedness" value={canvasGroundedness === null ? "--" : `${canvasGroundedness}%`} detail={canvasGroundedness === null ? "No scored canvas sections yet" : "Grounded share of scored sections"} icon={ShieldCheck} />
        <Metric label="Questions" value={openQuestions.length.toString()} detail="Open owner prompts" icon={CircleHelp} />
      </section>

      <section className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)]">
        <div className="min-w-0 space-y-6">
          <DocumentPanel
            documents={documents}
            buildingDocId={buildingDocId}
            onOpen={openDocument}
            onBuildCanvas={buildCanvasFromDocument}
          />
          <DossierPanel
            dossiers={dossiers}
            profiles={profiles}
            evidenceById={evidenceById}
            onOpen={setSelectedDossier}
          />
        </div>
        <div className="min-w-0 space-y-6">
          <BrandPanel company={company} manualLogoUrl={manualLogoUrl} setManualLogoUrl={setManualLogoUrl} onSave={saveLogo} />
          <QuestionsPanel
            questions={openQuestions}
            onAnswer={(question) => {
              setSelectedQuestionId(question.id);
              setAnswerDraft(question.answer ?? "");
            }}
            onDismiss={dismissQuestion}
          />
          <GroundingWizard
            documents={documents}
            dossiers={dossiers}
            questions={openQuestions}
            groundedness={canvasGroundedness}
            onLaunch={() => setWizardOpen(true)}
          />
        </div>
      </section>

      <GroundingWizardDrawer
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        accountId={accountId}
        onGrounded={() => void loadKnowledge({ background: true })}
      />

      <DossierDrawer
        dossier={selectedDossier}
        profiles={profiles}
        evidenceById={evidenceById}
        onOpenChange={(open) => {
          if (!open) setSelectedDossier(null);
        }}
      />

      <FocusDrawer
        open={Boolean(selectedQuestion)}
        onOpenChange={(open) => {
          if (!open) setSelectedQuestionId(null);
        }}
        size="reading"
        eyebrow="Owner question"
        title={selectedQuestion?.question ?? "Owner question"}
        subtitle={selectedQuestion?.why_needed ?? undefined}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setSelectedQuestionId(null)}>Cancel</Button>
            <Button onClick={answerQuestion} disabled={!answerDraft.trim()}>Save answer</Button>
          </div>
        }
        bodyClassName="p-4 sm:p-6"
      >
        <div className="space-y-4">
          <div className="rounded-md border border-border/60 bg-muted/30 p-3 text-sm text-muted-foreground">
            {selectedQuestion?.why_needed}
          </div>
          <div className="space-y-2">
            <Label htmlFor="owner-answer">Answer</Label>
            <Textarea
              id="owner-answer"
              value={answerDraft}
              onChange={(event) => setAnswerDraft(event.target.value)}
              rows={8}
              placeholder="Add the founder truth the agent needs."
            />
          </div>
        </div>
      </FocusDrawer>
    </main>
  );
}

function Metric({ label, value, detail, icon: Icon }: { label: string; value: string; detail: string; icon: typeof FileText }) {
  return (
    <div className="rounded-lg border border-border/60 bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

function DocumentPanel({
  documents,
  buildingDocId,
  onOpen,
  onBuildCanvas,
}: {
  documents: FounderDocument[];
  buildingDocId: string | null;
  onOpen: (doc: FounderDocument) => void;
  onBuildCanvas: (doc: FounderDocument) => void;
}) {
  return (
    <section className="space-y-3">
      <SectionHeader title="Document ingestion" detail="Upload, parse, distribute" />
      {documents.length === 0 ? (
        <EmptyState icon={Upload} title="No founder documents yet" detail="Upload a deck, plan, one-pager, TXT, or Markdown file to start grounding the canvas." />
      ) : (
        <div className="space-y-3">
          {documents.map((document) => {
            const status = STATUS_COPY[document.status];
            const Icon = status.icon;
            return (
              <Card key={document.id} className="border-border/60 shadow-sm transition-shadow hover:shadow-md">
                <CardContent className="p-4">
                  <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="truncate text-sm font-semibold">{document.title}</h3>
                        <Badge variant="outline" className={cn("gap-1", status.tone)}>
                          <Icon className={cn("h-3 w-3", document.status === "parsing" && "animate-spin")} />
                          {status.label}
                        </Badge>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {document.file_name ?? "Untitled source"} · {formatBytes(document.file_size_bytes)} · {formatDate(document.created_at)}
                      </p>
                    </div>
                    <Badge variant="secondary" className="w-fit">Owner-provided</Badge>
                  </div>
                  {document.error && (
                    <p className="mt-3 rounded-md border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive">
                      {document.error}
                    </p>
                  )}
                  {document.evidence_ids.length > 0 && (
                    <p className="mt-3 text-xs text-muted-foreground">
                      Distributed into {document.evidence_ids.length} evidence-backed claims.
                    </p>
                  )}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      className="h-8 gap-1.5"
                      disabled={document.status !== "distributed" || buildingDocId !== null}
                      onClick={() => onBuildCanvas(document)}
                    >
                      {buildingDocId === document.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <LayoutGrid className="h-3.5 w-3.5" />
                      )}
                      {buildingDocId === document.id ? "Researching…" : "Build canvas from this"}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 gap-1.5 text-muted-foreground"
                      onClick={() => onOpen(document)}
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      Open file
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </section>
  );
}

function DossierPanel({
  dossiers,
  profiles,
  evidenceById,
  onOpen,
}: {
  dossiers: AgentDocument[];
  profiles: AgentProfile[];
  evidenceById: Map<string, EvidenceItem>;
  onOpen: (dossier: AgentDocument) => void;
}) {
  return (
    <section className="space-y-3">
      <SectionHeader title="Agent dossiers" detail="Verified working memory" />
      {dossiers.length === 0 ? (
        <EmptyState icon={BookOpen} title="No dossiers yet" detail="Parsed founder material will create dossiers for the relevant section agents." />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {dossiers.map((dossier) => {
            const evidence = dossier.evidence_ids.map((id) => evidenceById.get(id)).filter((item): item is EvidenceItem => Boolean(item));
            return (
              <Card key={dossier.id} className="border-border/60 shadow-sm transition-shadow hover:shadow-md">
                <CardContent className="flex h-full flex-col p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate text-sm font-semibold">{dossier.title || labelForDocKey(dossier.doc_key)}</h3>
                      <p className="mt-1 text-xs text-muted-foreground">{agentName(profiles, dossier.agent_profile_id)} · v{dossier.version}</p>
                    </div>
                    <Badge variant={dossier.material_change ? "default" : "outline"}>{dossier.material_change ? "Changed" : dossier.freshness_status}</Badge>
                  </div>
                  <p className="mt-3 line-clamp-3 text-sm text-muted-foreground">{plainText(dossier.body_md)}</p>
                  <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <Badge variant="outline" className="gap-1"><BadgeCheck className="h-3 w-3" />{evidence.length} citations</Badge>
                    <Badge variant="outline">{claimSourceLabel(dossier.claim_sources)}</Badge>
                  </div>
                  <Button className="mt-4 w-fit" variant="outline" size="sm" onClick={() => onOpen(dossier)}>
                    <BookOpen className="mr-2 h-4 w-4" />
                    Open dossier
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </section>
  );
}

function BrandPanel({
  company,
  manualLogoUrl,
  setManualLogoUrl,
  onSave,
}: {
  company: Company | null;
  manualLogoUrl: string;
  setManualLogoUrl: (value: string) => void;
  onSave: () => void;
}) {
  return (
    <section className="rounded-lg border border-border/60 bg-card p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border/60 bg-muted">
          {company?.logo_url ? <img src={company.logo_url} alt="" className="h-full w-full object-contain" /> : <ImageIcon className="h-5 w-5 text-muted-foreground" />}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold">Company branding</h2>
          <p className="mt-1 truncate text-xs text-muted-foreground">{company?.name ?? "No company profile yet"}</p>
          {company?.logo_source && <Badge variant="outline" className="mt-2">{company.logo_source.replace(/_/g, " ")}</Badge>}
        </div>
      </div>
      <div className="mt-4 space-y-2">
        <Label htmlFor="logo-url">Logo URL</Label>
        <div className="flex gap-2">
          <Input id="logo-url" value={manualLogoUrl} onChange={(event) => setManualLogoUrl(event.target.value)} placeholder="https://..." disabled={!company} />
          <Button variant="outline" onClick={onSave} disabled={!company || !manualLogoUrl.trim()}>Save</Button>
        </div>
      </div>
    </section>
  );
}

function QuestionsPanel({
  questions,
  onAnswer,
  onDismiss,
}: {
  questions: OwnerQuestion[];
  onAnswer: (question: OwnerQuestion) => void;
  onDismiss: (question: OwnerQuestion) => void;
}) {
  return (
    <section className="space-y-3">
      <SectionHeader title="Owner questions" detail="Max three open per agent" />
      {questions.length === 0 ? (
        <EmptyState icon={MessageSquare} title="No open questions" detail="Agents will ask only when they need a founder truth they cannot research." />
      ) : (
        <div className="space-y-3">
          {questions.map((question) => (
            <Card key={question.id} className="border-border/60 shadow-sm">
              <CardContent className="p-4">
                <h3 className="text-sm font-semibold">{question.question}</h3>
                <p className="mt-2 text-xs text-muted-foreground">{question.why_needed}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => onAnswer(question)}>Answer</Button>
                  <Button size="sm" variant="ghost" onClick={() => onDismiss(question)}>Dismiss</Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}

function GroundingWizard({
  documents,
  dossiers,
  questions,
  groundedness,
  onLaunch,
}: {
  documents: FounderDocument[];
  dossiers: AgentDocument[];
  questions: OwnerQuestion[];
  groundedness: number | null;
  onLaunch: () => void;
}) {
  const hasUpload = documents.length > 0;
  const hasDistributed = documents.some((document) => document.status === "distributed");
  const hasDossiers = dossiers.length > 0;
  const hasOpenQuestions = questions.length > 0;
  const steps = [
    { label: "Upload owner source", done: hasUpload },
    { label: "Parse and distribute", done: hasDistributed },
    { label: "Review dossiers", done: hasDossiers },
    { label: "Resolve open questions", done: !hasOpenQuestions },
    { label: "Confirm real names", done: groundedness === 100 },
  ];
  const complete = steps.filter((step) => step.done).length;
  return (
    <section className="rounded-lg border border-border/60 bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Grounding wizard</h2>
          <p className="mt-1 text-xs text-muted-foreground">Spec 08 path from founder evidence to trusted canvas.</p>
        </div>
        <ShieldCheck className="h-5 w-5 text-primary" />
      </div>
      <Progress value={(complete / steps.length) * 100} className="mt-4" />
      <div className="mt-4 space-y-2">
        {steps.map((step) => (
          <div key={step.label} className="flex items-center gap-2 text-sm">
            {step.done ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <Clock3 className="h-4 w-4 text-muted-foreground" />}
            <span className={step.done ? "text-foreground" : "text-muted-foreground"}>{step.label}</span>
          </div>
        ))}
      </div>
      <Button className="mt-4 w-full" size="sm" onClick={onLaunch}>
        <ShieldCheck className="mr-2 h-4 w-4" />
        Ground your canvas
      </Button>
    </section>
  );
}

function DossierDrawer({
  dossier,
  profiles,
  evidenceById,
  onOpenChange,
}: {
  dossier: AgentDocument | null;
  profiles: AgentProfile[];
  evidenceById: Map<string, EvidenceItem>;
  onOpenChange: (open: boolean) => void;
}) {
  const citations = dossier?.evidence_ids.map((id) => evidenceById.get(id)).filter((item): item is EvidenceItem => Boolean(item)) ?? [];
  return (
    <FocusDrawer
      open={Boolean(dossier)}
      onOpenChange={onOpenChange}
      size="reading"
      eyebrow={dossier ? agentName(profiles, dossier.agent_profile_id) : "Dossier"}
      title={dossier?.title ?? "Dossier"}
      subtitle={dossier ? `${labelForDocKey(dossier.doc_key)} · v${dossier.version}` : undefined}
      bodyClassName="p-4 sm:p-6"
    >
      {dossier && (
        <article className="space-y-6">
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">{claimSourceLabel(dossier.claim_sources)}</Badge>
            <Badge variant="outline">{dossier.freshness_status}</Badge>
            {dossier.material_change && <Badge>Material change</Badge>}
          </div>
          <div className="whitespace-pre-wrap text-sm leading-6 text-foreground">{dossier.body_md}</div>
          <section className="space-y-3 border-t border-border pt-4">
            <h3 className="text-sm font-semibold">Citations</h3>
            {citations.length === 0 ? (
              <p className="text-sm text-muted-foreground">No citations attached to this dossier yet.</p>
            ) : (
              <div className="space-y-3">
                {citations.map((item) => (
                  <div key={item.id} className="rounded-md border border-border/60 bg-muted/20 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm font-medium">{item.title}</p>
                      {item.source_url && (
                        <a className="shrink-0 text-muted-foreground hover:text-primary" href={item.source_url} target="_blank" rel="noreferrer" aria-label="Open source">
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      )}
                    </div>
                    {item.excerpt && <p className="mt-2 text-xs leading-5 text-muted-foreground">{item.excerpt}</p>}
                    <p className="mt-2 text-xs text-muted-foreground">{item.source_name ?? "Owner document"} · {formatDate(item.retrieved_at)}</p>
                  </div>
                ))}
              </div>
            )}
          </section>
        </article>
      )}
    </FocusDrawer>
  );
}

function SectionHeader({ title, detail }: { title: string; detail: string }) {
  return (
    <div>
      <h2 className="text-base font-semibold tracking-tight">{title}</h2>
      <p className="text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

function EmptyState({ icon: Icon, title, detail }: { icon: typeof FileText; title: string; detail: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-card p-6 text-center">
      <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-muted">
        <Icon className="h-5 w-5 text-muted-foreground" />
      </div>
      <h3 className="mt-3 text-sm font-semibold">{title}</h3>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{detail}</p>
    </div>
  );
}

function pickOrchestratorProfile(profiles: AgentProfile[], accountId: string): AgentProfile | undefined {
  return profiles.find((profile) => profile.agent_key === "orchestrator" && profile.account_id === accountId)
    ?? profiles.find((profile) => profile.agent_key === "orchestrator")
    ?? profiles.find((profile) => profile.account_id === accountId);
}

function agentName(profiles: AgentProfile[], id: string): string {
  return profiles.find((profile) => profile.id === id)?.display_name ?? "Agent";
}

function labelForDocKey(key: string): string {
  return DOC_KEY_LABELS[key] ?? key.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function claimSourceLabel(value: Json): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "Provenance unknown";
  const source = (value as Record<string, unknown>).default;
  return source === "owner_provided" ? "Owner-provided" : source === "researched" ? "Researched" : "Mixed provenance";
}

function stripExtension(name: string): string {
  return name.replace(/\.[^.]+$/, "");
}

function plainText(markdown: string): string {
  return markdown.replace(/[#*_`>-]/g, "").replace(/\s+/g, " ").trim();
}

function formatDate(value: string | null): string {
  if (!value) return "Not dated";
  return new Date(value).toLocaleDateString();
}

function formatBytes(value: number | null): string {
  if (!value) return "Unknown size";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}
