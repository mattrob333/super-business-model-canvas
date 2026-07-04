import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, ExternalLink, GitCompareArrows, Lightbulb, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useAccountId } from "@/hooks/useAccountId";
import { useCanvasEvidence } from "@/hooks/useCanvasEvidence";
import { useCompetitorCanvasEvidence } from "@/hooks/useCompetitorCanvasEvidence";
import { supabase } from "@/integrations/supabase/client";
import { supabaseUntyped } from "@/lib/supabase-untyped";
import {
  CANVAS_SECTION_AGENT_KEYS,
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
  const ownCanvas = useCanvasEvidence();
  const { competitor, itemsBySection, metrics, loading } = useCompetitorCanvasEvidence(competitorId);

  const threat = metrics.find((metric) => metric.metric_key === "competitor.threat_index");
  const sectionDeltaCount = metrics.filter((metric) => metric.metric_key === "competitor.section_delta").length;
  const populatedSections = useMemo(
    () => CANVAS_SECTION_KEYS.filter((key) => (itemsBySection[key]?.length ?? 0) > 0).length,
    [itemsBySection],
  );

  const borrowIdea = async (sectionKey: CanvasSectionKey, item: CanvasItemEvidence) => {
    if (!accountId) return;
    setBorrowingKey(`${sectionKey}:${item.text}`);
    try {
      const agentKey = CANVAS_SECTION_AGENT_KEYS[sectionKey];
      const { data: profile, error: profileError } = await supabase
        .from("agent_profiles")
        .select("id")
        .eq("agent_key", agentKey)
        .or(`account_id.eq.${accountId},account_id.is.null`)
        .limit(1)
        .maybeSingle();
      if (profileError || !profile) throw new Error(profileError?.message ?? "No section agent found");

      const { data: thread, error: threadError } = await supabaseUntyped
        .from<ThreadRow>("workspace_threads")
        .insert({
          account_id: accountId,
          agent_profile_id: profile.id,
          title: `Explore ${competitor?.name ?? "competitor"} idea`,
        })
        .select("id")
        .single();
      if (threadError) throw new Error(threadError.message);

      const { error: messageError } = await supabaseUntyped.from("workspace_messages").insert({
        thread_id: thread.id,
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
            <p className="text-sm text-muted-foreground">
              No account-scoped competitor was found for this route.
            </p>
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
          <div>
            <h1 className="break-words text-2xl font-semibold tracking-tight">{competitor.name}</h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Competitor Business Model Canvas with evidence-linked items and gap-engine comparison.
            </p>
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
        <MetricCard label="Section Deltas" value={String(sectionDeltaCount)} />
        <MetricCard label="Freshness" value="Verified" />
      </section>

      <section className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
        {CANVAS_SECTION_KEYS.map((sectionKey) => (
          <SectionCompareCard
            key={sectionKey}
            sectionKey={sectionKey}
            competitorName={competitor.name}
            competitorItems={itemsBySection[sectionKey] ?? []}
            ownItems={compareMode ? ownCanvas.itemsBySection[sectionKey] ?? [] : []}
            compareMode={compareMode}
            borrowingKey={borrowingKey}
            onBorrow={borrowIdea}
          />
        ))}
      </section>
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

function SectionCompareCard({
  sectionKey,
  competitorName,
  competitorItems,
  ownItems,
  compareMode,
  borrowingKey,
  onBorrow,
}: {
  sectionKey: CanvasSectionKey;
  competitorName: string;
  competitorItems: CanvasItemEvidence[];
  ownItems: CanvasItemEvidence[];
  compareMode: boolean;
  borrowingKey: string | null;
  onBorrow: (sectionKey: CanvasSectionKey, item: CanvasItemEvidence) => void;
}) {
  return (
    <Card className="border-border/60 bg-card shadow-sm transition-shadow hover:shadow-md">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-3">
          <CardTitle className="text-sm font-semibold">{CANVAS_SECTION_LABELS[sectionKey]}</CardTitle>
          <Badge variant="outline" className="shrink-0 text-[10px]">
            {competitorItems.length} items
          </Badge>
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
  onBorrow?: (sectionKey: CanvasSectionKey, item: CanvasItemEvidence) => void;
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
          {items.map((item) => {
            const key = `${sectionKey}:${item.text}`;
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
                    <Badge variant="outline" className="text-[10px]">
                      {item.evidence?.length} evidence
                    </Badge>
                  )}
                  {onBorrow && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="ml-auto h-7 px-2 text-xs"
                      disabled={busy}
                      onClick={() => onBorrow(sectionKey, item)}
                    >
                      {busy ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Lightbulb className="mr-1 h-3 w-3" />}
                      Explore
                    </Button>
                  )}
                </div>
                {item.evidence?.[0] && (
                  <div className="mt-3 rounded-md border border-border/50 bg-muted/30 p-2">
                    <div className="flex items-start justify-between gap-2">
                      <p className="min-w-0 break-words text-xs font-medium text-foreground/80">
                        {item.evidence[0].sourceName ?? item.evidence[0].title}
                      </p>
                      {item.evidence[0].sourceUrl && (
                        <a
                          href={item.evidence[0].sourceUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
                          aria-label="Open evidence source"
                        >
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                    <p className="mt-1 line-clamp-3 break-words text-xs leading-relaxed text-muted-foreground">
                      {item.evidence[0].excerpt}
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
