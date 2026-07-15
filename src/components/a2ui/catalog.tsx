import { useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, Check, CircleDashed, FileText, Loader2, Pencil, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { resolvePointer } from "@/lib/a2ui";
import { writeBrainVariable, type UserBrainSource } from "@/lib/brain";

/**
 * SuperBMC A2UI catalog v1 — the component whitelist (plan AT-3/AT-4).
 *
 * THE CAP IS LAW: exactly these 10 components render from agent-emitted
 * messages (spec §3). Adding one is a deliberate catalog PR, never ad-hoc —
 * and nothing here ever evaluates model-generated markup. Components receive
 * declarative props plus the surface's folded data model and resolve their
 * own bindings via JSON Pointer.
 */

export interface CatalogContext {
  accountId: string;
  dataModel: Record<string, unknown>;
  /** Called after a successful brain write so the host can refresh reads. */
  onBrainWrite?: (path: string) => void;
}

type CatalogRenderer = (props: Record<string, unknown>, ctx: CatalogContext) => JSX.Element;

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function labelFromBrainPath(path: string): string {
  const leaf = path.split(".").at(-1) ?? path;
  return leaf.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

/* ------------------------------------------------------------------ */
/* 1 · ConfidenceBadge                                                  */
/* ------------------------------------------------------------------ */

export function ConfidencePill({ confidence }: { confidence: unknown }) {
  const value = confidence === "high" || confidence === "medium" || confidence === "low" ? confidence : null;
  if (!value) return null;
  const styles =
    value === "high"
      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
      : value === "medium"
        ? "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400"
        : "border-rose-500/40 bg-rose-500/10 text-rose-600 dark:text-rose-400";
  return (
    <span className={`inline-flex shrink-0 items-center rounded-full border px-1.5 py-px text-[9px] font-medium uppercase tracking-wide ${styles}`}>
      {value}
    </span>
  );
}

const ConfidenceBadge: CatalogRenderer = (props, ctx) => {
  const bound = str(props.path) ? resolvePointer(ctx.dataModel, String(props.path)) : props.value;
  return <ConfidencePill confidence={bound} />;
};

/* ------------------------------------------------------------------ */
/* 2 · VariableCard — universal display/edit                            */
/* ------------------------------------------------------------------ */

/**
 * Structured values render as READABLE fields, never raw JSON (owner finding
 * 2026-07-14: a best_fit_segment object rendered as a scrolling JSON block).
 * Objects become labeled rows, arrays of objects become stacked blocks;
 * the JSON fallback survives only for pathological nesting depth.
 */
const MAX_RENDER_DEPTH = 3;

function renderValue(value: unknown, depth = 0): JSX.Element {
  if (value === null || value === undefined || value === "") {
    return <p className="text-muted-foreground">—</p>;
  }
  if (typeof value === "string") return <p className="whitespace-pre-wrap break-words">{value}</p>;
  if (typeof value === "number" || typeof value === "boolean") {
    return <p className="tabular-nums">{String(value)}</p>;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return <p className="text-muted-foreground">—</p>;
    if (value.every((item) => typeof item === "string" || typeof item === "number")) {
      return (
        <ul className="list-disc space-y-0.5 pl-4">
          {value.map((item, index) => (
            <li key={index} className="break-words">{String(item)}</li>
          ))}
        </ul>
      );
    }
    if (depth >= MAX_RENDER_DEPTH) return renderValueFallback(value);
    return (
      <div className="space-y-1.5">
        {value.map((item, index) => (
          <div key={index} className="rounded border border-border/60 bg-muted/20 px-2.5 py-1.5">
            {renderValue(item, depth + 1)}
          </div>
        ))}
      </div>
    );
  }
  if (typeof value === "object") {
    if (depth >= MAX_RENDER_DEPTH) return renderValueFallback(value);
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) return <p className="text-muted-foreground">—</p>;
    return (
      <dl className="space-y-1.5">
        {entries.map(([key, entry]) => (
          <div key={key}>
            <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {key.replace(/_/g, " ")}
            </dt>
            <dd className="mt-0.5">{renderValue(entry, depth + 1)}</dd>
          </div>
        ))}
      </dl>
    );
  }
  return renderValueFallback(value);
}

function renderValueFallback(value: unknown): JSX.Element {
  return (
    <pre className="overflow-x-auto rounded bg-muted/50 p-2 text-[11px] leading-relaxed">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

const VariableCard: CatalogRenderer = (props, ctx) => {
  const pointer = str(props.path);
  const bound = pointer ? (resolvePointer(ctx.dataModel, pointer) as Record<string, unknown> | undefined) : undefined;
  const brainPath = str(bound?.path) ?? "";
  const editable = props.editable === true && brainPath !== "";
  return (
    <VariableCardInner
      key={brainPath || pointer || "unbound"}
      brainPath={brainPath}
      value={bound?.value}
      confidence={bound?.confidence}
      editable={editable}
      ctx={ctx}
    />
  );
};

function VariableCardInner({
  brainPath,
  value,
  confidence,
  editable,
  ctx,
}: {
  brainPath: string;
  value: unknown;
  confidence: unknown;
  editable: boolean;
  ctx: CatalogContext;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<unknown>(undefined);
  const [error, setError] = useState<string | null>(null);
  const shown = saved !== undefined ? saved : value;

  const startEdit = () => {
    setDraft(typeof shown === "string" ? shown : JSON.stringify(shown, null, 2));
    setError(null);
    setEditing(true);
  };

  const save = async () => {
    if (saving) return;
    setSaving(true);
    setError(null);
    let next: unknown = draft;
    try {
      next = JSON.parse(draft);
    } catch {
      // Plain text stays a string — users type sentences, not JSON.
    }
    try {
      await writeBrainVariable(ctx.accountId, brainPath, next, "user_override");
      setSaved(next);
      setEditing(false);
      ctx.onBrainWrite?.(brainPath);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save. Try again.");
    } finally {
      setSaving(false);
    }
  };

  if (!brainPath) {
    return (
      <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
        Waiting for this value…
      </div>
    );
  }

  return (
    <div className="rounded-md border border-border bg-card px-3 py-2.5">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-[11px] font-semibold uppercase tracking-wide text-muted-foreground" title={brainPath}>
            {labelFromBrainPath(brainPath)}
          </span>
          <ConfidencePill confidence={saved !== undefined ? "high" : confidence} />
          {saved !== undefined && (
            <span className="text-[10px] text-muted-foreground">edited by you</span>
          )}
        </div>
        {editable && !editing && (
          <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" aria-label={`Edit ${labelFromBrainPath(brainPath)}`} onClick={startEdit}>
            <Pencil className="h-3 w-3" />
          </Button>
        )}
      </div>
      {editing ? (
        <div className="space-y-1.5">
          <Textarea value={draft} onChange={(event) => setDraft(event.target.value)} rows={3} className="text-xs" />
          <div className="flex items-center gap-1.5">
            <Button size="sm" className="h-7 gap-1 text-xs" onClick={() => void save()} disabled={saving}>
              {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
              Save as my answer
            </Button>
            <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => setEditing(false)} disabled={saving}>
              <X className="h-3 w-3" />
              Cancel
            </Button>
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
      ) : (
        <div className="text-xs leading-relaxed text-foreground">{renderValue(shown)}</div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 3 · GapPrompt — one empty slot, tappable answer                      */
/* ------------------------------------------------------------------ */

const GapPrompt: CatalogRenderer = (props, ctx) => {
  const slot = str(props.slot);
  const question = str(props.question) ?? (slot ? `What should "${labelFromBrainPath(slot)}" be?` : null);
  const options = Array.isArray(props.options) ? props.options.filter((option): option is string => typeof option === "string") : [];
  if (!slot || !question) return <RejectedComponent name="GapPrompt" reason="missing slot/question" />;
  return <GapPromptInner key={slot} slot={slot} question={question} options={options} source="user_stated" ctx={ctx} />;
};

function GapPromptInner({
  slot,
  question,
  options,
  source,
  ctx,
}: {
  slot: string;
  question: string;
  options: string[];
  source: UserBrainSource;
  ctx: CatalogContext;
}) {
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedValue, setSavedValue] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const save = async (value: string) => {
    const trimmed = value.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    setError(null);
    try {
      await writeBrainVariable(ctx.accountId, slot, trimmed, source);
      setSavedValue(trimmed);
      ctx.onBrainWrite?.(slot);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save. Try again.");
    } finally {
      setSaving(false);
    }
  };

  if (savedValue) {
    return (
      <div className="flex items-start gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-xs">
        <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
        <div className="min-w-0">
          <p className="font-medium">{labelFromBrainPath(slot)} saved.</p>
          <p className="break-words text-muted-foreground">{savedValue}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-dashed border-primary/40 bg-primary/5 px-3 py-2.5">
      <p className="text-xs leading-relaxed">{question}</p>
      {options.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {options.map((option) => (
            <Button key={option} variant="outline" size="sm" className="h-7 text-xs" disabled={saving} onClick={() => void save(option)}>
              {option}
            </Button>
          ))}
        </div>
      ) : (
        <form
          className="mt-2 flex items-end gap-1.5"
          onSubmit={(event) => {
            event.preventDefault();
            void save(draft);
          }}
        >
          <Textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            rows={1}
            placeholder="Type your answer…"
            className="max-h-24 min-h-[34px] flex-1 resize-none text-xs"
          />
          <Button type="submit" size="sm" className="h-8 shrink-0 text-xs" disabled={saving || !draft.trim()}>
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save"}
          </Button>
        </form>
      )}
      {error && <p className="mt-1.5 text-xs text-destructive">{error}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 4 · ChoiceChips — enum slots, one-tap answers                        */
/* ------------------------------------------------------------------ */

const ChoiceChips: CatalogRenderer = (props, ctx) => {
  const slot = str(props.slot);
  const question = str(props.question);
  const options = Array.isArray(props.options) ? props.options.filter((option): option is string => typeof option === "string") : [];
  if (!slot || options.length === 0) return <RejectedComponent name="ChoiceChips" reason="missing slot/options" />;
  return (
    <GapPromptInner
      key={slot}
      slot={slot}
      question={question ?? `Pick one for "${labelFromBrainPath(slot)}":`}
      options={options}
      source="user_stated"
      ctx={ctx}
    />
  );
};

/* ------------------------------------------------------------------ */
/* 5 · WorkflowRunCard — live run progress                              */
/* ------------------------------------------------------------------ */

interface RunStep {
  id?: unknown;
  status?: unknown;
  /** Authored in the workflow card: human step name + expectation-setter. */
  label?: unknown;
  eta_hint?: unknown;
}

const WorkflowRunCard: CatalogRenderer = (props, ctx) => {
  const bound = str(props.path) ? (resolvePointer(ctx.dataModel, String(props.path)) as Record<string, unknown> | undefined) : undefined;
  const name = str(bound?.name) ?? "Workflow";
  const status = str(bound?.status) ?? "running";
  const steps = Array.isArray(bound?.steps) ? (bound?.steps as RunStep[]) : [];
  const error = str(bound?.error);
  const done = steps.filter((step) => step.status === "completed").length;

  return (
    <div className="rounded-md border border-border bg-card px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 truncate text-sm font-semibold">{name}</p>
        {status === "awaiting_input" ? (
          <span className="flex shrink-0 items-center gap-1 text-[11px] text-amber-600 dark:text-amber-400">
            <CircleDashed className="h-3 w-3" />
            waiting for you
          </span>
        ) : status === "running" ? (
          <span className="flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            step {Math.min(done + 1, Math.max(steps.length, 1))} of {steps.length || "…"}
          </span>
        ) : status === "completed" ? (
          <span className="flex shrink-0 items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400">
            <Check className="h-3 w-3" /> done
          </span>
        ) : (
          <span className="flex shrink-0 items-center gap-1 text-[11px] text-destructive">
            <AlertTriangle className="h-3 w-3" /> failed
          </span>
        )}
      </div>
      {steps.length > 0 && (
        <ul className="mt-2 space-y-1">
          {steps.map((step, index) => {
            const stepId = str(step.id) ?? `step ${index + 1}`;
            const state = str(step.status) ?? "pending";
            const active = status === "running" && state === "pending" && index === done;
            const label = str(step.label) ?? (stepId.replace(/^s?\d+[-.]?\s*/, "").replace(/-/g, " ") || stepId);
            // The expectation-setter (authored in the card) shows only under
            // the ACTIVE step: "researching the live web — usually 5–10 min"
            // is the difference between "working" and "looks hung".
            const eta = active ? str(step.eta_hint) : null;
            return (
              <li key={stepId} className="text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  {state === "completed" ? (
                    <Check className="h-3 w-3 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  ) : active ? (
                    <Loader2 className="h-3 w-3 shrink-0 animate-spin text-primary" />
                  ) : (
                    <CircleDashed className="h-3 w-3 shrink-0" />
                  )}
                  <span className={`truncate ${state === "completed" ? "text-foreground" : ""}`}>{label}</span>
                </span>
                {eta && (
                  <p className="ml-[18px] mt-0.5 text-[11px] italic text-muted-foreground/80">{eta}</p>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {status === "completed" && (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
          <FileText className="h-3 w-3 shrink-0" />
          {str(bound?.artifactId) ? (
            <Link to={`/artifacts/${String(bound?.artifactId)}`} className="text-primary underline-offset-2 hover:underline">
              Open the full report
            </Link>
          ) : (
            "Full report saved to the shelf."
          )}
        </p>
      )}
      {status === "failed" && error && (
        <p className="mt-2 break-words text-xs text-destructive">{error}</p>
      )}
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* 6 · ScoreTable — arrays with numeric fields                          */
/* ------------------------------------------------------------------ */

const ScoreTable: CatalogRenderer = (props, ctx) => {
  const bound = str(props.path) ? resolvePointer(ctx.dataModel, String(props.path)) : props.rows;
  const source = (resolveVariableArray(bound) ?? []).filter(
    (row): row is Record<string, unknown> => row !== null && typeof row === "object" && !Array.isArray(row),
  );
  if (source.length === 0) return <RejectedComponent name="ScoreTable" reason="no rows to score" soft />;

  // Presentation hints from the workflow card: an ordered column subset, a
  // numeric sort column (descending — highest score first), and a title.
  const declaredColumns = Array.isArray(props.columns)
    ? props.columns.filter((column): column is string => typeof column === "string" && column in source[0])
    : [];
  const columns = declaredColumns.length > 0 ? declaredColumns : Object.keys(source[0]).slice(0, 6);
  const sortKey = str(props.sort);
  const rows = [...source];
  if (sortKey && typeof source[0][sortKey] === "number") {
    rows.sort((a, b) => (Number(b[sortKey]) || 0) - (Number(a[sortKey]) || 0));
  }

  return (
    <div>
      {str(props.title) && (
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{String(props.title)}</p>
      )}
      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full min-w-[420px] text-left text-xs">
          <thead className="bg-muted/50 text-[10px] uppercase tracking-wide text-muted-foreground">
            <tr>
              {columns.map((column) => (
                <th key={column} className="px-2.5 py-1.5 font-medium">{column.replace(/_/g, " ")}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 12).map((row, index) => (
              <tr key={index} className="border-t border-border">
                {columns.map((column) => (
                  <td key={column} className="max-w-[260px] px-2.5 py-1.5 align-top" title={String(row[column] ?? "")}>
                    {typeof row[column] === "number" ? (
                      <span className="font-semibold tabular-nums">{String(row[column])}</span>
                    ) : (
                      <span className="line-clamp-2 break-words">{typeof row[column] === "string" ? row[column] : row[column] == null ? "—" : JSON.stringify(row[column])}</span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > 12 && (
        <p className="mt-1 text-[10px] text-muted-foreground">Showing 12 of {rows.length} rows — the full set is in the report.</p>
      )}
    </div>
  );
};

/** Variables land as {path, value, confidence} — unwrap when bound that way. */
function resolveVariableArray(bound: unknown): unknown[] | null {
  if (Array.isArray(bound)) return bound;
  if (bound && typeof bound === "object" && Array.isArray((bound as Record<string, unknown>).value)) {
    return (bound as Record<string, unknown>).value as unknown[];
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* 7 · ComparisonStrip — competitor/alternative cards                   */
/* ------------------------------------------------------------------ */

const ComparisonStrip: CatalogRenderer = (props, ctx) => {
  const bound = str(props.path) ? resolvePointer(ctx.dataModel, String(props.path)) : props.items;
  const items = (resolveVariableArray(bound) ?? []).filter(
    (item): item is Record<string, unknown> => item !== null && typeof item === "object",
  );
  if (items.length === 0) return <RejectedComponent name="ComparisonStrip" reason="nothing to compare" soft />;
  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {items.slice(0, 8).map((item, index) => (
        <div key={index} className="w-52 shrink-0 rounded-md border border-border bg-card px-3 py-2.5">
          <div className="flex items-center justify-between gap-1.5">
            <p className="min-w-0 truncate text-xs font-semibold">{str(item.name) ?? `Alternative ${index + 1}`}</p>
            {str(item.type) && (
              <span className="shrink-0 rounded-full bg-muted px-1.5 py-px text-[9px] uppercase tracking-wide text-muted-foreground">
                {String(item.type).replace(/_/g, " ")}
              </span>
            )}
          </div>
          {str(item.why_chosen) && (
            <p className="mt-1.5 line-clamp-3 text-[11px] leading-relaxed text-muted-foreground">{String(item.why_chosen)}</p>
          )}
          {str(item.our_edge) && (
            <p className="mt-1.5 line-clamp-3 text-[11px] leading-relaxed">
              <span className="font-medium">Our edge:</span> {String(item.our_edge)}
            </p>
          )}
          {str(item.price) && <p className="mt-1.5 text-[11px] font-medium tabular-nums">{String(item.price)}</p>}
        </div>
      ))}
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* 8 · ValueThemeCard — theme + proof-status pill                       */
/* ------------------------------------------------------------------ */

const ValueThemeCard: CatalogRenderer = (props, ctx) => {
  const bound = str(props.path) ? resolvePointer(ctx.dataModel, String(props.path)) : props.themes;
  const themes = (resolveVariableArray(bound) ?? [bound]).filter(
    (theme): theme is Record<string, unknown> => theme !== null && typeof theme === "object",
  );
  if (themes.length === 0) return <RejectedComponent name="ValueThemeCard" reason="no themes" soft />;
  return (
    <div className="space-y-2">
      {themes.slice(0, 4).map((theme, index) => {
        const proofStatus = str(theme.proof_status);
        return (
          <div key={index} className="rounded-md border border-border bg-card px-3 py-2.5">
            <div className="flex items-center justify-between gap-2">
              <p className="min-w-0 text-xs font-semibold">{str(theme.theme) ?? `Theme ${index + 1}`}</p>
              {proofStatus && (
                <span
                  className={`shrink-0 rounded-full border px-1.5 py-px text-[9px] font-medium uppercase tracking-wide ${
                    proofStatus === "proven"
                      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                      : proofStatus === "partial"
                        ? "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400"
                        : "border-border bg-muted text-muted-foreground"
                  }`}
                >
                  {proofStatus}
                </span>
              )}
            </div>
            {str(theme.customer_value) && (
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{String(theme.customer_value)}</p>
            )}
            {str(theme.proof) && (
              <p className="mt-1 text-[11px] leading-relaxed">
                <span className="font-medium">Proof:</span> {String(theme.proof)}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* 9 · CoverageMap — "your brain is N% filled"                          */
/* ------------------------------------------------------------------ */

const CoverageMap: CatalogRenderer = (props, ctx) => {
  const bound = str(props.path) ? (resolvePointer(ctx.dataModel, String(props.path)) as Record<string, unknown> | undefined) : (props as Record<string, unknown>);
  const filled = typeof bound?.filled === "number" ? bound.filled : null;
  const total = typeof bound?.total === "number" ? bound.total : null;
  const gaps = Array.isArray(bound?.topGaps)
    ? (bound?.topGaps as unknown[]).filter((gap): gap is Record<string, unknown> => gap !== null && typeof gap === "object")
    : [];
  if (filled === null || total === null || total === 0) {
    return <RejectedComponent name="CoverageMap" reason="coverage not computed yet" soft />;
  }
  const pct = Math.round((filled / total) * 100);
  return (
    <div className="rounded-md border border-border bg-card px-3 py-2.5">
      <div className="flex items-center justify-between gap-2 text-xs">
        <p className="font-semibold">Business brain coverage</p>
        <p className="tabular-nums text-muted-foreground">{filled} of {total} slots · {pct}%</p>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
      </div>
      {gaps.length > 0 && (
        <ul className="mt-2 space-y-1">
          {gaps.slice(0, 3).map((gap, index) => (
            <li key={index} className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
              <span className="min-w-0 truncate">{str(gap.title) ?? str(gap.path) ?? "Unknown slot"}</span>
              <span className="shrink-0 text-[10px] uppercase tracking-wide">biggest gap{index === 0 ? "" : ` #${index + 1}`}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* 10 · ContradictionAlert                                              */
/* ------------------------------------------------------------------ */

const ContradictionAlert: CatalogRenderer = (props, ctx) => {
  const bound = str(props.path) ? (resolvePointer(ctx.dataModel, String(props.path)) as Record<string, unknown> | undefined) : (props as Record<string, unknown>);
  const record = bound && typeof bound.value === "object" && bound.value !== null ? (bound.value as Record<string, unknown>) : bound;
  const existing = record?.existing;
  const incoming = record?.incoming;
  const about = str(bound?.path)?.replace(/^contradiction\./, "") ?? str(props.about) ?? "a value";
  if (existing === undefined && incoming === undefined) {
    return <RejectedComponent name="ContradictionAlert" reason="no contradiction payload" soft />;
  }
  return (
    <div className="rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2.5 text-xs">
      <p className="flex items-center gap-1.5 font-semibold">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
        Sources disagree about {labelFromBrainPath(about)}
      </p>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <div className="min-w-0 rounded border border-border bg-card px-2.5 py-2">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Your value (kept)</p>
          <div className="mt-1 break-words text-[11px]">{renderValue(existing)}</div>
        </div>
        <div className="min-w-0 rounded border border-border bg-card px-2.5 py-2">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Research found</p>
          <div className="mt-1 break-words text-[11px]">{renderValue(incoming)}</div>
        </div>
      </div>
      <p className="mt-1.5 text-[11px] text-muted-foreground">
        Your value stays until you change it — edit the variable card to accept the research.
      </p>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Whitelist enforcement                                                */
/* ------------------------------------------------------------------ */

export function RejectedComponent({ name, reason, soft }: { name: string; reason: string; soft?: boolean }) {
  if (soft) {
    return (
      <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground">
        {name}: {reason}.
      </div>
    );
  }
  return (
    <div className="rounded-md border border-dashed border-border px-3 py-2 text-[11px] text-muted-foreground">
      Unsupported component “{name}” was not rendered.
    </div>
  );
}

// The 10 catalog renderers — the dispatcher (A2uiSurface.tsx) assembles them
// into the whitelist map. Complete at 10; see README.md before adding one.
export {
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
export type { CatalogRenderer };
