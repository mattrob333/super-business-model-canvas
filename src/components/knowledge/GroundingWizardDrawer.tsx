import { useCallback, useEffect, useMemo, useState } from "react";
import { BadgeCheck, Lightbulb, Loader2, PenLine, SkipForward, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FocusDrawer } from "@/components/overlay/FocusDrawer";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
// grounding_suggestions is beyond the generated Database type's TS2589 depth
// horizon (see src/lib/supabase-untyped.ts) — explicit row type + escape hatch.
import { supabaseUntyped } from "@/lib/supabase-untyped";

interface GroundingSuggestion {
  id: string;
  section_key: string;
  item_text: string;
  suggested_text: string;
  rationale: string | null;
  evidence_id: string | null;
  status: "open" | "accepted" | "dismissed";
}
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import {
  CANVAS_SECTION_KEYS,
  CANVAS_SECTION_LABELS,
  type CanvasSectionKey,
} from "@/components/canvas/section-types";

/**
 * The spec 08 §3 grounding pass: generic canvas items → named, owner-attested
 * ones. Per ungrounded item the owner can confirm it as-is, replace it with
 * the real name, or skip. Each confirmation writes a new canvas section
 * version with the item upgraded (`grounded: true`, owner-attested evidence)
 * and an updated groundedness score. Skippable and resumable by design — the
 * queue is recomputed from live data every time the wizard opens.
 */

interface CanvasItem {
  text: string;
  confidence: number | null;
  evidence_ids: string[];
  grounded?: boolean;
  provenance?: string;
  [key: string]: unknown;
}

interface SectionState {
  sectionKey: CanvasSectionKey;
  versionRowId: string;
  businessContextVersionId: string | null;
  items: CanvasItem[];
}

interface QueueEntry {
  sectionKey: CanvasSectionKey;
  itemIndex: number;
}

function isGrounded(item: CanvasItem): boolean {
  return item.grounded === true && item.evidence_ids.length > 0;
}

function parseItems(value: unknown): CanvasItem[] {
  if (!Array.isArray(value)) return [];
  const items: CanvasItem[] = [];
  for (const entry of value) {
    if (typeof entry === "string") {
      items.push({ text: entry, confidence: null, evidence_ids: [] });
      continue;
    }
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    if (typeof record.text !== "string" || record.text.length === 0) continue;
    items.push({
      ...record,
      text: record.text,
      confidence: typeof record.confidence === "number" ? record.confidence : null,
      evidence_ids: Array.isArray(record.evidence_ids)
        ? record.evidence_ids.filter((id): id is string => typeof id === "string")
        : [],
      grounded: record.grounded === true,
    });
  }
  return items;
}

