import type { A2uiSurfaceState } from "@/lib/a2ui";
import {
  ChoiceChips,
  ComparisonStrip,
  ConfidenceBadge,
  ContradictionAlert,
  CoverageMap,
  GapPrompt,
  RejectedComponent,
  ScoreTable,
  ValueThemeCard,
  VariableCard,
  WorkflowRunCard,
  type CatalogContext,
  type CatalogRenderer,
} from "./catalog";

/**
 * The hand-rolled A2UI dispatcher (plan AT-3; handoff decision 7 pre-approves
 * this over a full protocol renderer). This map IS the whitelist: anything
 * outside it renders a rejection marker and logs — it must never throw and
 * never evaluate model-provided markup. Complete at 10 (see README.md).
 */
const CATALOG: Record<string, CatalogRenderer> = {
  VariableCard,
  GapPrompt,
  ChoiceChips,
  ScoreTable,
  ComparisonStrip,
  ValueThemeCard,
  ConfidenceBadge,
  CoverageMap,
  WorkflowRunCard,
  ContradictionAlert,
};

export function A2uiSurface({
  surface,
  accountId,
  onBrainWrite,
}: {
  surface: A2uiSurfaceState;
  accountId: string;
  onBrainWrite?: (path: string) => void;
}) {
  const ctx: CatalogContext = { accountId, dataModel: surface.dataModel, onBrainWrite };

  return (
    <div className="space-y-2" data-a2ui-surface={surface.surfaceId}>
      {surface.components.map((spec) => {
        const entries = Object.entries(spec.component);
        if (entries.length !== 1) {
          console.warn(`[a2ui] rejected malformed component ${spec.id} on ${surface.surfaceId}`);
          return <RejectedComponent key={spec.id} name={spec.id} reason="malformed component spec" />;
        }
        const [name, props] = entries[0];
        const renderer = CATALOG[name];
        if (!renderer) {
          console.warn(`[a2ui] rejected off-catalog component "${name}" on ${surface.surfaceId}`);
          return <RejectedComponent key={spec.id} name={name} reason="not in catalog" />;
        }
        return <div key={spec.id}>{renderer(props ?? {}, ctx)}</div>;
      })}
    </div>
  );
}
