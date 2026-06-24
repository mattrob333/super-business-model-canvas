import { useState, useCallback, useEffect } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Cpu, Activity, Loader2, Save, RotateCcw } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { supabase } from "@/integrations/supabase/client";
import {
  getAgentRuntime,
  DEFAULT_RUNTIME_CONFIG,
  getRuntimeMode,
  getRuntimeModeLabel,
  type RuntimeConfig,
} from "@/lib/agent-runtime";

/**
 * Hermes Runtime configuration panel
 *
 * Displays and edits the AgentRuntime configuration. This is the interface
 * boundary between the app and Hermes — the app never calls Hermes directly.
 *
 * Shows:
 * - Current active run count
 * - Concurrency limits
 * - Execution timeout
 * - Logging verbosity
 * - Agent lifecycle policy
 * - Sandbox toggle
 */
export function HermesRuntimePanel({ accountId }: { accountId: string }) {
  const { toast } = useToast();
  const [config, setConfig] = useState<RuntimeConfig>(DEFAULT_RUNTIME_CONFIG);
  const [activeRuns, setActiveRuns] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const runtime = getAgentRuntime(accountId);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      // Load persisted config from accounts table
      const { data: account } = await supabase
        .from("accounts")
        .select("runtime_config")
        .eq("id", accountId)
        .maybeSingle();

      const persistedConfig = (account as { runtime_config: unknown } | null)?.runtime_config;
      if (persistedConfig && typeof persistedConfig === "object" && !Array.isArray(persistedConfig)) {
        const merged = { ...DEFAULT_RUNTIME_CONFIG, ...(persistedConfig as Partial<RuntimeConfig>) };
        setConfig(merged);
        // Also update the in-memory runtime
        await runtime.updateConfig(merged);
      } else {
        setConfig(runtime.getConfig());
      }
      const count = await runtime.getActiveRunCount();
      setActiveRuns(count);
    } catch (err) {
      console.error("Failed to load runtime config:", err);
      setConfig(runtime.getConfig());
    } finally {
      setLoading(false);
    }
  }, [runtime, accountId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Poll active run count every 10s
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const count = await runtime.getActiveRunCount();
        setActiveRuns(count);
      } catch {
        // Silent fail on poll
      }
    }, 10000);
    return () => clearInterval(interval);
  }, [runtime]);

  const handleSave = async () => {
    setSaving(true);
    try {
      // Update in-memory runtime
      const { success } = await runtime.updateConfig(config);
      if (!success) throw new Error("Runtime rejected configuration");

      // Persist to accounts table
      const { error: updateError } = await supabase
        .from("accounts")
        .update({ runtime_config: config as unknown as Record<string, unknown> })
        .eq("id", accountId);

      if (updateError) throw new Error(`Failed to persist: ${updateError.message}`);

      toast({
        title: "Runtime configuration saved",
        description: "Changes will apply to new agent runs.",
      });
    } catch (err) {
      toast({
        title: "Failed to save",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setConfig(DEFAULT_RUNTIME_CONFIG);
    toast({
      title: "Configuration reset",
      description: "Defaults restored. Save to apply.",
    });
  };

  return (
    <div className="space-y-6">
      {/* Runtime status */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <Cpu className="h-4 w-4" />
            Hermes Runtime Status
          </CardTitle>
          <CardDescription>
            The AgentRuntime interface boundary manages agent execution lifecycle.
            The app never calls Hermes directly — all operations go through this layer.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="rounded-lg border p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <Activity className="h-3 w-3 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">Active Runs</p>
              </div>
              <p className="text-2xl font-semibold">
                {loading ? (
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                ) : (
                  activeRuns
                )}
              </p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground mb-1">Max Concurrent</p>
              <p className="text-2xl font-semibold">{config.maxConcurrentRuns}</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground mb-1">Timeout</p>
              <p className="text-2xl font-semibold">
                {config.executionTimeoutMinutes}
                <span className="text-sm font-normal text-muted-foreground ml-1">min</span>
              </p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground mb-1">Mode</p>
              <Badge variant={getRuntimeMode() === "live" ? "default" : "outline"} className="text-xs">
                {getRuntimeModeLabel()}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">
            Runtime Configuration
          </CardTitle>
          <CardDescription>
            Configure execution parameters for agent runs.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Concurrency */}
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <Label className="text-sm">Max Concurrent Runs</Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                Maximum number of agents executing simultaneously.
              </p>
            </div>
            <Input
              type="number"
              min={1}
              max={20}
              className="w-20"
              value={config.maxConcurrentRuns}
              onChange={(e) =>
                setConfig((prev) => ({
                  ...prev,
                  maxConcurrentRuns: Math.max(1, Math.min(20, Number(e.target.value) || 1)),
                }))
              }
            />
          </div>

          {/* Timeout */}
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <Label className="text-sm">Execution Timeout (minutes)</Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                Runs exceeding this duration are automatically cancelled.
              </p>
            </div>
            <Input
              type="number"
              min={1}
              max={120}
              className="w-20"
              value={config.executionTimeoutMinutes}
              onChange={(e) =>
                setConfig((prev) => ({
                  ...prev,
                  executionTimeoutMinutes: Math.max(1, Math.min(120, Number(e.target.value) || 1)),
                }))
              }
            />
          </div>

          {/* Logging verbosity */}
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <Label className="text-sm">Logging Verbosity</Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                Controls detail level of agent run logs.
              </p>
            </div>
            <Select
              value={config.loggingVerbosity}
              onValueChange={(v) =>
                setConfig((prev) => ({
                  ...prev,
                  loggingVerbosity: v as RuntimeConfig["loggingVerbosity"],
                }))
              }
            >
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="minimal">Minimal</SelectItem>
                <SelectItem value="normal">Normal</SelectItem>
                <SelectItem value="verbose">Verbose</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Lifecycle policy */}
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <Label className="text-sm">Agent Lifecycle Policy</Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                Behavior when an agent run fails.
              </p>
            </div>
            <Select
              value={config.agentLifecyclePolicy}
              onValueChange={(v) =>
                setConfig((prev) => ({
                  ...prev,
                  agentLifecyclePolicy: v as RuntimeConfig["agentLifecyclePolicy"],
                }))
              }
            >
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="stop_on_failure">Stop on failure</SelectItem>
                <SelectItem value="restart_on_failure">Restart on failure</SelectItem>
                <SelectItem value="continue_on_failure">Continue on failure</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Sandbox */}
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <Label className="text-sm">Execution Sandbox</Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                Isolate agent execution in a sandboxed environment.
              </p>
            </div>
            <Switch
              checked={config.sandboxEnabled}
              onCheckedChange={(checked) =>
                setConfig((prev) => ({ ...prev, sandboxEnabled: checked }))
              }
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t">
            <Button variant="outline" size="sm" onClick={handleReset} className="gap-2">
              <RotateCcw className="h-4 w-4" />
              Reset
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving} className="gap-2">
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Save Configuration
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
