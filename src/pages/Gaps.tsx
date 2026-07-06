import { useState, useMemo, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertTriangle,
  Filter,
  ArrowUpDown,
  Circle,
  Clock,
  CheckCircle2,
  Lightbulb,
  Loader2,
  XCircle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAccountId } from "@/hooks/useAccountId";
import { useToast } from "@/hooks/use-toast";
import { CANVAS_SECTION_LABELS } from "@/components/canvas/section-types";
import type { Database } from "@/integrations/supabase/types";

/**
 * Gap Register page (/gaps)
 *
 * The working queue for strategic gaps — today primarily competitive gaps
 * from the gap engine (a specific competitor advantage your canvas doesn't
 * cover, scored by impact/effort/confidence). Owners triage each gap:
 * acknowledge, resolve, or dismiss.
 */

type GapType = Database["public"]["Enums"]["gap_type"];
type GapSeverity = Database["public"]["Enums"]["gap_severity"];
type GapStatus = Database["public"]["Enums"]["gap_status"];

interface GapItem {
  id: string;
  title: string;
  description: string | null;
  gap_type: GapType;
  severity: GapSeverity;
  status: GapStatus;
  impact: string | null;
  effort: string | null;
  confidence: number | null;
  affected_sections: string[];
  recommended_action: string | null;
  created_at: string;
}

const SEVERITY_CONFIG: Record<
  GapSeverity,
  { label: string; className: string; icon: typeof AlertTriangle }
> = {
  critical: {
    label: "Critical",
    className: "bg-destructive/10 text-destructive border-destructive/20",
    icon: AlertTriangle,
  },
  high: {
    label: "High",
    className: "bg-warning/10 text-warning border-warning/20",
    icon: AlertTriangle,
  },
  medium: {
    label: "Medium",
    className: "bg-muted text-muted-foreground border-border",
    icon: Clock,
  },
  low: {
    label: "Low",
    className: "bg-muted/50 text-muted-foreground border-border/50",
    icon: Circle,
  },
};

const STATUS_CONFIG: Record<
  GapStatus,
  { label: string; className: string; icon: typeof Circle }
> = {
  open: {
    label: "Open",
    className: "bg-destructive/10 text-destructive",
    icon: Circle,
  },
  acknowledged: {
    label: "Acknowledged",
    className: "bg-warning/10 text-warning",
    icon: Clock,
  },
  in_progress: {
    label: "In Progress",
    className: "bg-primary/10 text-primary",
    icon: ArrowUpDown,
  },
  resolved: {
    label: "Resolved",
    className: "bg-success/10 text-success",
    icon: CheckCircle2,
  },
  wont_fix: {
    label: "Won't Fix",
    className: "bg-muted text-muted-foreground",
    icon: XCircle,
  },
  superseded: {
    label: "Superseded",
    className: "bg-muted/50 text-muted-foreground",
    icon: XCircle,
  },
};

const GAP_TYPE_LABELS: Record<GapType, string> = {
  missing_data: "Missing Data",
  low_confidence: "Low Confidence",
  no_evidence: "No Evidence",
  outdated: "Outdated",
  contradictory: "Contradictory",
  assumption: "Assumption",
  competitive: "Competitive",
};

