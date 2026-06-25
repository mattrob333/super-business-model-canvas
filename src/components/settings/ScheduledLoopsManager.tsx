import { useState, useCallback } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Clock,
  Plus,
  Loader2,
  Play,
  Pause,
  Trash2,
  Calendar,
  Zap,
} from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type ScheduledLoop = Database["public"]["Tables"]["scheduled_loops"]["Row"];
type LoopStatus = Database["public"]["Enums"]["loop_status"];

/**
 * Scheduled Loops Manager
 *
 * Lists recurring agent execution schedules from the `scheduled_loops` table.
 * Users can create, pause/resume, and delete scheduled loops.
 *
 * Data source: `scheduled_loops` table.
 */

const STATUS_CONFIG: Record<
  LoopStatus,
  { label: string; className: string; icon: typeof Play }
> = {
  active: {
    label: "Active",
    className: "bg-success/10 text-success border-success/20",
    icon: Play,
  },
  paused: {
    label: "Paused",
    className: "bg-warning/10 text-warning border-warning/20",
    icon: Pause,
  },
  error: {
    label: "Error",
    className: "bg-destructive/10 text-destructive border-destructive/20",
    icon: Pause,
  },
  exhausted_budget: {
    label: "Budget Exhausted",
    className: "bg-muted text-muted-foreground border-border",
    icon: Pause,
  },
  exhausted_failures: {
    label: "Failure Limit",
    className: "bg-muted text-muted-foreground border-border",
    icon: Pause,
  },
};

const SCHEDULE_PRESETS = [
  { value: "0 */6 * * *", label: "Every 6 hours" },
  { value: "0 0 * * *", label: "Daily at midnight" },
  { value: "0 9 * * 1", label: "Weekly Monday 9am" },
  { value: "0 0 1 * *", label: "Monthly 1st" },
] as const;

