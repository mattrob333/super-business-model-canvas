import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, ExternalLink, FileText, GitCompareArrows, Lightbulb, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";
import { useAccountId } from "@/hooks/useAccountId";
import { useCanvasEvidence } from "@/hooks/useCanvasEvidence";
import { useCompetitorCanvasEvidence } from "@/hooks/useCompetitorCanvasEvidence";
import { supabase } from "@/integrations/supabase/client";
import { cleanExcerpt } from "@/lib/clean-excerpt";
import { supabaseUntyped } from "@/lib/supabase-untyped";
import {
  CANVAS_SECTION_AGENT_KEYS,
  CANVAS_SECTION_GRID_PLACEMENT,
  CANVAS_SECTION_KEYS,
  CANVAS_SECTION_LABELS,
  type CanvasSectionKey,
} from "@/components/canvas/section-types";
import type { CanvasItemEvidence } from "@/components/canvas/CanvasSectionCard";

interface ThreadRow {
  id: string;
}

export default function CompetitorCanvas() {
  const { competitorId } = useParams();
  const { accountId } = useAccountId();
  const { toast } = useToast();
  const [compareMode, setCompareMode] = useState(false);
  const [borrowingKey, setBorrowingKey] = useState<string | null>(null);
  // Own-canvas fan-out only runs when compare mode needs it (RF-4-13).
  const ownCanvas = useCanvasEvidence({ enabled: compareMode });
  const { competitor, itemsBySection, freshnessBySection, metrics, loading, error } =
    useCompetitorCanvasEvidence(competitorId);

  const threat = metrics.find((metric) => metric.metric_key === "competitor.threat_index");
  const sectionDeltas = useMemo(
    () => metrics.filter((metric) => metric.metric_key === "competitor.section_delta"),
    [metrics],
  );
  const populatedSections = useMemo(
    () => CANVAS_SECTION_KEYS.filter((key) => (itemsBySection[key]?.length ?? 0) > 0).length,
    [itemsBySection],
  );
  // Honest freshness (RF-4-6): derived from real per-section freshness_status.
  const freshnessLabel = useMemo(() => {
    // Runtime values include "verified" (worker writes) beyond the typed union.
    const statuses = CANVAS_SECTION_KEYS
      .map((key) => freshnessBySection[key] as string | undefined)
      .filter((status): status is string => Boolean(status));
    if (statuses.length === 0) return "--";
    if (statuses.every((status) => status === "verified" || status === "fresh")) return "Verified";
    if (statuses.some((status) => status === "outdated")) return "Outdated";
    if (statuses.some((status) => status === "stale")) return "Stale";
    return "Mixed";
  }, [freshnessBySection]);

  const borrowIdea = async (sectionKey: CanvasSectionKey, item: CanvasItemEvidence, index: number) => {
    if (!accountId) return;
    setBorrowingKey(`${sectionKey}:${index}`);
    try {
      const agentKey = CANVAS_SECTION_AGENT_KEYS[sectionKey];
      // Account-scoped profile wins over the global template (deterministic, RF-4-13).
      const { data: profiles, error: profileError } = await supabase
        .from("agent_profiles")
        .select("id")
        .eq("agent_key", agentKey)
        .or(`account_id.eq.${accountId},account_id.is.null`)
        .order("account_id", { ascending: false, nullsFirst: false })
        .limit(1);
      const profile = profiles?.[0];
      if (profileError || !profile) throw new Error(profileError?.message ?? "No section agent found");

      // Borrowed ideas land in the section's DEFAULT thread (RF-4-4): reuse the
      // agent's earliest active thread; create it once if the room has none yet.
      const { data: existingThreads } = await supabaseUntyped
        .from<ThreadRow>("workspace_threads")
        .select("id")
        .eq("account_id", accountId)
        .eq("agent_profile_id", profile.id)
        .eq("archived", false)
        .order("created_at", { ascending: true })
        .limit(1);
      let threadId = existingThreads?.[0]?.id;
      if (!threadId) {
        const { data: { user } } = await supabase.auth.getUser();
        const { data: thread, error: threadError } = await supabaseUntyped
          .from<ThreadRow>("workspace_threads")
          .insert({
            account_id: accountId,
            agent_profile_id: profile.id,
            title: `${CANVAS_SECTION_LABELS[sectionKey]} workspace`,
            created_by: user?.id ?? null,
          })
          .select("id")
          .single();
        if (threadError || !thread) throw new Error(threadError?.message ?? "Failed to create thread");
        threadId = thread.id;
      }

      const { error: messageError } = await supabaseUntyped.from("workspace_messages").insert({
        thread_id: threadId,
        role: "user",
        kind: "proposal",
        content: {
          type: "borrow_competitor_idea",
          competitor_id: competitorId,
          competitor_name: competitor?.name,
          section_key: sectionKey,
          section_label: CANVAS_SECTION_LABELS[sectionKey],
          idea: item.text,
          prompt: `Evaluate whether we should adapt this competitor idea: ${item.text}`,
        },
      });
      if (messageError) throw new Error(messageError.message);

      toast({ title: "Idea sent to section agent", description: "It landed as a proposal message." });
    } catch (error) {
      toast({
        title: "Could not create proposal",
        description: error instanceof Error ? error.message : "Try again from the section workspace.",
        variant: "destructive",
      });
    } finally {
      setBorrowingKey(null);
    }
  };

  if (loading) {
    return (
      <div className="bg-grid-subtle flex min-h-full items-center justify-center p-6">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!competitor) {
    return (
      <div className="bg-grid-subtle min-h-full p-6">
        <Card className="border-border/60 bg-card shadow-sm">
          <CardContent className="py-10">
            {error ? (
              <p className="text-sm text-destructive" role="alert">
                Could not load this competitor: {error}. Check your connection and reload.
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                No account-scoped competitor was found for this route.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="bg-grid-subtle min-h-full space-y-5 p-4 sm:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0 space-y-2">
          <Button variant="ghost" size="sm" asChild className="w-fit px-0 text-muted-foreground">
            <Link to="/dashboard">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Dashboard
            </Link>
          </Button>
          <div className="flex items-start gap-3">
            {competitor.logo_url && (
              <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-card shadow-sm">
                <img src={competitor.logo_url} alt="" className="h-full w-full object-contain" />
              </div>
            )}
            <div>
            <h1 className="break-words text-2xl font-semibold tracking-tight">{competitor.name}</h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              How this competitor runs their business, rebuilt from live research — every item links to its evidence. Compare it against your canvas to spot threats and gaps.
            </p>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {competitor.website_url && (
            <Button variant="outline" size="sm" asChild>
              <a href={competitor.website_url} target="_blank" rel="noreferrer">
                <ExternalLink className="mr-2 h-4 w-4" />
                Website
              </a>
            </Button>
          )}
          <Button
            variant={compareMode ? "default" : "outline"}
            size="sm"
            onClick={() => setCompareMode((value) => !value)}
          >
            <GitCompareArrows className="mr-2 h-4 w-4" />
            Compare
          </Button>
        </div>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Threat Index" value={threat ? String(Math.round(threat.value)) : "--"} />
        <MetricCard label="BMC Sections" value={`${populatedSections}/9`} />
        <MetricCard label="Section Deltas" value={String(sectionDeltas.length)} />
        <MetricCard label="Freshness" value={freshnessLabel} />
      </section>

      {/* Same silhouette as the main canvas so the competitor view reads as
          "their BMC", not a generic card list. Compare mode needs the width
          for side-by-side columns, so it keeps the wide grid. */}
      {compareMode ? (
        <section className="grid gap-3 lg:grid-cols-2">
          {CANVAS_SECTION_KEYS.map((sectionKey) => (
            <SectionCompareCard
              key={sectionKey}
              sectionKey={sectionKey}
              competitorName={competitor.name}
              competitorItems={itemsBySection[sectionKey] ?? []}
              ownItems={ownCanvas.itemsBySection[sectionKey] ?? []}
              compareMode
              deltaScore={sectionDeltas.find((metric) => metric.section_key === sectionKey)?.value}
              borrowingKey={borrowingKey}
              onBorrow={borrowIdea}
            />
          ))}
        </section>
      ) : (
        <section className="space-y-3">
          <div className="grid gap-3 md:grid-cols-5 md:grid-rows-2">
            {CANVAS_SECTION_KEYS.filter(
              (key) => key !== "cost_structure" && key !== "revenue_streams",
            ).map((sectionKey) => (
              <div key={sectionKey} className={`min-w-0 ${CANVAS_SECTION_GRID_PLACEMENT[sectionKey]}`}>
                <SectionCompareCard
                  sectionKey={sectionKey}
                  competitorName={competitor.name}
                  competitorItems={itemsBySection[sectionKey] ?? []}
                  ownItems={[]}
                  compareMode={false}
                  deltaScore={sectionDeltas.find((metric) => metric.section_key === sectionKey)?.value}
                  borrowingKey={borrowingKey}
                  onBorrow={borrowIdea}
                />
              </div>
            ))}
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {(["cost_structure", "revenue_streams"] as const).map((sectionKey) => (
              <SectionCompareCard
                key={sectionKey}
                sectionKey={sectionKey}
                competitorName={competitor.name}
                competitorItems={itemsBySection[sectionKey] ?? []}
                ownItems={[]}
                compareMode={false}
                deltaScore={sectionDeltas.find((metric) => metric.section_key === sectionKey)?.value}
                borrowingKey={borrowingKey}
                onBorrow={borrowIdea}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <Card className="border-border/60 bg-card shadow-sm">
      <CardContent className="p-4">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
      </CardContent>
    </Card>
  );
}

interface SectionVerdict {
  label: string;
  className: string;
}

/**
 * Win/lose verdict (RF-4-3), derived from the gap engine's section_delta metric:
 * the delta is the average score of open competitive gaps in this section, so a
 * high delta means the competitor has strong items your canvas doesn't cover.
 */
function sectionVerdict(deltaScore: number | undefined, competitorCount: number): SectionVerdict | null {
  if (competitorCount === 0) return null;
  if (typeof deltaScore !== "number") {
    return { label: "Covered", className: "bg-success/10 text-success border-success/30" };
  }
  if (deltaScore >= 45) return { label: "They lead", className: "bg-destructive/10 text-destructive border-destructive/30" };
  if (deltaScore >= 20) return { label: "Contested", className: "bg-warning/10 text-warning border-warning/30" };
  return { label: "Slight edge", className: "bg-muted text-muted-foreground border-border" };
}

function SectionCompareCard({
  sectionKey,
  competitorName,
  competitorItems,
  ownItems,
  compareMode,
  deltaScore,
  borrowingKey,
  onBorrow,
}: {
  sectionKey: CanvasSectionKey;
  competitorName: string;
  competitorItems: CanvasItemEvidence[];
  ownItems: CanvasItemEvidence[];
  compareMode: boolean;
  deltaScore?: number;
  borrowingKey: string | null;
  onBorrow: (sectionKey: CanvasSectionKey, item: CanvasItemEvidence, index: number) => void;
}) {
  const verdict = compareMode ? sectionVerdict(deltaScore, competitorItems.length) : null;
  return (
    <Card className="h-full border-border/60 bg-card shadow-sm transition-shadow hover:shadow-md">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-3">
          <CardTitle className="text-sm font-semibold">{CANVAS_SECTION_LABELS[sectionKey]}</CardTitle>
          <div className="flex shrink-0 items-center gap-1.5">
            {verdict && (
              <Badge variant="outline" className={`text-[10px] ${verdict.className}`} title="Based on the latest gap-engine comparison">
                {verdict.label}
              </Badge>
            )}
            <Badge variant="outline" className="text-[10px]">
              {competitorItems.length} items
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className={compareMode ? "grid gap-4 md:grid-cols-2" : "space-y-3"}>
        <ItemColumn
          title={competitorName}
          items={competitorItems}
          empty="No competitor evidence yet. Run competitor research to populate this section."
          sectionKey={sectionKey}
          borrowingKey={borrowingKey}
          onBorrow={onBorrow}
        />
        {compareMode && (
          <ItemColumn
            title="Your canvas"
            items={ownItems}
            empty="No own-canvas version yet for this section."
            sectionKey={sectionKey}
          />
        )}
      </CardContent>
    </Card>
  );
}

function ItemColumn({
  title,
  items,
  empty,
  sectionKey,
  borrowingKey,
  onBorrow,
}: {
  title: string;
  items: CanvasItemEvidence[];
  empty: string;
  sectionKey: CanvasSectionKey;
  borrowingKey?: string | null;
  onBorrow?: (sectionKey: CanvasSectionKey, item: CanvasItemEvidence, index: number) => void;
}) {
  return (
    <div className="min-w-0 space-y-2">
      <p className="text-xs font-medium text-muted-foreground">{title}</p>
      {items.length === 0 ? (
        <p className="rounded-md border border-dashed border-border/70 p-3 text-xs leading-relaxed text-muted-foreground">
          {empty}
        </p>
      ) : (
        <div className="space-y-2">
          {items.map((item, index) => {
            const key = `${sectionKey}:${index}`;
            const busy = borrowingKey === key;
            return (
              <div key={key} className="rounded-md border border-border/60 p-3">
                <p className="break-words text-sm leading-relaxed text-foreground/85">{item.text}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {typeof item.confidence === "number" && (
                    <Badge variant="secondary" className="text-[10px]">
                      {Math.round(item.confidence * 100)}%
                    </Badge>
                  )}
                  {(item.evidence?.length ?? 0) > 0 && (
                    <EvidenceBadge evidence={item.evidence ?? []} />
                  )}
                  {onBorrow && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="ml-auto h-7 px-2 text-xs"
                      disabled={busy}
                      onClick={() => onBorrow(sectionKey, item, index)}
                    >
                      {busy ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Lightbulb className="mr-1 h-3 w-3" />}
                      Explore
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function EvidenceBadge({ evidence }: { evidence: NonNullable<CanvasItemEvidence["evidence"]> }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
          aria-label={`${evidence.length} evidence source${evidence.length === 1 ? "" : "s"}`}
        >
          <FileText className="h-3 w-3" />
          {evidence.length}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 space-y-3 p-3">
        {evidence.map((entry) => (
          <div key={entry.id} className="space-y-1">
            <div className="flex items-start justify-between gap-2">
              <p className="min-w-0 text-xs font-semibold leading-snug">
                {entry.sourceName ?? entry.title}
              </p>
              {entry.sourceUrl && (
                <a
                  href={entry.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
                  aria-label="Open evidence source"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}
            </div>
            {entry.excerpt && (
              <p className="line-clamp-4 text-xs leading-relaxed text-muted-foreground">
                {cleanExcerpt(entry.excerpt)}
              </p>
            )}
          </div>
        ))}
      </PopoverContent>
    </Popover>
  );
}