export default function Gaps() {
  const { accountId } = useAccountId();
  const { toast } = useToast();
  const [filterSeverity, setFilterSeverity] = useState<GapSeverity | "all">(
    "all",
  );
  const [filterStatus, setFilterStatus] = useState<GapStatus | "all">("all");
  const [gaps, setGaps] = useState<GapItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  useEffect(() => {
    if (!accountId) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("gaps")
        .select(
          "id, title, description, gap_type, severity, status, impact, effort, confidence, affected_sections, recommended_action, created_at",
        )
        .eq("account_id", accountId)
        .neq("status", "superseded")
        .order("created_at", { ascending: false })
        .limit(200);
      if (cancelled) return;
      setGaps(error ? [] : ((data ?? []) as GapItem[]));
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [accountId]);

  const setGapStatus = useCallback(async (gap: GapItem, status: GapStatus) => {
    if (!accountId) return;
    setUpdatingId(gap.id);
    const { data, error } = await supabase
      .from("gaps")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", gap.id)
      .eq("account_id", accountId)
      .select("id");
    setUpdatingId(null);
    if (error || !data || data.length === 0) {
      toast({
        title: "Gap was not updated",
        description: error?.message ?? "Update matched zero rows.",
        variant: "destructive",
      });
      return;
    }
    setGaps((current) => current.map((item) => (item.id === gap.id ? { ...item, status } : item)));
  }, [accountId, toast]);

  const filteredGaps = useMemo(() => {
    return gaps.filter((g) => {
      if (filterSeverity !== "all" && g.severity !== filterSeverity)
        return false;
      if (filterStatus !== "all" && g.status !== filterStatus) return false;
      return true;
    });
  }, [gaps, filterSeverity, filterStatus]);

  const stats = useMemo(() => {
    return {
      total: gaps.length,
      critical: gaps.filter((g) => g.severity === "critical").length,
      open: gaps.filter((g) => g.status === "open").length,
      inProgress: gaps.filter((g) => g.status === "in_progress").length,
      resolved: gaps.filter((g) => g.status === "resolved").length,
    };
  }, [gaps]);

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Page heading */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Gap Register
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Your working queue of competitive weaknesses, found automatically and
          backed by evidence.
        </p>
      </div>

      {/* What is a gap? — this is a new concept; teach it where it lives. */}
      <div className="flex items-start gap-3 rounded-lg border border-primary/20 bg-primary/5 p-4">
        <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <div className="space-y-1 text-sm leading-relaxed">
          <p className="font-medium">What is a gap?</p>
          <p className="text-muted-foreground">
            When you research a competitor, the gap engine compares their canvas against
            yours, section by section. A <span className="font-medium text-foreground">gap</span> is
            a specific thing they do that your business model doesn&rsquo;t cover — each one cites
            the evidence it was found in and is scored by how much it matters (severity).
            Your job here is to triage: <span className="font-medium text-foreground">Acknowledge</span> it
            while you decide, <span className="font-medium text-foreground">Resolve</span> it once your
            canvas answers it, or <span className="font-medium text-foreground">Dismiss</span> it if it
            doesn&rsquo;t apply to you. Open gaps lower your Strategic Health Score.
          </p>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-muted-foreground">
                Total Gaps
              </p>
              <AlertTriangle className="h-4 w-4 text-muted-foreground" />
            </div>
            <p className="text-2xl font-semibold mt-2">{stats.total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-muted-foreground">
                Critical
              </p>
              <AlertTriangle className="h-4 w-4 text-destructive" />
            </div>
            <p className="text-2xl font-semibold mt-2 text-destructive">
              {stats.critical}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-muted-foreground">
                In Progress
              </p>
              <ArrowUpDown className="h-4 w-4 text-primary" />
            </div>
            <p className="text-2xl font-semibold mt-2 text-primary">
              {stats.inProgress}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-muted-foreground">
                Resolved
              </p>
              <CheckCircle2 className="h-4 w-4 text-success" />
            </div>
            <p className="text-2xl font-semibold mt-2 text-success">
              {stats.resolved}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Filter className="h-4 w-4" />
          Filter:
        </div>
        <select
          value={filterSeverity}
          onChange={(e) =>
            setFilterSeverity(e.target.value as GapSeverity | "all")
          }
          className="h-8 rounded-md border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="all">All Severities</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <select
          value={filterStatus}
          onChange={(e) =>
            setFilterStatus(e.target.value as GapStatus | "all")
          }
          className="h-8 rounded-md border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="all">All Statuses</option>
          <option value="open">Open</option>
          <option value="acknowledged">Acknowledged</option>
          <option value="in_progress">In Progress</option>
          <option value="resolved">Resolved</option>
          <option value="wont_fix">Won't Fix</option>
        </select>
      </div>

      {/* Loading / empty states */}
      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : filteredGaps.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-4">
              <AlertTriangle className="h-6 w-6 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-medium mb-2">
              {gaps.length === 0 ? "No gaps yet" : "Nothing matches these filters"}
            </h3>
            <p className="text-sm text-muted-foreground max-w-md mb-6">
              {gaps.length === 0
                ? "Research a competitor from the Canvas page — the gap engine compares their business model against yours and files what it finds here."
                : "Clear the severity or status filter to see the rest of the register."}
            </p>
          </CardContent>
        </Card>
      ) : null}

      {/* Gap list */}
      {filteredGaps.length > 0 && (
        <div className="flex flex-col gap-3">
          {filteredGaps.map((gap) => {
            const sevCfg = SEVERITY_CONFIG[gap.severity];
            const statusCfg = STATUS_CONFIG[gap.status];
            return (
              <Card key={gap.id}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <h3 className="text-sm font-semibold">{gap.title}</h3>
                        <Badge
                          variant="outline"
                          className={`text-xs ${sevCfg.className}`}
                        >
                          <sevCfg.icon className="h-3 w-3 mr-1" />
                          {sevCfg.label}
                        </Badge>
                        <Badge
                          variant="outline"
                          className={`text-xs ${statusCfg.className}`}
                        >
                          <statusCfg.icon className="h-3 w-3 mr-1" />
                          {statusCfg.label}
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          {GAP_TYPE_LABELS[gap.gap_type]}
                        </Badge>
                      </div>
                      {gap.description && (
                        <p className="text-sm text-muted-foreground mb-2">
                          {gap.description}
                        </p>
                      )}
                      {gap.affected_sections.length > 0 && (
                        <div className="flex items-center gap-1.5 flex-wrap mt-2">
                          <span className="text-xs text-muted-foreground">
                            Sections:
                          </span>
                          {gap.affected_sections.map((s) => (
                            <Badge
                              key={s}
                              variant="secondary"
                              className="text-xs"
                            >
                              {(CANVAS_SECTION_LABELS as Record<string, string>)[s] ?? s}
                            </Badge>
                          ))}
                        </div>
                      )}
                      {gap.recommended_action && (
                        <p className="text-xs text-muted-foreground mt-2 italic">
                          Recommended: {gap.recommended_action}
                        </p>
                      )}
                      {(gap.status === "open" || gap.status === "acknowledged" || gap.status === "in_progress") && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {gap.status === "open" && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 gap-1 px-2 text-xs"
                              disabled={updatingId === gap.id}
                              onClick={() => void setGapStatus(gap, "acknowledged")}
                            >
                              <Clock className="h-3 w-3" />
                              Acknowledge
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 gap-1 px-2 text-xs text-success hover:text-success"
                            disabled={updatingId === gap.id}
                            onClick={() => void setGapStatus(gap, "resolved")}
                          >
                            <CheckCircle2 className="h-3 w-3" />
                            Resolve
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 gap-1 px-2 text-xs text-muted-foreground"
                            disabled={updatingId === gap.id}
                            onClick={() => void setGapStatus(gap, "wont_fix")}
                          >
                            {updatingId === gap.id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <XCircle className="h-3 w-3" />
                            )}
                            Dismiss
                          </Button>
                        </div>
                      )}
                    </div>
                    {gap.confidence !== null && (
                      <div className="text-right shrink-0">
                        <p className="text-xs text-muted-foreground">
                          Confidence
                        </p>
                        <p className="text-sm font-medium">
                          {Math.round(gap.confidence * 100)}%
                        </p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