export function ScheduledLoopsManager({ accountId }: { accountId: string }) {
  const { toast } = useToast();
  const [loops, setLoops] = useState<ScheduledLoop[]>([]);
  const [loading, setLoading] = useState(false);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState<string | null>(null);
  const [runningNow, setRunningNow] = useState<string | null>(null);

  // Add form state
  const [newLoopName, setNewLoopName] = useState("");
  const [newAgentProfileId, setNewAgentProfileId] = useState("");
  const [newSchedule, setNewSchedule] = useState("0 0 * * *");
  const [newMaxRuntime, setNewMaxRuntime] = useState(30);
  const [newMonthlyBudget, setNewMonthlyBudget] = useState(10);
  const [agentProfiles, setAgentProfiles] = useState<
    { id: string; display_name: string; agent_key: string }[]
  >([]);

  const fetchLoops = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("scheduled_loops")
        .select("*")
        .eq("account_id", accountId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setLoops((data ?? []) as unknown as ScheduledLoop[]);

      // Also fetch agent profiles for the dropdown
      const { data: profiles, error: profilesError } = await supabase
        .from("agent_profiles")
        .select("id, display_name, agent_key")
        .eq("account_id", accountId)
        .order("display_name", { ascending: true });

      if (!profilesError && profiles) {
        setAgentProfiles(
          profiles as unknown as { id: string; display_name: string; agent_key: string }[]
        );
      }
    } catch (err) {
      toast({
        title: "Failed to load schedules",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
      setLoops([]);
    } finally {
      setLoading(false);
    }
  }, [accountId, toast]);

  const handleAdd = async () => {
    if (!newLoopName || !newAgentProfileId) {
      toast({
        title: "Missing fields",
        description: "Loop name and agent profile are required.",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase.from("scheduled_loops").insert({
        account_id: accountId,
        agent_profile_id: newAgentProfileId,
        loop_name: newLoopName,
        schedule: newSchedule,
        max_runtime_minutes: newMaxRuntime,
        max_consecutive_failures: 3,
        monthly_budget: newMonthlyBudget,
        allowed_mcp_server_ids: [],
        skill_ids: [],
        prompt_template: null,
        status: "paused",
        failure_count: 0,
      });

      if (error) throw error;

      toast({
        title: "Schedule created",
        description: `${newLoopName} has been created (paused). Activate it to begin execution.`,
      });

      setNewLoopName("");
      setNewAgentProfileId("");
      setNewSchedule("0 0 * * *");
      setNewMaxRuntime(30);
      setNewMonthlyBudget(10);
      setAddDialogOpen(false);
      void fetchLoops();
    } catch (err) {
      toast({
        title: "Failed to create schedule",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (loop: ScheduledLoop) => {
    setToggling(loop.id);
    try {
      const newStatus: LoopStatus =
        loop.status === "active" ? "paused" : "active";

      const { error } = await supabase
        .from("scheduled_loops")
        .update({ status: newStatus })
        .eq("id", loop.id);

      if (error) throw error;

      setLoops((prev) =>
        prev.map((l) => (l.id === loop.id ? { ...l, status: newStatus } : l))
      );

      toast({
        title: newStatus === "active" ? "Schedule activated" : "Schedule paused",
        description: `${loop.loop_name} is now ${newStatus}.`,
      });
    } catch (err) {
      toast({
        title: "Failed to toggle",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setToggling(null);
    }
  };

  const handleDelete = async (loop: ScheduledLoop) => {
    try {
      const { error } = await supabase
        .from("scheduled_loops")
        .delete()
        .eq("id", loop.id);

      if (error) throw error;

      toast({
        title: "Schedule deleted",
        description: `${loop.loop_name} has been removed.`,
      });
      void fetchLoops();
    } catch (err) {
      toast({
        title: "Failed to delete",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    }
  };

  const handleRunNow = async (loop: ScheduledLoop) => {
    setRunningNow(loop.id);
    try {
      const { data, error } = await supabase.functions.invoke(
        "scheduled-loop-tick",
        { body: { loopId: loop.id } },
      );

      if (error) throw error;

      if (data?.success) {
        toast({
          title: "Loop executed",
          description: data.message || `${loop.loop_name} ran successfully.`,
        });
        void fetchLoops();
      } else {
        throw new Error(data?.error || "Execution failed");
      }
    } catch (err) {
      toast({
        title: "Loop execution failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setRunningNow(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-medium flex items-center gap-2">
          <Clock className="h-4 w-4" />
          Scheduled Loops
        </CardTitle>
        <CardDescription>
          Configure recurring agent execution schedules. Loops run automatically
          on a cron schedule, with budget and failure limits for safety.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {loops.length} schedule{loops.length !== 1 ? "s" : ""} configured
          </p>
          <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
            <DialogTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={fetchLoops}
              >
                <Plus className="h-4 w-4" />
                New Schedule
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Create Scheduled Loop</DialogTitle>
                <DialogDescription>
                  Set up a recurring agent execution. New schedules start
                  paused — activate after configuration.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <Label htmlFor="loop-name">Loop Name</Label>
                  <Input
                    id="loop-name"
                    placeholder="e.g. Daily Canvas Refresh"
                    value={newLoopName}
                    onChange={(e) => setNewLoopName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="loop-agent">Agent</Label>
                  <Select
                    value={newAgentProfileId}
                    onValueChange={setNewAgentProfileId}
                  >
                    <SelectTrigger id="loop-agent">
                      <SelectValue placeholder="Select agent" />
                    </SelectTrigger>
                    <SelectContent>
                      {agentProfiles.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.display_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="loop-schedule">Schedule (cron)</Label>
                  <Select value={newSchedule} onValueChange={setNewSchedule}>
                    <SelectTrigger id="loop-schedule">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SCHEDULE_PRESETS.map((preset) => (
                        <SelectItem key={preset.value} value={preset.value}>
                          {preset.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground font-mono">
                    {newSchedule}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="loop-runtime">Max Runtime (min)</Label>
                    <Input
                      id="loop-runtime"
                      type="number"
                      min={1}
                      max={120}
                      value={newMaxRuntime}
                      onChange={(e) =>
                        setNewMaxRuntime(Number(e.target.value) || 30)
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="loop-budget">Monthly Budget ($)</Label>
                    <Input
                      id="loop-budget"
                      type="number"
                      min={0}
                      step={0.5}
                      value={newMonthlyBudget}
                      onChange={(e) =>
                        setNewMonthlyBudget(Number(e.target.value) || 0)
                      }
                    />
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setAddDialogOpen(false)}
                  disabled={saving}
                >
                  Cancel
                </Button>
                <Button onClick={handleAdd} disabled={saving}>
                  {saving ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    "Create Schedule"
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : loops.length === 0 ? (
          <div className="py-8 text-center">
            <Calendar className="h-8 w-8 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">
              No scheduled loops configured. Create one to automate recurring
              agent analysis.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {loops.map((loop) => {
              const statusCfg =
                STATUS_CONFIG[loop.status] ?? STATUS_CONFIG.paused;
              return (
                <div
                  key={loop.id}
                  className="flex items-center justify-between gap-3 rounded-lg border p-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-9 w-9 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                      <Clock className="h-4 w-4 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium">{loop.loop_name}</p>
                        <Badge
                          variant="outline"
                          className={`text-xs ${statusCfg.className}`}
                        >
                          <statusCfg.icon className="h-2.5 w-2.5 mr-1" />
                          {statusCfg.label}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        <span className="font-mono">{loop.schedule}</span>
                        {loop.last_run_at && (
                          <span>
                            {" "}· last: {new Date(loop.last_run_at).toLocaleString()}
                          </span>
                        )}
                        {loop.failure_count > 0 && (
                          <span className="text-destructive">
                            {" "}· {loop.failure_count} failures
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 gap-1.5 text-xs"
                      disabled={runningNow === loop.id}
                      onClick={() => handleRunNow(loop)}
                      title="Run this loop now"
                    >
                      {runningNow === loop.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Zap className="h-3.5 w-3.5" />
                      )}
                      <span className="hidden sm:inline">Run Now</span>
                    </Button>
                    <Switch
                      checked={loop.status === "active"}
                      onCheckedChange={() => handleToggle(loop)}
                      disabled={toggling === loop.id}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      title="Delete"
                      aria-label={`Delete ${loop.loop_name}`}
                      onClick={() => handleDelete(loop)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
