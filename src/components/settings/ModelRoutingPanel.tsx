import { useState, useCallback } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Cpu, Loader2 } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type AgentProfile = Database["public"]["Tables"]["agent_profiles"]["Row"];

/**
 * Model Routing configuration
 *
 * Displays the model_route_key assigned to each agent profile.
 * Users can change the route for each agent — routes map to provider+model
 * combinations (e.g. "premium" = Opus/GPT-4, "standard" = Sonnet/GPT-4-mini,
 * "economy" = Haiku/GPT-4-mini, "local" = Ollama).
 *
 * Data source: `agent_profiles` table.
 */

const MODEL_ROUTES = [
  {
    value: "premium",
    label: "Premium",
    description: "Highest capability (Opus / GPT-4 / Gemini Pro)",
    color: "bg-primary/10 text-primary border-primary/20",
  },
  {
    value: "standard",
    label: "Standard",
    description: "Balanced quality + cost (Sonnet / GPT-4-mini)",
    color: "bg-success/10 text-success border-success/20",
  },
  {
    value: "economy",
    label: "Economy",
    description: "Fast + cheap (Haiku / GPT-4-mini)",
    color: "bg-muted text-muted-foreground border-border",
  },
  {
    value: "local",
    label: "Local",
    description: "Self-hosted (Ollama / vLLM)",
    color: "bg-warning/10 text-warning border-warning/20",
  },
] as const;

export function ModelRoutingPanel({ accountId }: { accountId: string }) {
  const { toast } = useToast();
  const [agents, setAgents] = useState<AgentProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [updating, setUpdating] = useState<string | null>(null);

  const fetchAgents = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("agent_profiles")
        .select(
          "id, agent_key, display_name, agent_type, model_route_key, status, assigned_sections"
        )
        .eq("account_id", accountId)
        .order("agent_type", { ascending: true })
        .order("display_name", { ascending: true });

      if (error) throw error;
      setAgents((data ?? []) as unknown as AgentProfile[]);
    } catch (err) {
      toast({
        title: "Failed to load agent profiles",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
      setAgents([]);
    } finally {
      setLoading(false);
    }
  }, [accountId, toast]);

  const handleRouteChange = async (agentId: string, newRoute: string) => {
    setUpdating(agentId);
    try {
      const { error } = await supabase
        .from("agent_profiles")
        .update({ model_route_key: newRoute })
        .eq("id", agentId);

      if (error) throw error;

      setAgents((prev) =>
        prev.map((a) =>
          a.id === agentId ? { ...a, model_route_key: newRoute } : a
        )
      );

      toast({
        title: "Route updated",
        description: `Model route changed to ${newRoute}.`,
      });
    } catch (err) {
      toast({
        title: "Failed to update route",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setUpdating(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-medium flex items-center gap-2">
          <Cpu className="h-4 w-4" />
          Model Routing
        </CardTitle>
        <CardDescription>
          Assign model routes to each agent. Routes map to provider+model
          tiers — premium for high-stakes analysis, economy for routine tasks.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Route legend */}
        <div className="flex flex-wrap gap-2">
          {MODEL_ROUTES.map((route) => (
            <Badge
              key={route.value}
              variant="outline"
              className={`text-xs ${route.color}`}
            >
              {route.label}: {route.description}
            </Badge>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : agents.length === 0 ? (
          <div className="py-8 text-center">
            <Cpu className="h-8 w-8 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">
              No agent profiles found. Agent profiles are seeded during
              workspace initialization.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={fetchAgents}
            >
              Retry
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            {agents.map((agent) => {
              const route = MODEL_ROUTES.find(
                (r) => r.value === agent.model_route_key
              );
              return (
                <div
                  key={agent.id}
                  className="flex items-center justify-between gap-3 rounded-lg border p-3"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium">{agent.display_name}</p>
                      <Badge variant="secondary" className="text-xs">
                        {agent.agent_type}
                      </Badge>
                      {agent.assigned_sections &&
                        agent.assigned_sections.length > 0 && (
                          <Badge variant="outline" className="text-xs">
                            {agent.assigned_sections.length} section
                            {agent.assigned_sections.length > 1 ? "s" : ""}
                          </Badge>
                        )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 font-mono">
                      {agent.agent_key}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {updating === agent.id && (
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    )}
                    <Select
                      value={agent.model_route_key ?? undefined}
                      onValueChange={(v) => handleRouteChange(agent.id, v)}
                      disabled={updating === agent.id}
                    >
                      <SelectTrigger className="w-32 h-8 text-xs">
                        <SelectValue placeholder="Unassigned" />
                      </SelectTrigger>
                      <SelectContent>
                        {MODEL_ROUTES.map((r) => (
                          <SelectItem key={r.value} value={r.value} className="text-xs">
                            {r.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
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
