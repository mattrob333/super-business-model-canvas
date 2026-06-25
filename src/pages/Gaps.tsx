import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertTriangle,
  Plus,
  Filter,
  ArrowUpDown,
  Circle,
  Clock,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import type { Database } from "@/integrations/supabase/types";

/**
 * Gap Register page (/gaps)
 *
 * Shows all strategic gaps across the canvas sections. Gaps are typed
 * (missing_data, low_confidence, no_evidence, outdated, contradictory,
 * assumption) with severity levels and status tracking.
 *
 * Data source: `gaps` table (Phase 2 schema). Currently shows empty state
 * until agent runs start producing gaps.
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
};

const GAP_TYPE_LABELS: Record<GapType, string> = {
  missing_data: "Missing Data",
  low_confidence: "Low Confidence",
  no_evidence: "No Evidence",
  outdated: "Outdated",
  contradictory: "Contradictory",
  assumption: "Assumption",
};

export default function Gaps() {
  const [filterSeverity, setFilterSeverity] = useState<GapSeverity | "all">(
    "all",
  );
  const [filterStatus, setFilterStatus] = useState<GapStatus | "all">("all");

  // Placeholder: no gaps yet — populated when agent runs produce them
  const gaps: GapItem[] = useMemo(() => [], []);

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
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Gap Register
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Strategic gaps identified across canvas sections — missing data, low
            confidence, unverified assumptions, and contradictions.
          </p>
        </div>
        <Button variant="outline" size="sm" className="gap-2">
          <Plus className="h-4 w-4" />
          Add Gap
        </Button>
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

      {/* Empty state */}
      {filteredGaps.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-4">
              <AlertTriangle className="h-6 w-6 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-medium mb-2">No gaps detected</h3>
            <p className="text-sm text-muted-foreground max-w-md mb-6">
              Gaps are identified automatically when agents analyze your canvas
              sections. Run a strategy playbook or trigger an agent analysis to
              surface missing data, low-confidence claims, and unverified
              assumptions.
            </p>
          </CardContent>
        </Card>
      )}

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
                              {s}
                            </Badge>
                          ))}
                        </div>
                      )}
                      {gap.recommended_action && (
                        <p className="text-xs text-muted-foreground mt-2 italic">
                          Recommended: {gap.recommended_action}
                        </p>
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
