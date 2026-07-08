import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { loadCompanyScope } from "@/lib/company-scope";

/**
 * First-run posture for Atlas (spec: adaptive greeting): is the active
 * company's board RICH enough for competitive strategy talk, or SPARSE so
 * Atlas should open as an onboarding coach building ground truth?
 *
 * Rich = the active company scope has BOTH:
 *   (a) a meaningfully filled own canvas — proxy: >= 5 own (competitor_id is
 *       null) canvas_section_versions rows in scope (summing items across the
 *       latest row per section is not worth the extra reads here), AND
 *   (b) >= 1 researched competitor row (competitor_id not null) in scope,
 *       OR >= 8 evidence_items for the account.
 *
 * Queries are deliberately cheap: head-only counts and a limit-1 existence
 * probe. On ANY error the hook reports "rich" — a transient read failure must
 * never accidentally degrade the greeting to coaching mode.
 */
export type DataRichness = "sparse" | "rich" | null;

const OWN_CANVAS_ROWS_RICH_THRESHOLD = 5;
const EVIDENCE_RICH_THRESHOLD = 8;

export function useDataRichness(accountId: string | null | undefined): DataRichness {
  const [mode, setMode] = useState<DataRichness>(null);

  useEffect(() => {
    setMode(null);
    if (!accountId) return;
    let cancelled = false;

    (async () => {
      try {
        const scope = await loadCompanyScope(accountId);
        if (scope.contextIds.length === 0) {
          // No company contexts at all: nothing analyzed yet — sparse by definition.
          if (!cancelled) setMode("sparse");
          return;
        }

        const [ownCanvas, researchedCompetitor, evidence] = await Promise.all([
          // (a) own canvas rows — count only, no payload.
          supabase
            .from("canvas_section_versions")
            .select("id", { count: "exact", head: true })
            .eq("account_id", accountId)
            .is("competitor_id", null)
            .in("business_context_version_id", scope.contextIds),
          // (b1) any researched competitor row — existence probe.
          supabase
            .from("canvas_section_versions")
            .select("id")
            .eq("account_id", accountId)
            .not("competitor_id", "is", null)
            .in("business_context_version_id", scope.contextIds)
            .limit(1),
          // (b2) evidence for the account — count only.
          supabase
            .from("evidence_items")
            .select("id", { count: "exact", head: true })
            .eq("account_id", accountId),
        ]);
        if (cancelled) return;

        if (ownCanvas.error || researchedCompetitor.error || evidence.error) {
          setMode("rich");
          return;
        }

        const canvasFilled = (ownCanvas.count ?? 0) >= OWN_CANVAS_ROWS_RICH_THRESHOLD;
        const fieldResearched =
          (researchedCompetitor.data?.length ?? 0) >= 1 ||
          (evidence.count ?? 0) >= EVIDENCE_RICH_THRESHOLD;
        setMode(canvasFilled && fieldResearched ? "rich" : "sparse");
      } catch {
        if (!cancelled) setMode("rich");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [accountId]);

  return mode;
}
