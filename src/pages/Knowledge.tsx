import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Database,
  Plus,
  Filter,
  FileText,
  Link as LinkIcon,
  Newspaper,
  FileCheck,
  MessageSquare,
  Globe,
  File,
  Hand,
  Bot,
} from "lucide-react";
import type { Database as DB } from "@/integrations/supabase/types";

/**
 * Knowledge / Evidence page (/knowledge)
 *
 * Shows all evidence items collected by agents across the canvas. Evidence
 * links claims to sources (websites, filings, news, transcripts, etc.).
 *
 * Data source: `evidence_items` table (Phase 2 schema). Currently shows empty
 * state until agent runs start producing evidence.
 */

type EvidenceSourceType = DB["public"]["Enums"]["evidence_source_type"];

interface EvidenceItem {
  id: string;
  source_type: EvidenceSourceType;
  source_name: string | null;
  source_url: string | null;
  source_date: string | null;
  retrieved_at: string;
  title: string;
  excerpt: string | null;
  created_by_agent_run_id: string | null;
}

const SOURCE_TYPE_CONFIG: Record<
  EvidenceSourceType,
  { label: string; icon: typeof Globe }
> = {
  website: { label: "Website", icon: Globe },
  filing: { label: "Filing", icon: FileText },
  news: { label: "News", icon: Newspaper },
  transcript: { label: "Transcript", icon: FileCheck },
  social: { label: "Social", icon: MessageSquare },
  api: { label: "API", icon: Database },
  document: { label: "Document", icon: File },
  manual: { label: "Manual", icon: Hand },
};

export default function Knowledge() {
  const [filterType, setFilterType] = useState<EvidenceSourceType | "all">(
    "all",
  );

  // Placeholder: no evidence yet — populated when agent runs produce them
  const evidenceItems: EvidenceItem[] = [];

  const filteredItems = useMemo(() => {
    return evidenceItems.filter((e) => {
      if (filterType !== "all" && e.source_type !== filterType) return false;
      return true;
    });
  }, [evidenceItems, filterType]);

  const stats = useMemo(() => {
    const byType = evidenceItems.reduce(
      (acc, e) => {
        acc[e.source_type] = (acc[e.source_type] ?? 0) + 1;
        return acc;
      },
      {} as Record<EvidenceSourceType, number>,
    );
    return {
      total: evidenceItems.length,
      byType,
      agentLinked: evidenceItems.filter((e) => e.created_by_agent_run_id).length,
    };
  }, [evidenceItems]);

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Page heading */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Knowledge Base
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Evidence items collected by agents — sources, filings, news, and
            documents backing canvas claims.
          </p>
        </div>
        <Button variant="outline" size="sm" className="gap-2">
          <Plus className="h-4 w-4" />
          Add Evidence
        </Button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-muted-foreground">
                Total Evidence
              </p>
              <Database className="h-4 w-4 text-muted-foreground" />
            </div>
            <p className="text-2xl font-semibold mt-2">{stats.total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-muted-foreground">
                Agent-Linked
              </p>
              <Bot className="h-4 w-4 text-primary" />
            </div>
            <p className="text-2xl font-semibold mt-2 text-primary">
              {stats.agentLinked}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-muted-foreground">
                Source Types
              </p>
              <Filter className="h-4 w-4 text-muted-foreground" />
            </div>
            <p className="text-2xl font-semibold mt-2">
              {Object.keys(stats.byType).length}
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
          value={filterType}
          onChange={(e) =>
            setFilterType(e.target.value as EvidenceSourceType | "all")
          }
          className="h-8 rounded-md border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="all">All Sources</option>
          {Object.entries(SOURCE_TYPE_CONFIG).map(([key, cfg]) => (
            <option key={key} value={key}>
              {cfg.label}
            </option>
          ))}
        </select>
      </div>

      {/* Empty state */}
      {filteredItems.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-4">
              <Database className="h-6 w-6 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-medium mb-2">No evidence collected</h3>
            <p className="text-sm text-muted-foreground max-w-md mb-6">
              Evidence items are gathered automatically by agents when they
              analyze your canvas sections. Each claim links back to its source
              — website, filing, news article, transcript, or document.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Evidence list */}
      {filteredItems.length > 0 && (
        <div className="flex flex-col gap-3">
          {filteredItems.map((item) => {
            const typeCfg = SOURCE_TYPE_CONFIG[item.source_type];
            return (
              <Card key={item.id}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-4">
                    <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
                      <typeCfg.icon className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <h3 className="text-sm font-semibold">{item.title}</h3>
                        <Badge variant="outline" className="text-xs">
                          {typeCfg.label}
                        </Badge>
                        {item.created_by_agent_run_id && (
                          <Badge
                            variant="outline"
                            className="text-xs gap-1"
                          >
                            <Bot className="h-2.5 w-2.5" />
                            Agent
                          </Badge>
                        )}
                      </div>
                      {item.excerpt && (
                        <p className="text-sm text-muted-foreground line-clamp-2 mb-2">
                          {item.excerpt}
                        </p>
                      )}
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        {item.source_name && (
                          <span className="font-medium">
                            {item.source_name}
                          </span>
                        )}
                        {item.source_url && (
                          <a
                            href={item.source_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 hover:text-primary transition-colors"
                          >
                            <LinkIcon className="h-3 w-3" />
                            Source
                          </a>
                        )}
                        {item.source_date && (
                          <span>Dated: {item.source_date}</span>
                        )}
                        <span>
                          Retrieved:{" "}
                          {new Date(item.retrieved_at).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
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
