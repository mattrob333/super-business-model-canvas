import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FileText, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { supabaseUntyped } from "@/lib/supabase-untyped";
import { loadCompanyScope } from "@/lib/company-scope";
import { AGENT_ROSTER } from "@/lib/agent-roster";
import { CANVAS_SECTION_KEYS } from "@/components/canvas/section-types";

/**
 * The War Room's document shelf — Atlas sees everything the team produces.
 * Recent skill artifacts from EVERY room (company-scoped like all reads),
 * each opening its full document page. Skill keys are "<callsign>.<skill>",
 * so the room attribution comes straight from the key prefix.
 */

interface ShelfArtifact {
  id: string;
  skill_key: string;
  title: string;
  created_at: string;
}

const REFRESH_MS = 30_000;

const CALLSIGN_BY_PREFIX = new Map(
  CANVAS_SECTION_KEYS.map((key) => {
    const entry = AGENT_ROSTER[key];
    return [entry.callsign.toLowerCase(), entry] as const;
  }),
);

export function WarRoomShelf({ accountId }: { accountId: string }) {
  const [artifacts, setArtifacts] = useState<ShelfArtifact[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const scope = await loadCompanyScope(accountId).catch(() => null);
    let query = supabaseUntyped
      .from<ShelfArtifact>("skill_artifacts")
      .select("id, skill_key, title, created_at")
      .eq("account_id", accountId);
    if (scope) query = query.in("business_context_version_id", scope.contextIds);
    const { data, error } = await query.order("created_at", { ascending: false }).limit(10);
    setArtifacts(error ? [] : data ?? []);
    setLoading(false);
  }, [accountId]);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]);

  return (
    <section className="rounded-lg border border-border bg-card p-4 shadow-sm">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Document shelf — all rooms
      </h2>

      {loading ? (
        <div className="flex justify-center py-4">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      ) : artifacts.length === 0 ? (
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          No documents yet. When any agent runs a skill, the finished document
          lands here — the War Room sees the whole board.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {artifacts.map((artifact) => {
            const prefix = artifact.skill_key.split(".")[0] ?? "";
            const entry = CALLSIGN_BY_PREFIX.get(prefix);
            return (
              <li key={artifact.id}>
                <Link
                  to={`/artifacts/${artifact.id}`}
                  className="block rounded-md border border-border/60 p-2 transition-colors hover:border-primary/40 hover:bg-accent/40"
                >
                  <div className="flex items-start gap-2">
                    <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium">{artifact.title}</p>
                      <p className="mt-0.5 flex items-center gap-1.5 text-[10px] text-muted-foreground/80">
                        {entry ? (
                          <Badge variant="outline" className={`px-1 py-0 text-[9px] ${entry.avatarClass}`}>
                            {entry.callsign}
                          </Badge>
                        ) : null}
                        {new Date(artifact.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
