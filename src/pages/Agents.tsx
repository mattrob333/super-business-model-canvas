import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Bot, Plus, Clock, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";

/**
 * Agents page (/agents)
 *
 * Shows the agent registry — the 10 default agent profiles (orchestrator + 9
 * BMC section agents) plus any custom agents. Also shows recent agent runs.
 *
 * Data source: `agent_profiles` + `agent_runs` tables (Phase 2 schema).
 * Currently shows static registry from seed migration + empty state for runs.
 */

interface AgentProfile {
  id: string;
  agent_key: string;
  display_name: string;
  agent_type: string;
  description: string | null;
  assigned_sections: string[];
  status: string;
  model_route_key: string | null;
}

// Static agent registry — matches the seed migration
const DEFAULT_AGENTS: AgentProfile[] = [
  {
    id: "static-orchestrator",
    agent_key: "orchestrator",
    display_name: "Strategy Orchestrator",
    agent_type: "orchestrator",
    description:
      "Coordinates multi-agent analysis, routes tasks to section agents, and synthesizes cross-section insights.",
    assigned_sections: [],
    status: "active",
    model_route_key: "premium",
  },
  {
    id: "static-key-partnerships",
    agent_key: "agent_key_partnerships",
    display_name: "Key Partnerships Agent",
    agent_type: "section_agent",
    description:
      "Analyzes strategic alliances, supplier relationships, and partnership networks.",
    assigned_sections: ["key_partners"],
    status: "active",
    model_route_key: "standard",
  },
  {
    id: "static-key-activities",
    agent_key: "agent_key_activities",
    display_name: "Key Activities Agent",
    agent_type: "section_agent",
    description:
      "Evaluates core operational activities, production processes, and critical workflows.",
    assigned_sections: ["key_activities"],
    status: "active",
    model_route_key: "standard",
  },
  {
    id: "static-key-resources",
    agent_key: "agent_key_resources",
    display_name: "Key Resources Agent",
    agent_type: "section_agent",
    description:
      "Assesses intellectual, human, financial, and physical resource assets.",
    assigned_sections: ["key_resources"],
    status: "active",
    model_route_key: "standard",
  },
  {
    id: "static-value-propositions",
    agent_key: "agent_value_propositions",
    display_name: "Value Propositions Agent",
    agent_type: "section_agent",
    description:
      "Refines and validates value propositions against customer needs and competitive alternatives.",
    assigned_sections: ["value_propositions"],
    status: "active",
    model_route_key: "premium",
  },
  {
    id: "static-customer-relationships",
    agent_key: "agent_customer_relationships",
    display_name: "Customer Relationships Agent",
    agent_type: "section_agent",
    description:
      "Analyzes engagement strategies, retention mechanisms, and relationship-building approaches.",
    assigned_sections: ["customer_relationships"],
    status: "active",
    model_route_key: "standard",
  },
  {
    id: "static-channels",
    agent_key: "agent_channels",
    display_name: "Channels Agent",
    agent_type: "section_agent",
    description:
      "Maps distribution channels, touchpoints, and delivery methods.",
    assigned_sections: ["channels"],
    status: "active",
    model_route_key: "standard",
  },
  {
    id: "static-customer-segments",
    agent_key: "agent_customer_segments",
    display_name: "Customer Segments Agent",
    agent_type: "section_agent",
    description:
      "Identifies and profiles target customer segments and personas.",
    assigned_sections: ["customer_segments"],
    status: "active",
    model_route_key: "premium",
  },
  {
    id: "static-cost-structure",
    agent_key: "agent_cost_structure",
    display_name: "Cost Structure Agent",
    agent_type: "section_agent",
    description:
      "Breaks down fixed and variable costs, cost drivers, and efficiency opportunities.",
    assigned_sections: ["cost_structure"],
    status: "active",
    model_route_key: "standard",
  },
  {
    id: "static-revenue-streams",
    agent_key: "agent_revenue_streams",
    display_name: "Revenue Streams Agent",
    agent_type: "section_agent",
    description:
      "Analyzes pricing models, revenue sources, and monetization strategies.",
    assigned_sections: ["revenue_streams"],
    status: "active",
    model_route_key: "premium",
  },
];

const STATUS_CONFIG: Record<string, { label: string; className: string; icon: typeof Bot }> = {
  active: { label: "Active", className: "bg-success/10 text-success", icon: CheckCircle2 },
  paused: { label: "Paused", className: "bg-warning/10 text-warning", icon: Clock },
  draft: { label: "Draft", className: "bg-muted text-muted-foreground", icon: AlertCircle },
  archived: { label: "Archived", className: "bg-muted/50 text-muted-foreground", icon: AlertCircle },
};

export default function Agents() {
  const [agents] = useState<AgentProfile[]>(DEFAULT_AGENTS);

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Page heading */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Agents</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Agent registry — 10 default BMC section agents plus custom agents.
            Each agent owns canvas sections, runs analysis, and produces
            evidence-backed claims.
          </p>
        </div>
        <Button variant="outline" size="sm" className="gap-2">
          <Plus className="h-4 w-4" />
          New Agent
        </Button>
      </div>

      {/* Agent grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {agents.map((agent) => {
          const statusCfg = STATUS_CONFIG[agent.status] ?? STATUS_CONFIG.active;
          return (
            <Card key={agent.id}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <Bot className="h-4 w-4 text-primary" />
                    </div>
                    <CardTitle className="text-sm font-medium truncate">
                      {agent.display_name}
                    </CardTitle>
                  </div>
                  <Badge
                    variant="outline"
                    className={`text-xs shrink-0 ${statusCfg.className}`}
                  >
                    <statusCfg.icon className="h-2.5 w-2.5 mr-1" />
                    {statusCfg.label}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                {agent.description && (
                  <p className="text-xs text-muted-foreground mb-3 line-clamp-3">
                    {agent.description}
                  </p>
                )}
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="secondary" className="text-xs">
                    {agent.agent_type}
                  </Badge>
                  {agent.model_route_key && (
                    <Badge variant="outline" className="text-xs">
                      Model: {agent.model_route_key}
                    </Badge>
                  )}
                  {agent.assigned_sections.length > 0 && (
                    <Badge variant="outline" className="text-xs">
                      {agent.assigned_sections.length} section
                      {agent.assigned_sections.length > 1 ? "s" : ""}
                    </Badge>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Recent runs placeholder */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Loader2 className="h-4 w-4 text-muted-foreground" />
            Recent Agent Runs
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="py-8 text-center">
            <Bot className="h-8 w-8 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">
              No agent runs yet. Runs will appear here when agents execute
              analysis tasks.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