export function GroundingWizardDrawer({
  open,
  onOpenChange,
  accountId,
  onGrounded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accountId: string | null;
  onGrounded?: () => void;
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [sections, setSections] = useState<Map<CanvasSectionKey, SectionState>>(new Map());
  const [queue, setQueue] = useState<QueueEntry[]>([]);
  const [cursor, setCursor] = useState(0);
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [attested, setAttested] = useState(0);
  const [suggestions, setSuggestions] = useState<GroundingSuggestion[]>([]);

  const current = queue[cursor];
  const currentSection = current ? sections.get(current.sectionKey) : undefined;
  const currentItem = currentSection?.items[current?.itemIndex ?? -1];
  const currentSuggestion = current && currentItem
    ? suggestions.find(
        (entry) => entry.section_key === current.sectionKey && entry.item_text === currentItem.text,
      ) ?? null
    : null;

  const loadQueue = useCallback(async () => {
    if (!accountId) return;
    setLoading(true);
    try {
      const [{ data, error }, suggestionsRes] = await Promise.all([
        supabase
          .from("canvas_section_versions")
          .select("id, section_key, items, business_context_version_id, created_at")
          .eq("account_id", accountId)
          .is("competitor_id", null)
          .order("created_at", { ascending: false })
          .limit(200),
        supabaseUntyped
          .from<GroundingSuggestion>("grounding_suggestions")
          .select("id, section_key, item_text, suggested_text, rationale, evidence_id, status")
          .eq("account_id", accountId)
          .eq("status", "open")
          .order("created_at", { ascending: false })
          .limit(100),
      ]);
      if (error) throw error;
      setSuggestions(suggestionsRes.error ? [] : suggestionsRes.data ?? []);
      const latest = new Map<CanvasSectionKey, SectionState>();
      for (const row of data ?? []) {
        const key = row.section_key as CanvasSectionKey;
        if (!CANVAS_SECTION_KEYS.includes(key) || latest.has(key)) continue;
        latest.set(key, {
          sectionKey: key,
          versionRowId: row.id,
          businessContextVersionId: row.business_context_version_id,
          items: parseItems(row.items),
        });
      }
      const nextQueue: QueueEntry[] = [];
      for (const key of CANVAS_SECTION_KEYS) {
        const section = latest.get(key);
        if (!section) continue;
        section.items.forEach((item, itemIndex) => {
          if (!isGrounded(item)) nextQueue.push({ sectionKey: key, itemIndex });
        });
      }
      setSections(latest);
      setQueue(nextQueue);
      setCursor(0);
      setAttested(0);
    } catch (error) {
      toast({
        title: "Could not load canvas items",
        description: error instanceof Error ? error.message : "Try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [accountId, toast]);

  useEffect(() => {
    if (open) void loadQueue();
  }, [open, loadQueue]);

  useEffect(() => {
    setDraft(currentItem?.text ?? "");
    setEditing(false);
  }, [currentItem?.text]);

  const attest = useCallback(async (suggestion?: GroundingSuggestion) => {
    if (!accountId || !current || !currentSection || !currentItem || saving) return;
    const finalText = (suggestion?.suggested_text ?? (editing ? draft : currentItem.text)).trim();
    if (!finalText) return;
    setSaving(true);
    try {
      // Standing invariant: never write research/extract artifacts without a
      // business context version.
      let contextId = currentSection.businessContextVersionId;
      if (!contextId) {
        const { data: existing } = await supabase
          .from("business_context_versions")
          .select("id")
          .eq("account_id", accountId)
          .order("version_number", { ascending: false })
          .limit(1)
          .maybeSingle();
        contextId = existing?.id ?? null;
      }
      if (!contextId) throw new Error("No business context version exists for this account yet.");

      const { data: evidence, error: evidenceError } = await supabase
        .from("evidence_items")
        .insert({
          account_id: accountId,
          source_type: "manual",
          source_name: "Owner attestation",
          title: `Owner attestation: ${CANVAS_SECTION_LABELS[current.sectionKey]}`,
          excerpt: finalText,
          metadata: { provenance: "owner_attested", grounding_wizard: true },
        })
        .select("id")
        .single();
      if (evidenceError) throw evidenceError;

      const nextItems = currentSection.items.map((item, index) =>
        index === current.itemIndex
          ? {
              ...item,
              text: finalText,
              confidence: Math.max(item.confidence ?? 0.6, 0.9),
              evidence_ids: [...new Set([
                ...item.evidence_ids,
                evidence.id,
                ...(suggestion?.evidence_id ? [suggestion.evidence_id] : []),
              ])],
              grounded: true,
              provenance: "owner_attested",
              verification_status: "confirmed",
            }
          : item,
      );
      const groundedCount = nextItems.filter(isGrounded).length;
      const { error: versionError } = await supabase.from("canvas_section_versions").insert({
        account_id: accountId,
        business_context_version_id: contextId,
        competitor_id: null,
        section_key: current.sectionKey,
        section_title: CANVAS_SECTION_LABELS[current.sectionKey],
        items: nextItems as unknown as Json,
        notes: "Grounded by the owner via the grounding wizard.",
        confidence: average(nextItems.map((item) => item.confidence ?? 0.6)),
        freshness_status: "fresh",
        last_verified_at: new Date().toISOString(),
        groundedness_score: nextItems.length === 0 ? 0 : Math.round((groundedCount / nextItems.length) * 10000) / 10000,
        groundedness_inputs: { formula: "groundedness_v1", grounded: groundedCount, total: nextItems.length },
        created_by: user?.id ?? null,
      });
      if (versionError) throw versionError;

      // Update local copy so later items in the same section build on this write.
      setSections((prev) => {
        const next = new Map(prev);
        next.set(current.sectionKey, { ...currentSection, items: nextItems });
        return next;
      });
      if (suggestion) {
        await supabaseUntyped
          .from("grounding_suggestions")
          .update({ status: "accepted", resolved_at: new Date().toISOString() })
          .eq("id", suggestion.id)
          .eq("account_id", accountId);
        setSuggestions((prev) => prev.filter((entry) => entry.id !== suggestion.id));
      }
      setAttested((count) => count + 1);
      setCursor((index) => index + 1);
      onGrounded?.();
    } catch (error) {
      toast({
        title: "Could not save attestation",
        description: error instanceof Error ? error.message : "Try again.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }, [accountId, current, currentSection, currentItem, saving, editing, draft, user, onGrounded, toast]);

  const dismissSuggestion = useCallback(async (suggestion: GroundingSuggestion) => {
    if (!accountId) return;
    await supabaseUntyped
      .from("grounding_suggestions")
      .update({ status: "dismissed", resolved_at: new Date().toISOString() })
      .eq("id", suggestion.id)
      .eq("account_id", accountId);
    setSuggestions((prev) => prev.filter((entry) => entry.id !== suggestion.id));
  }, [accountId]);

  const done = !loading && (queue.length === 0 || cursor >= queue.length);
  const progressLabel = useMemo(() => {
    if (loading) return "Loading canvas items";
    if (queue.length === 0) return "Every item is already grounded";
    return `${Math.min(cursor + 1, queue.length)} of ${queue.length} ungrounded items`;
  }, [loading, queue.length, cursor]);

  return (
    <FocusDrawer
      open={open}
      onOpenChange={onOpenChange}
      size="reading"
      eyebrow="Grounding wizard"
      title="Confirm your real names"
      subtitle="Upgrade generic canvas items to owner-attested facts. Skippable — your progress is saved as you go."
      footer={
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">{progressLabel}</p>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            {done ? "Done" : "Finish later"}
          </Button>
        </div>
      }
      bodyClassName="p-4 sm:p-6"
    >
      {loading ? (
        <div className="flex min-h-[200px] items-center justify-center text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Reading your canvas
        </div>
      ) : done ? (
        <div className="flex min-h-[200px] flex-col items-center justify-center gap-2 text-center">
          <BadgeCheck className="h-8 w-8 text-primary" />
          <p className="text-sm font-semibold">
            {attested > 0 ? `${attested} item${attested === 1 ? "" : "s"} grounded this session.` : "Nothing to ground right now."}
          </p>
          <p className="max-w-sm text-sm text-muted-foreground">
            {queue.length === 0 && attested === 0
              ? "Every canvas item already carries evidence, or no versioned sections exist yet. Run an analysis or upload a founder document first."
              : "Your agents now work with the real names instead of guesses."}
          </p>
        </div>
      ) : current && currentItem ? (
        <div className="space-y-5">
          <div className="flex items-center gap-2">
            <Badge variant="outline">{CANVAS_SECTION_LABELS[current.sectionKey]}</Badge>
            <Badge variant="secondary">Not yet grounded</Badge>
          </div>
          <div className="rounded-lg border border-border bg-muted/30 p-4">
            <p className="text-sm leading-relaxed text-foreground">{currentItem.text}</p>
          </div>
          {currentSuggestion && (
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
              <div className="flex items-start justify-between gap-2">
                <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-primary">
                  <Lightbulb className="h-3.5 w-3.5" />
                  Agent suggestion
                </p>
                <button
                  type="button"
                  onClick={() => void dismissSuggestion(currentSuggestion)}
                  className="text-muted-foreground transition-colors hover:text-foreground"
                  aria-label="Dismiss suggestion"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <p className="mt-2 text-sm font-medium text-foreground">{currentSuggestion.suggested_text}</p>
              {currentSuggestion.rationale && (
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{currentSuggestion.rationale}</p>
              )}
              <Button size="sm" className="mt-3 gap-1.5" disabled={saving} onClick={() => void attest(currentSuggestion)}>
                <BadgeCheck className="h-3.5 w-3.5" />
                Use this name
              </Button>
            </div>
          )}
          {editing ? (
            <div className="space-y-2">
              <Label htmlFor="grounding-name">The real name</Label>
              <Input
                id="grounding-name"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder='e.g. "AWS and Snowflake" instead of "cloud infrastructure providers"'
                autoFocus
              />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Is this accurate as written? Confirm it, or replace the generic wording with the
              specific names you actually use.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void attest()} disabled={saving || (editing && !draft.trim())} className="gap-1.5">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <BadgeCheck className="h-4 w-4" />}
              {editing ? "Save real name" : "Confirm as accurate"}
            </Button>
            {!editing && (
              <Button variant="outline" onClick={() => setEditing(true)} className="gap-1.5">
                <PenLine className="h-4 w-4" />
                Name it
              </Button>
            )}
            {editing && (
              <Button variant="outline" onClick={() => setEditing(false)}>
                Back
              </Button>
            )}
            <Button variant="ghost" onClick={() => setCursor((index) => index + 1)} disabled={saving} className="gap-1.5">
              <SkipForward className="h-4 w-4" />
              Skip
            </Button>
          </div>
        </div>
      ) : null}
    </FocusDrawer>
  );
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 100) / 100;
}
