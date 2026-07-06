import { useCallback, useEffect, useMemo, useState } from "react";
import { History, Loader2, RotateCcw, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { supabaseUntyped } from "@/lib/supabase-untyped";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";

interface AgentProfileSettings {
  system_instructions: string | null;
  behavior: Json;
  model_route_key: string | null;
  account_id: string | null;
}

interface ModelRoute {
  route_key: string;
  label: string;
  provider: string;
  model_name: string;
}

interface ProfileRevision {
  id: string;
  system_instructions: string | null;
  behavior: Json;
  changed_by: string | null;
  created_at: string;
}

type BehaviorDraft = {
  proactivity: number;
  risk: number;
  verbosity: number;
  evidence_bar: number;
};

const DEFAULT_BEHAVIOR: BehaviorDraft = {
  proactivity: 50,
  risk: 35,
  verbosity: 50,
  evidence_bar: 75,
};

const MODEL_SELECT_NONE = "__default__";

function coerceSlider(value: unknown, fallback: number): number {
  if (typeof value !== "number" || Number.isNaN(value)) return fallback;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function parseBehavior(value: Json): BehaviorDraft {
  const record = value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
  return {
    proactivity: coerceSlider(record.proactivity, DEFAULT_BEHAVIOR.proactivity),
    risk: coerceSlider(record.risk, DEFAULT_BEHAVIOR.risk),
    verbosity: coerceSlider(record.verbosity, DEFAULT_BEHAVIOR.verbosity),
    evidence_bar: coerceSlider(record.evidence_bar, DEFAULT_BEHAVIOR.evidence_bar),
  };
}

function behaviorToJson(behavior: BehaviorDraft): Json {
  return {
    proactivity: behavior.proactivity,
    risk: behavior.risk,
    verbosity: behavior.verbosity,
    evidence_bar: behavior.evidence_bar,
  };
}

export function AgentSettingsSheet({
  open,
  onOpenChange,
  accountId,
  agentProfileId,
  callsign,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accountId: string;
  agentProfileId: string;
  callsign: string;
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState<AgentProfileSettings | null>(null);
  const [instructions, setInstructions] = useState("");
  const [behavior, setBehavior] = useState<BehaviorDraft>(DEFAULT_BEHAVIOR);
  const [modelRouteKey, setModelRouteKey] = useState<string>(MODEL_SELECT_NONE);
  const [routes, setRoutes] = useState<ModelRoute[]>([]);
  const [revisions, setRevisions] = useState<ProfileRevision[]>([]);

  const load = useCallback(async () => {
    if (!open) return;
    setLoading(true);
    try {
      const [profileRes, routeRes, revisionRes] = await Promise.all([
        supabase
          .from("agent_profiles")
          .select("system_instructions, behavior, model_route_key, account_id")
          .eq("id", agentProfileId)
          .single(),
        supabase
          .from("model_routes")
          .select("route_key, label, provider, model_name")
          .or(`account_id.eq.${accountId},account_id.is.null`)
          .order("provider", { ascending: true })
          .order("label", { ascending: true }),
        supabaseUntyped
          .from<ProfileRevision>("agent_profile_revisions")
          .select("id, system_instructions, behavior, changed_by, created_at")
          .eq("agent_profile_id", agentProfileId)
          .order("created_at", { ascending: false })
          .limit(10),
      ]);
      if (profileRes.error || !profileRes.data) throw profileRes.error ?? new Error("Profile not found");
      setProfile(profileRes.data);
      setInstructions(profileRes.data.system_instructions ?? "");
      setBehavior(parseBehavior(profileRes.data.behavior));
      setModelRouteKey(profileRes.data.model_route_key ?? MODEL_SELECT_NONE);
      setRoutes(routeRes.error ? [] : routeRes.data ?? []);
      setRevisions(revisionRes.error ? [] : revisionRes.data ?? []);
    } catch (error) {
      toast({
        title: "Could not load settings",
        description: error instanceof Error ? error.message : "Try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [accountId, agentProfileId, open, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const pruneRevisions = useCallback(async () => {
    const { data } = await supabaseUntyped
      .from<{ id: string }>("agent_profile_revisions")
      .select("id")
      .eq("agent_profile_id", agentProfileId)
      .order("created_at", { ascending: false })
      .range(10, 100);
    const oldIds = data?.map((row) => row.id) ?? [];
    if (oldIds.length > 0) {
      await supabaseUntyped.from("agent_profile_revisions").delete().in("id", oldIds);
    }
  }, [agentProfileId]);

  const saveSettings = useCallback(async () => {
    setSaving(true);
    try {
      const nextBehavior = behaviorToJson(behavior);
      const nextInstructions = instructions.trim() || null;
      // Explicit account scope + select-back: RLS silently matches zero rows
      // on a profile this account cannot edit (e.g. the shared template), and
      // a save that changed nothing must not report success.
      const { data: updated, error: profileError } = await supabase
        .from("agent_profiles")
        .update({
          system_instructions: nextInstructions,
          behavior: nextBehavior,
          model_route_key: modelRouteKey === MODEL_SELECT_NONE ? null : modelRouteKey,
        })
        .eq("id", agentProfileId)
        .eq("account_id", accountId)
        .select("id");
      if (profileError) throw profileError;
      if (!updated || updated.length === 0) {
        throw new Error("This agent profile is not editable by your account.");
      }

      const { error: revisionError } = await supabaseUntyped.from("agent_profile_revisions").insert({
        agent_profile_id: agentProfileId,
        system_instructions: nextInstructions,
        behavior: nextBehavior,
        changed_by: user?.id ?? null,
      });
      if (revisionError) throw revisionError;
      await pruneRevisions();
      toast({ title: "Settings saved", description: "Changes take effect on the next run." });
      await load();
    } catch (error) {
      toast({
        title: "Could not save settings",
        description: error instanceof Error ? error.message : "Try again.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }, [accountId, agentProfileId, behavior, instructions, load, modelRouteKey, pruneRevisions, toast, user]);

  const restoreRevision = useCallback(async (revision: ProfileRevision) => {
    setSaving(true);
    try {
      const { data: updated, error: profileError } = await supabase
        .from("agent_profiles")
        .update({
          system_instructions: revision.system_instructions,
          behavior: revision.behavior,
        })
        .eq("id", agentProfileId)
        .eq("account_id", accountId)
        .select("id");
      if (profileError) throw profileError;
      if (!updated || updated.length === 0) {
        throw new Error("This agent profile is not editable by your account.");
      }

      const { error: revisionError } = await supabaseUntyped.from("agent_profile_revisions").insert({
        agent_profile_id: agentProfileId,
        system_instructions: revision.system_instructions,
        behavior: revision.behavior,
        changed_by: user?.id ?? null,
      });
      if (revisionError) throw revisionError;
      await pruneRevisions();
      toast({ title: "Revision restored", description: "Changes take effect on the next run." });
      await load();
    } catch (error) {
      toast({
        title: "Could not restore revision",
        description: error instanceof Error ? error.message : "Try again.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }, [accountId, agentProfileId, load, pruneRevisions, toast, user]);

  const selectedRouteLabel = useMemo(() => {
    if (!profile?.model_route_key) return "Default routing";
    const route = routes.find((entry) => entry.route_key === profile.model_route_key);
    return route ? `${route.label} (${route.provider})` : profile.model_route_key;
  }, [profile, routes]);

  // Accounts without provisioned per-account profiles resolve to the shared
  // global template (account_id null) — that row is read-only by design.
  const isSharedTemplate = profile !== null && profile.account_id === null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col overflow-hidden p-0 sm:max-w-xl">
        <SheetHeader className="border-b border-border px-5 py-4 pr-12">
          <SheetTitle>{callsign} settings</SheetTitle>
          <SheetDescription>
            Tune the agent prompt, behavior, and model route. Changes take effect on the next run.
          </SheetDescription>
        </SheetHeader>

        {loading ? (
          <div className="flex flex-1 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5">
            <section className="space-y-2">
              <Label htmlFor="agent-system-instructions">System instructions</Label>
              <Textarea
                id="agent-system-instructions"
                value={instructions}
                onChange={(event) => setInstructions(event.target.value)}
                placeholder="Write the standing instructions this agent should follow..."
                className="min-h-[180px] text-sm"
              />
            </section>

            <section className="space-y-3">
              <div>
                <h3 className="text-sm font-semibold">Behavior</h3>
                <p className="text-xs text-muted-foreground">Adjust the posture without changing the agent's job.</p>
              </div>
              <BehaviorSlider label="Proactivity" value={behavior.proactivity} onChange={(value) => setBehavior((prev) => ({ ...prev, proactivity: value }))} />
              <BehaviorSlider label="Risk" value={behavior.risk} onChange={(value) => setBehavior((prev) => ({ ...prev, risk: value }))} />
              <BehaviorSlider label="Verbosity" value={behavior.verbosity} onChange={(value) => setBehavior((prev) => ({ ...prev, verbosity: value }))} />
              <BehaviorSlider label="Evidence bar" value={behavior.evidence_bar} onChange={(value) => setBehavior((prev) => ({ ...prev, evidence_bar: value }))} />
            </section>

            <section className="space-y-2">
              <Label>Model route</Label>
              <Select value={modelRouteKey} onValueChange={setModelRouteKey}>
                <SelectTrigger>
                  <SelectValue placeholder="Default routing" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={MODEL_SELECT_NONE}>Default routing</SelectItem>
                  {routes.map((route) => (
                    <SelectItem key={route.route_key} value={route.route_key}>
                      {route.label} - {route.provider} / {route.model_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Current: {selectedRouteLabel}</p>
            </section>

            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <History className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold">Recent revisions</h3>
              </div>
              {revisions.length === 0 ? (
                <p className="text-xs text-muted-foreground">No saved revisions yet.</p>
              ) : (
                <ul className="space-y-2">
                  {revisions.map((revision) => (
                    <li key={revision.id} className="rounded-md border border-border/60 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-xs text-muted-foreground">
                          {new Date(revision.created_at).toLocaleString()}
                        </span>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 gap-1.5"
                          disabled={saving || isSharedTemplate}
                          onClick={() => void restoreRevision(revision)}
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                          Restore
                        </Button>
                      </div>
                      <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                        {revision.system_instructions || "No custom instructions"}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}

        <div className="border-t border-border p-4">
          {isSharedTemplate && (
            <p className="mb-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground" role="note">
              This agent currently runs on the shared template, which is read-only. Per-company
              settings unlock once this workspace&rsquo;s agent profiles are provisioned.
            </p>
          )}
          <Button
            className="w-full gap-2"
            disabled={saving || loading || isSharedTemplate}
            onClick={() => void saveSettings()}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save settings
          </Button>
          <p className="mt-2 text-center text-[11px] text-muted-foreground">
            Changes take effect on the next run.
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function BehaviorSlider({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="flex items-center justify-between text-xs">
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground">{value}</span>
      </span>
      <input
        type="range"
        min={0}
        max={100}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full accent-primary"
      />
    </label>
  );
}
